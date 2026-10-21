const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../config/jwt');
const { validateProductImage } = require('../utils/productImage');

// Middleware yo kugenzura token
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).json({ message: "Ntushobora kubona uburenganzira, nta token ihari!" });

  try {
    const verified = jwt.verify(token.replace("Bearer ", ""), JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(403).json({ message: "Token siyo cyangwa yarangiye igihe!" });
  }
};

// 1. KONGERAMO IGICURUZWA GISHYA (Vendors na Admins bonyine)
router.post('/add', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'vendor' && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Abacuruzi (Vendors) cyangwa Admins bonyine nibo bemerewe kongeramo ibicuruzwa!" });
    }

    const { name, description, price, category, stock, image } = req.body;
    const location = typeof req.body.location === 'string' ? req.body.location.trim() : '';
    if (location.length > 120) {
      return res.status(400).json({ message: 'Product location must be 120 characters or fewer.' });
    }
    const imageError = validateProductImage(image);
    if (imageError) {
      return res.status(400).json({ message: imageError });
    }

    const newProduct = new Product({
      name,
      description,
      price,
      category,
      stock,
      image,
      location,
      vendor: req.user.id
    });

    const savedProduct = await newProduct.save();
    res.status(201).json({ message: "Igicuruzwa cyongewe neza cyane!", product: savedProduct });

  } catch (error) {
    res.status(500).json({ message: "Habaye ikibazo muri server", error: error.message });
  }
});

// 2. KUBONA IBICURUZWA BYOSE
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().populate('vendor', 'name email');
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: "Habaye ikibazo", error: error.message });
  }
});

module.exports = router;