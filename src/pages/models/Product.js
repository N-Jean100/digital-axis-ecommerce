const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  stock: {
    type: Number,
    required: true,
    default: 0
  },
  image: {
    type: String, // Hano hazajya habikwa link y'ifoto y'igicuruzwa
    required: false
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Bifitanye isano na User Model (Umucuruzi wacuruje iki gicuruzwa)
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);