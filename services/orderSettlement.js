const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { providerStatusToOrderStatus } = require('../utils/checkout');

async function applyProviderStatus(order, providerStatus) {
  const resultStatus = providerStatusToOrderStatus(providerStatus);
  if (resultStatus === 'pending') return order;
  if (resultStatus !== 'paid') {
    await Order.updateOne(
      { _id: order._id, paymentStatus: 'pending' },
      { $set: { paymentStatus: resultStatus, failureCode: `PROVIDER_${providerStatus}` } }
    );
    return Order.findById(order._id).lean();
  }

  const session = await mongoose.startSession();
  let inventoryUnavailable = false;
  try {
    await session.withTransaction(async () => {
      const pendingOrder = await Order.findOne({
        _id: order._id,
        paymentStatus: 'pending',
        inventoryStatus: 'unreserved'
      }).session(session);
      if (!pendingOrder) return;

      for (const item of pendingOrder.items) {
        const updated = await Product.updateOne(
          { _id: item.productId, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { session }
        );
        if (updated.modifiedCount !== 1) {
          inventoryUnavailable = true;
          const error = new Error('Insufficient inventory for paid order.');
          error.code = 'INVENTORY_UNAVAILABLE_AFTER_PAYMENT';
          throw error;
        }
      }

      pendingOrder.paymentStatus = 'paid';
      pendingOrder.inventoryStatus = 'reserved';
      pendingOrder.failureCode = null;
      await pendingOrder.save({ session });
    });
  } catch (error) {
    if (error.code !== 'INVENTORY_UNAVAILABLE_AFTER_PAYMENT') throw error;
  } finally {
    await session.endSession();
  }

  if (inventoryUnavailable) {
    await Order.updateOne(
      { _id: order._id, paymentStatus: 'pending', inventoryStatus: 'unreserved' },
      {
        $set: {
          paymentStatus: 'failed',
          inventoryStatus: 'failed',
          failureCode: 'INVENTORY_UNAVAILABLE_AFTER_PAYMENT'
        }
      }
    );
  }
  return Order.findById(order._id).lean();
}

module.exports = { applyProviderStatus };
