const mongoose = require('mongoose');

const authChallengeSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  purpose: { type: String, enum: ['registration', 'password-reset'], required: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  nextResendAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  resendCount: { type: Number, default: 0 },
  registration: {
    name: { type: String, maxlength: 100 },
    passwordHash: { type: String },
    role: { type: String, enum: ['customer', 'vendor'] }
  }
}, { timestamps: true });

authChallengeSchema.index({ email: 1, purpose: 1 }, { unique: true });
authChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuthChallenge', authChallengeSchema);