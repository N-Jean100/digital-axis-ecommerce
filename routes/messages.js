const express = require('express');
const mongoose = require('mongoose');
const { createHmac } = require('node:crypto');
const { GridFSBucket, ObjectId } = require('mongodb');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Product = require('../models/Product');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();
const MAX_VOICE_NOTE_BYTES = 5 * 1024 * 1024;
const MAX_VOICE_NOTE_SECONDS = 120;
const allowedAudioTypes = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']);

function getVoiceNoteBucket() {
  if (!mongoose.connection.db) {
    throw new Error('Database is not ready.');
  }
  return new GridFSBucket(mongoose.connection.db, { bucketName: 'voiceNotes' });
}

async function findParticipantConversation(conversationId, userId) {
  if (!mongoose.isValidObjectId(conversationId)) return null;
  return Conversation.findOne({
    _id: conversationId,
    $or: [{ customer: userId }, { vendor: userId }]
  });
}

function summarizeMessage(message) {
  return message.type === 'voice' ? 'Voice note' : message.text;
}

async function saveMessage(conversation, message) {
  conversation.lastMessage = summarizeMessage(message);
  conversation.lastMessageType = message.type;
  conversation.lastMessageAt = message.createdAt;
  await Promise.all([conversation.save(), message.populate('sender', 'name role')]);
  return message;
}

router.use(verifyToken);

router.get('/ice-config', (req, res) => {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  const urls = (process.env.TURN_URLS || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  const sharedSecret = process.env.TURN_SHARED_SECRET;

  if (urls.length && sharedSecret) {
    const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
    const username = `${expiresAt}:${req.auth.id}`;
    const credential = createHmac('sha1', sharedSecret).update(username).digest('base64');
    iceServers.push({ urls, username, credential });
  }

  return res.json({ iceServers });
});

router.get('/conversations', async (req, res) => {
  try {
    const conversations = await Conversation.find({
      $or: [{ customer: req.auth.id }, { vendor: req.auth.id }]
    })
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .populate('product', 'name image price')
      .populate('customer', 'name role')
      .populate('vendor', 'name role')
      .lean();

    return res.json(conversations.map((conversation) => ({
      ...conversation,
      otherParticipant: String(conversation.customer._id) === req.auth.id
        ? conversation.vendor
        : conversation.customer
    })));
  } catch (error) {
    console.error('Could not load conversations:', error.message);
    return res.status(500).json({ message: 'We could not load your conversations. Please try again.' });
  }
});

router.post('/conversations', async (req, res) => {
  if (req.auth.role !== 'customer') {
    return res.status(403).json({ message: 'Only customer accounts can start a product conversation.' });
  }
  const productId = typeof req.body?.productId === 'string' ? req.body.productId : '';
  if (!mongoose.isValidObjectId(productId)) {
    return res.status(400).json({ message: 'Choose a valid product to contact its seller.' });
  }

  try {
    const product = await Product.findById(productId).select('name vendor').lean();
    if (!product) {
      return res.status(404).json({ message: 'This product is no longer available.' });
    }
    if (String(product.vendor) === req.auth.id) {
      return res.status(400).json({ message: 'You cannot start a conversation with yourself.' });
    }

    let conversation;
    try {
      conversation = await Conversation.findOneAndUpdate(
        { customer: req.auth.id, vendor: product.vendor, product: product._id },
        { $setOnInsert: { lastMessage: '', lastMessageType: 'text', lastMessageAt: new Date() } },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      conversation = await Conversation.findOne({
        customer: req.auth.id,
        vendor: product.vendor,
        product: product._id
      });
    }

    return res.status(200).json({ conversation });
  } catch (error) {
    console.error('Could not start conversation:', error.message);
    return res.status(500).json({ message: 'We could not start this conversation. Please try again.' });
  }
});

router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const conversation = await findParticipantConversation(req.params.conversationId, req.auth.id);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }
    const messages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('sender', 'name role')
      .lean();
    return res.json(messages.reverse());
  } catch (error) {
    console.error('Could not load messages:', error.message);
    return res.status(500).json({ message: 'We could not load messages. Please try again.' });
  }
});

router.post('/conversations/:conversationId/messages', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text || text.length > 4000) {
    return res.status(400).json({ message: 'Message text must be between 1 and 4,000 characters.' });
  }

  try {
    const conversation = await findParticipantConversation(req.params.conversationId, req.auth.id);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }
    const message = await Message.create({
      conversation: conversation._id,
      sender: req.auth.id,
      type: 'text',
      text
    });
    return res.status(201).json({ message: await saveMessage(conversation, message) });
  } catch (error) {
    console.error('Could not send message:', error.message);
    return res.status(500).json({ message: 'We could not send your message. Please try again.' });
  }
});

router.post(
  '/conversations/:conversationId/voice-notes',
  express.raw({ type: [...allowedAudioTypes], limit: MAX_VOICE_NOTE_BYTES }),
  async (req, res) => {
    const contentType = req.is([...allowedAudioTypes]);
    if (!contentType) {
      return res.status(415).json({ message: 'Use a supported audio recording format.' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: 'The voice note is empty.' });
    }
    const duration = Number(req.get('X-Audio-Duration'));
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_VOICE_NOTE_SECONDS) {
      return res.status(400).json({ message: 'Voice notes must be 1 to 120 seconds long.' });
    }

    let uploadedFileId;
    try {
      const conversation = await findParticipantConversation(req.params.conversationId, req.auth.id);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found.' });
      }

      const bucket = getVoiceNoteBucket();
      const upload = bucket.openUploadStream(`voice-note-${Date.now()}`, {
        contentType,
        metadata: {
          conversationId: String(conversation._id),
          senderId: req.auth.id
        }
      });
      await pipeline(Readable.from(req.body), upload);
      uploadedFileId = upload.id;

      const message = await Message.create({
        conversation: conversation._id,
        sender: req.auth.id,
        type: 'voice',
        audioFileId: uploadedFileId,
        audioMimeType: contentType,
        audioDurationSeconds: duration
      });
      return res.status(201).json({ message: await saveMessage(conversation, message) });
    } catch (error) {
      if (uploadedFileId) {
        await getVoiceNoteBucket().delete(uploadedFileId).catch((deleteError) => {
          console.error('Could not remove unreferenced voice note:', deleteError.message);
        });
      }
      console.error('Could not save voice note:', error.message);
      return res.status(500).json({ message: 'We could not save your voice note. Please try again.' });
    }
  }
);

router.get('/messages/:messageId/voice-note', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.messageId)) {
    return res.status(404).json({ message: 'Voice note not found.' });
  }

  try {
    const message = await Message.findOne({
      _id: req.params.messageId,
      type: 'voice'
    }).select('conversation audioFileId audioMimeType');
    if (!message || !await findParticipantConversation(message.conversation, req.auth.id)) {
      return res.status(404).json({ message: 'Voice note not found.' });
    }

    const bucket = getVoiceNoteBucket();
    const [file] = await bucket.find({ _id: new ObjectId(message.audioFileId) }).limit(1).toArray();
    if (!file) {
      return res.status(404).json({ message: 'Voice note is no longer available.' });
    }
    res.set({
      'Content-Type': message.audioMimeType,
      'Content-Length': String(file.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    const download = bucket.openDownloadStream(message.audioFileId);
    download.on('error', (error) => {
      console.error('Could not stream voice note:', error.message);
      if (!res.headersSent) res.status(500).json({ message: 'We could not play this voice note.' });
      else res.destroy(error);
    });
    return download.pipe(res);
  } catch (error) {
    console.error('Could not load voice note:', error.message);
    return res.status(500).json({ message: 'We could not play this voice note.' });
  }
});

module.exports = router;
