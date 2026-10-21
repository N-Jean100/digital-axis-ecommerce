const express = require('express');
const Product = require('../models/Product');
const { createAssistantReply, rankProducts } = require('../utils/productAssistant');

const router = express.Router();
const MAX_MESSAGE_LENGTH = 500;

router.post('/', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ message: `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters.` });
  }

  try {
    const products = await Product.find({ stock: { $gt: 0 } })
      .select('name description category price stock image location')
      .limit(200)
      .lean();
    const recommendations = rankProducts(message, products);
    return res.json({
      reply: createAssistantReply(message, recommendations),
      products: recommendations
    });
  } catch (error) {
    console.error('Could not answer product assistant request:', error.message);
    return res.status(500).json({ message: 'The product assistant is unavailable right now. Please try again.' });
  }
});

module.exports = router;
