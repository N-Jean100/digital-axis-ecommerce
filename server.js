const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const http = require('node:http');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db.js');
const JWT_SECRET = require('./config/jwt');
const Conversation = require('./models/Conversation');
const mongoose = require('mongoose');
const checkoutRoutes = require('./routes/checkout');
const { handleStripeWebhook } = checkoutRoutes;

const app = express();
const server = http.createServer(app);
const allowedOrigins = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(',').map((origin) => origin.trim())
  : true;
const io = new Server(server, {
  cors: {
    origin: allowedOrigins
  }
});
const activeCalls = new Map();

// Stripe requires the exact raw request bytes for signature verification.
app.post('/api/checkout/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), handleStripeWebhook);

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(cors());

// Routes z'ibicuruzwa (Products Routes)
const productRoutes = require('./routes/product');
app.use('/api/products', productRoutes);

const chatRoutes = require('./routes/chat');
app.use('/api/chat', chatRoutes);

// Routes zo kwinjira no gukora konti
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const messageRoutes = require('./routes/messages');
app.use('/api/messages', messageRoutes);

app.use('/api/checkout', checkoutRoutes.router);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string') {
    return next(new Error('Authentication required.'));
  }
  try {
    socket.data.auth = {
      ...jwt.verify(token, JWT_SECRET),
      name: typeof socket.handshake.auth?.name === 'string'
        ? socket.handshake.auth.name.trim().slice(0, 100)
        : ''
    };
    return next();
  } catch {
    return next(new Error('Your session is invalid or has expired.'));
  }
});

function conversationRoom(conversationId) {
  return `conversation:${conversationId}`;
}

async function isConversationParticipant(conversationId, userId) {
  if (!mongoose.isValidObjectId(conversationId)) return false;
  return Boolean(await Conversation.exists({
    _id: conversationId,
    $or: [{ customer: userId }, { vendor: userId }]
  }));
}

io.on('connection', (socket) => {
  socket.on('conversation:join', async ({ conversationId } = {}, acknowledge = () => {}) => {
    try {
      if (!await isConversationParticipant(conversationId, socket.data.auth.id)) {
        return acknowledge({ ok: false, message: 'Conversation not found.' });
      }
      await socket.join(conversationRoom(conversationId));
      return acknowledge({ ok: true });
    } catch (error) {
      console.error('Could not authorize real-time conversation:', error.message);
      return acknowledge({ ok: false, message: 'Could not join this conversation.' });
    }
  });

  socket.on('conversation:leave', ({ conversationId } = {}) => {
    if (mongoose.isValidObjectId(conversationId)) {
      socket.leave(conversationRoom(conversationId));
    }
  });

  socket.on('call:invite', async ({ conversationId, callId } = {}, acknowledge = () => {}) => {
    try {
      if (typeof callId !== 'string' || callId.length > 100
        || !socket.rooms.has(conversationRoom(conversationId))) {
        return acknowledge({ ok: false, message: 'You cannot call from this conversation.' });
      }
      if (activeCalls.has(conversationId)) {
        return acknowledge({ ok: false, message: 'There is already a video call in this conversation.' });
      }
      const conversation = await Conversation.findOne({
        _id: conversationId,
        $or: [{ customer: socket.data.auth.id }, { vendor: socket.data.auth.id }]
      }).select('customer vendor').lean();
      if (!conversation) {
        return acknowledge({ ok: false, message: 'You cannot call from this conversation.' });
      }
      const otherUserId = String(conversation.customer) === socket.data.auth.id
        ? String(conversation.vendor)
        : String(conversation.customer);
      const participants = await io.in(conversationRoom(conversationId)).fetchSockets();
      const target = participants.find((participant) => participant.data.auth.id === otherUserId);
      if (!target) {
        return acknowledge({ ok: false, message: 'The other participant is not online right now.' });
      }
      const invite = {
        callId,
        conversationId,
        callerId: socket.data.auth.id,
        callerName: socket.data.auth.name || 'A conversation participant'
      };
      const call = {
        ...invite,
        callerSocketId: socket.id,
        targetSocketId: target.id,
        acceptedSocketId: null,
        timeout: setTimeout(() => {
          if (activeCalls.get(conversationId)?.callId !== callId) return;
          activeCalls.delete(conversationId);
          io.to([call.callerSocketId, call.targetSocketId]).emit('call:reject', {
            callId,
            conversationId,
            participantId: 'timeout'
          });
        }, 60_000)
      };
      activeCalls.set(conversationId, call);
      io.to(target.id).emit('call:incoming', invite);
      return acknowledge({ ok: true });
    } catch (error) {
      console.error('Could not start video call:', error.message);
      return acknowledge({ ok: false, message: 'Could not start the video call.' });
    }
  });

  socket.on('call:accept', ({ conversationId, callId } = {}) => {
    const call = activeCalls.get(conversationId);
    if (!call || call.callId !== callId || socket.id !== call.targetSocketId
      || !socket.rooms.has(conversationRoom(conversationId))) return;
    clearTimeout(call.timeout);
    call.acceptedSocketId = socket.id;
    io.to(call.callerSocketId).emit('call:accept', {
      callId,
      conversationId,
      participantId: socket.data.auth.id
    });
  });

  socket.on('call:reject', ({ conversationId, callId } = {}) => {
    const call = activeCalls.get(conversationId);
    if (!call || call.callId !== callId || socket.id !== call.targetSocketId
      || !socket.rooms.has(conversationRoom(conversationId))) return;
    clearTimeout(call.timeout);
    activeCalls.delete(conversationId);
    io.to(call.callerSocketId).emit('call:reject', {
      callId,
      conversationId,
      participantId: socket.data.auth.id
    });
  });

  socket.on('call:end', ({ conversationId, callId } = {}) => {
    const call = activeCalls.get(conversationId);
    if (!call || call.callId !== callId
      || ![call.callerSocketId, call.acceptedSocketId].includes(socket.id)
      || !socket.rooms.has(conversationRoom(conversationId))) return;
    clearTimeout(call.timeout);
    activeCalls.delete(conversationId);
    const otherSocketId = socket.id === call.callerSocketId ? call.targetSocketId : call.callerSocketId;
    io.to(otherSocketId).emit('call:end', {
      callId,
      conversationId,
      participantId: socket.data.auth.id
    });
  });

  socket.on('call:signal', ({ conversationId, callId, signal } = {}) => {
    const call = activeCalls.get(conversationId);
    if (!call || call.callId !== callId || !call.acceptedSocketId
      || ![call.callerSocketId, call.acceptedSocketId].includes(socket.id)
      || !socket.rooms.has(conversationRoom(conversationId))) return;
    if (!signal || !['offer', 'answer', 'ice-candidate'].includes(signal.type)) return;
    let serializedSignal;
    try {
      serializedSignal = JSON.stringify(signal.data);
    } catch {
      return;
    }
    if (typeof serializedSignal !== 'string' || serializedSignal.length > 64 * 1024) return;
    const otherSocketId = socket.id === call.callerSocketId ? call.acceptedSocketId : call.callerSocketId;
    io.to(otherSocketId).emit('call:signal', { callId, signal });
  });

  socket.on('disconnect', () => {
    for (const [conversationId, call] of activeCalls) {
      if (call.callerSocketId !== socket.id && call.targetSocketId !== socket.id) continue;
      clearTimeout(call.timeout);
      activeCalls.delete(conversationId);
      const otherSocketId = socket.id === call.callerSocketId ? call.targetSocketId : call.callerSocketId;
      io.to(otherSocketId).emit('call:end', {
        callId: call.callId,
        conversationId,
        participantId: socket.data.auth.id
      });
    }
  });
});

app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body exceeds the allowed upload size.' });
  }
  if (error instanceof SyntaxError && error.status === 400 && Object.prototype.hasOwnProperty.call(error, 'body')) {
    return res.status(400).json({ message: 'Request body must contain valid JSON.' });
  }
  return next(error);
});

// Route y'igeragezo
app.get('/', (req, res) => {
  res.send("API ya DIGITAL Axis irimo gukora neza!");
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDB();
  return server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}.`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Server startup failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, server, io, startServer };