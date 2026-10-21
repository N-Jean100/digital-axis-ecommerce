const express = require('express');
const mongoose = require('mongoose');
const crypto = require('node:crypto');
const Order = require('../models/Order');
const Product = require('../models/Product');
const verifyToken = require('../middleware/verifyToken');
const {
  validateCartItems,
  createPricedItems,
  calculateOrderTotal,
  normalizeRwandanMomoPhone
} = require('../utils/checkout');
const {
  startMtnRequest,
  getMtnRequestStatus,
  createStripeClient,
  assertMtnConfiguration
} = require('../utils/paymentProviders');
const { applyProviderStatus } = require('../services/orderSettlement');

const router = express.Router();

function customerOnly(req, res, next) {
  if (req.auth?.role !== 'customer') {
    return res.status(403).json({ message: 'Only customer accounts can place or view orders.' });
  }
  return next();
}

function publicOrder(order) {
  if (!order) return order;
  const { customer, stripeSessionId, providerReference, __v, ...safeOrder } = order;
  return safeOrder;
}

function sendPaymentError(res, error) {
  if (error.code === 'PAYMENT_PROVIDER_NOT_CONFIGURED') {
    return res.status(error.statusCode || 503).json({
      code: error.code,
      message: error.message,
      missingConfiguration: error.missing || []
    });
  }
  if (error.message?.startsWith('Choose between ')
    || error.message?.startsWith('Each ')
    || error.message?.startsWith('A product ')
    || error.message?.includes('does not have enough stock')
    || error.message?.startsWith('The order total')) {
    return res.status(400).json({ message: error.message });
  }
  console.error('Checkout provider operation failed:', error.code || error.name || 'unknown error');
  return res.status(502).json({
    message: 'We could not confirm that the payment request started. Check your recent orders before trying again.'
  });
}

router.post('/orders', verifyToken, customerOnly, async (req, res) => {
  let order;
  let mtnRequestAccepted = false;
  try {
    const cartItems = validateCartItems(req.body?.items);
    const provider = req.body?.paymentProvider;
    if (!['stripe', 'mtn'].includes(provider)) {
      return res.status(400).json({ message: 'Choose Stripe or MTN Mobile Money.' });
    }
    let phone;
    if (provider === 'mtn') {
      phone = normalizeRwandanMomoPhone(req.body?.phone);
      if (!phone) {
        return res.status(400).json({ message: 'Enter a valid Rwanda mobile number, such as 0781234567.' });
      }
    }
    const stripe = provider === 'stripe' ? createStripeClient() : null;
    if (provider === 'mtn') assertMtnConfiguration();

    const products = await Product.find({
      _id: { $in: cartItems.map((item) => item.productId) }
    }).select('_id name price stock').lean();
    if (products.length !== cartItems.length) {
      return res.status(400).json({ message: 'A product in your cart is no longer available.' });
    }
    const items = createPricedItems(cartItems, products);
    const total = calculateOrderTotal(items);
    order = await Order.create({
      customer: req.auth.id,
      items,
      total,
      paymentProvider: provider,
      paymentStatus: 'pending'
    });

    if (provider === 'stripe') {
      const returnUrl = new URL(process.env.CHECKOUT_RETURN_URL);
      const successUrl = new URL(returnUrl);
      successUrl.searchParams.set('checkout', 'complete');
      successUrl.searchParams.set('order', String(order._id));
      const cancelUrl = new URL(returnUrl);
      cancelUrl.searchParams.set('checkout', 'cancelled');
      cancelUrl.searchParams.set('order', String(order._id));
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        success_url: successUrl.toString(),
        cancel_url: cancelUrl.toString(),
        client_reference_id: String(order._id),
        metadata: { orderId: String(order._id) },
        line_items: items.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: 'rwf',
            unit_amount: item.unitPrice,
            product_data: { name: item.name }
          }
        }))
      });
      await Order.updateOne({ _id: order._id }, { $set: { stripeSessionId: session.id } });
      return res.status(201).json({
        order: publicOrder(await Order.findById(order._id).lean()),
        checkoutUrl: session.url
      });
    }

    const referenceId = crypto.randomUUID();
    await Order.updateOne({ _id: order._id }, { $set: { providerReference: referenceId } });
    await startMtnRequest({ order, phone, referenceId });
    mtnRequestAccepted = true;
    return res.status(201).json({
      order: publicOrder(await Order.findById(order._id).lean()),
      message: 'Payment request sent. Approve it on your phone; this order remains pending until MTN confirms payment.'
    });
  } catch (error) {
    if ((error.code === 'MTN_REQUEST_UNCERTAIN' || mtnRequestAccepted) && order?._id) {
      return res.status(202).json({
        order: publicOrder(await Order.findById(order._id).lean()),
        message: 'The payment request may be active. The order remains pending while MTN status is checked.'
      });
    }
    if (order?._id && order.paymentStatus === 'pending') {
      try {
        await Order.updateOne(
          { _id: order._id, paymentStatus: 'pending' },
          { $set: { paymentStatus: 'failed', failureCode: 'PAYMENT_REQUEST_FAILED' } }
        );
      } catch (updateError) {
        console.error('Could not mark failed checkout order:', updateError.code || updateError.name || 'database error');
      }
    }
    return sendPaymentError(res, error);
  }
});

router.get('/orders', verifyToken, customerOnly, async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.auth.id })
      .select('-customer -__v -stripeSessionId -providerReference')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return res.json({ orders });
  } catch {
    return res.status(500).json({ message: 'Your orders could not be loaded right now.' });
  }
});

router.get('/orders/:orderId', verifyToken, customerOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.orderId)) {
    return res.status(404).json({ message: 'Order not found.' });
  }
  try {
    let order = await Order.findOne({ _id: req.params.orderId, customer: req.auth.id })
      .select('-customer -__v -stripeSessionId -providerReference')
      .lean();
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (order.paymentStatus === 'pending' && order.paymentProvider === 'mtn') {
      const storedOrder = await Order.findOne({ _id: order._id, customer: req.auth.id }).select('providerReference').lean();
      if (storedOrder?.providerReference) {
        const providerStatus = await getMtnRequestStatus(storedOrder.providerReference);
        order = await applyProviderStatus(order, providerStatus);
      }
    }
    return res.json({ order: publicOrder(order) });
  } catch {
    return res.status(502).json({
      code: 'PAYMENT_STATUS_UNAVAILABLE',
      message: 'The payment provider has not returned an update. Your order has not been marked paid; try again shortly.'
    });
  }
});

router.post('/mtn/callback', async (req, res) => {
  const referenceId = req.body?.referenceId;
  if (typeof referenceId !== 'string' || referenceId.length > 100) {
    return res.status(400).json({ message: 'Invalid MTN callback reference.' });
  }
  try {
    const order = await Order.findOne({ providerReference: referenceId });
    if (!order || order.paymentStatus !== 'pending') return res.sendStatus(204);
    const authoritativeStatus = await getMtnRequestStatus(referenceId);
    await applyProviderStatus(order, authoritativeStatus);
    return res.sendStatus(204);
  } catch {
    return res.sendStatus(503);
  }
});

async function handleStripeWebhook(req, res) {
  let event;
  try {
    const stripe = createStripeClient();
    const signature = req.get('stripe-signature');
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).send('Invalid Stripe webhook signature.');
  }

  const session = event.data?.object;
  if (!session || !['checkout.session.completed', 'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed', 'checkout.session.expired'].includes(event.type)) {
    return res.sendStatus(200);
  }
  const orderId = session.metadata?.orderId || session.client_reference_id;
  if (!mongoose.isValidObjectId(orderId)) return res.sendStatus(200);
  try {
    const order = await Order.findOne({ _id: orderId, paymentProvider: 'stripe' });
    if (!order || order.stripeSessionId !== session.id) return res.sendStatus(200);
    if (session.mode !== 'payment' || session.currency !== 'rwf' || session.amount_total !== order.total) {
      return res.sendStatus(400);
    }

    if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded')
      && session.payment_status === 'paid') {
      await applyProviderStatus(order, 'SUCCESSFUL');
    } else if (event.type === 'checkout.session.async_payment_failed') {
      await applyProviderStatus(order, 'FAILED');
    } else if (event.type === 'checkout.session.expired') {
      await applyProviderStatus(order, 'EXPIRED');
    }
    return res.sendStatus(200);
  } catch {
    return res.sendStatus(500);
  }
}

module.exports = { router, handleStripeWebhook };
