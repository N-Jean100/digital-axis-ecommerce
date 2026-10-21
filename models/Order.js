const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: { type: String, required: true },
  unitPrice: { type: Number, required: true, min: 1 },
  quantity: { type: Number, required: true, min: 1, max: 10 }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  items: { type: [orderItemSchema], required: true },
  total: { type: Number, required: true, min: 1 },
  currency: { type: String, enum: ['RWF'], default: 'RWF', required: true },
  paymentProvider: { type: String, enum: ['stripe', 'mtn'], required: true },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'cancelled'],
    default: 'pending',
    required: true
  },
  providerReference: { type: String, default: undefined },
  stripeSessionId: { type: String, default: undefined },
  inventoryStatus: {
    type: String,
    enum: ['unreserved', 'reserved', 'failed'],
    default: 'unreserved',
    required: true
  },
  failureCode: { type: String, default: null }
}, { timestamps: true });

orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ providerReference: 1 }, { sparse: true, unique: true });
orderSchema.index({ stripeSessionId: 1 }, { sparse: true, unique: true });

module.exports = mongoose.model('Order', orderSchema);
