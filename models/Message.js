const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'voice'],
    required: true
  },
  text: {
    type: String,
    trim: true,
    maxlength: 4000
  },
  audioFileId: {
    type: mongoose.Schema.Types.ObjectId
  },
  audioMimeType: {
    type: String,
    enum: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
  },
  audioDurationSeconds: {
    type: Number,
    min: 0,
    max: 120
  }
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
