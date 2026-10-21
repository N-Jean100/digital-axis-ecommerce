const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI must be set in the environment before starting the server.');
  }

  await mongoose.connect(mongoUri);
  console.log('MongoDB connected successfully.');
};

module.exports = connectDB;