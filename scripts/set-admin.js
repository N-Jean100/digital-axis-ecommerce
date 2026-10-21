const dotenv = require('dotenv');
dotenv.config();

const mongoose = require('mongoose');
const User = require('../models/User');

async function setAdmin() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || process.argv.length !== 3) {
    throw new Error('Usage: npm run admin:set -- <existing-user-email>');
  }
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI must be set in the environment before promoting an admin.');
  }

  await mongoose.connect(process.env.MONGO_URI);
  try {
    const result = await User.updateOne({ email }, { $set: { role: 'admin' } });
    if (result.matchedCount === 0) {
      throw new Error(`No account found for ${email}. Register that account before promoting it.`);
    }
    console.log(`Admin access granted to ${email}. Sign out and sign back in to refresh the session.`);
  } finally {
    await mongoose.disconnect();
  }
}

setAdmin().catch((error) => {
  console.error('Could not grant admin access:', error.message);
  process.exitCode = 1;
});
