const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  lastMessage: {
    type: String,
    default: ''
  },
  lastMessageType: {
    type: String,
    enum: ['text', 'voice'],
    default: 'text'
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

conversationSchema.index({ customer: 1, vendor: 1, product: 1 }, { unique: true });
conversationSchema.index({ customer: 1, lastMessageAt: -1 });
conversationSchema.index({ vendor: 1, lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
