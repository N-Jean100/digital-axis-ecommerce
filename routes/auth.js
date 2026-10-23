const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuthChallenge = require('../models/AuthChallenge');
const JWT_SECRET = require('../config/jwt');
const { createVerificationCode, hashVerificationCode, matchesVerificationCode } = require('../utils/authChallenges');
const { isEmailDeliveryConfigured, sendVerificationCode } = require('../services/authEmail');

const router = express.Router();
const publicRoles = ['customer', 'vendor'];
const challengeLifetimeMs = 10 * 60 * 1000;
const resendDelayMs = 30 * 1000;
const maxResends = 5;
const maxAttempts = 5;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function challengeError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

async function issueChallenge(email, purpose, registration) {
  if (!isEmailDeliveryConfigured()) {
    throw challengeError(503, 'Email verification is not configured. Contact the workspace administrator.');
  }

  const now = new Date();
  let challenge = await AuthChallenge.findOne({ email, purpose });
  let resendCount = 0;
  if (challenge && challenge.expiresAt > now) {
    if (challenge.nextResendAt > now) {
      throw challengeError(429, 'Please wait before requesting another code.');
    }
    if (challenge.resendCount >= maxResends) {
      throw challengeError(429, 'Too many code requests. Please try again later.');
    }
    resendCount = challenge.resendCount + 1;
  } else if (!challenge) {
    challenge = new AuthChallenge({ email, purpose });
  }

  const code = createVerificationCode();
  challenge.codeHash = hashVerificationCode(email, purpose, code, JWT_SECRET);
  challenge.expiresAt = new Date(now.getTime() + challengeLifetimeMs);
  challenge.nextResendAt = new Date(now.getTime() + resendDelayMs);
  challenge.attempts = 0;
  challenge.resendCount = resendCount;
  if (purpose === 'registration') challenge.registration = registration || challenge.registration;
  await challenge.save();
  try {
    await sendVerificationCode(email, code, purpose);
  } catch (error) {
    await challenge.deleteOne();
    throw error;
  }
}

async function getChallenge(email, purpose) {
  const challenge = await AuthChallenge.findOne({ email, purpose });
  if (!challenge || challenge.expiresAt <= new Date()) {
    if (challenge) await challenge.deleteOne();
    return null;
  }
  return challenge;
}

async function verifyChallengeCode(challenge, email, purpose, code) {
  if (challenge.attempts >= maxAttempts) {
    throw challengeError(429, 'Too many incorrect codes. Request a new code to continue.');
  }
  if (!matchesVerificationCode(email, purpose, code, challenge.codeHash, JWT_SECRET)) {
    challenge.attempts += 1;
    await challenge.save();
    throw challengeError(challenge.attempts >= maxAttempts ? 429 : 400, 'That code is incorrect or has expired.');
  }
}

function createSession(user) {
  const safeUser = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role
  };

  return {
    token: jwt.sign({ id: safeUser.id, role: safeUser.role }, JWT_SECRET, { expiresIn: '7d' }),
    user: safeUser
  };
}

function verifyToken(req, res, next) {
  const authorization = req.get('Authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Please sign in to continue.' });
  }

  try {
    req.auth = jwt.verify(authorization.slice(7), JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: 'Your session is invalid or has expired. Please sign in again.' });
  }
}

router.post('/register', async (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const requestedRole = typeof body.role === 'string' ? body.role : 'customer';

  if (!name || name.length > 100) {
    return res.status(400).json({ message: 'Enter a name with no more than 100 characters.' });
  }
  if (!validEmail(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ message: 'Password must be between 8 and 128 characters.' });
  }
  if (!publicRoles.includes(requestedRole)) {
    return res.status(400).json({ message: 'Choose a valid account type.' });
  }

  try {
    const existingUser = await User.exists({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists. Sign in instead.' });
    }

    await issueChallenge(email, 'registration', {
      name,
      passwordHash: await bcrypt.hash(password, 12),
      role: requestedRole
    });
    return res.status(202).json({ message: 'A verification code has been sent to your email address.' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    if (error.code === 11000) return res.status(429).json({ message: 'Please wait before requesting another code.' });
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Please check your account details and try again.' });
    }
    console.error('Account registration failed:', error.message);
    return res.status(500).json({ message: 'We could not create your account. Please try again.' });
  }
});

router.post('/register/verify', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!validEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: 'Enter a valid email address and six-digit code.' });
  }

  try {
    const challenge = await getChallenge(email, 'registration');
    if (!challenge?.registration?.passwordHash) {
      return res.status(400).json({ message: 'That code is incorrect or has expired.' });
    }
    await verifyChallengeCode(challenge, email, 'registration', code);
    const user = await User.create({
      name: challenge.registration.name,
      email,
      password: challenge.registration.passwordHash,
      role: challenge.registration.role
    });
    await challenge.deleteOne();
    return res.status(201).json({ ...createSession(user), message: 'Your account is ready.' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    if (error.code === 11000) return res.status(409).json({ message: 'An account with this email already exists. Sign in instead.' });
    console.error('Account verification failed:', error.message);
    return res.status(500).json({ message: 'We could not verify your account. Please try again.' });
  }
});

router.post('/password/forgot', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!validEmail(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (!isEmailDeliveryConfigured()) {
    return res.status(503).json({ message: 'Password recovery is not configured. Contact the workspace administrator.' });
  }

  try {
    if (await User.exists({ email })) await issueChallenge(email, 'password-reset');
    return res.status(202).json({ message: 'If an account exists for this email, a verification code has been sent.' });
  } catch (error) {
    console.error('Password recovery request failed:', error.message);
    return res.status(202).json({ message: 'If an account exists for this email, a verification code has been sent.' });
  }
});

router.post('/password/reset', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!validEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: 'Enter a valid email address and six-digit code.' });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ message: 'Password must be between 8 and 128 characters.' });
  }

  try {
    const challenge = await getChallenge(email, 'password-reset');
    if (!challenge) return res.status(400).json({ message: 'That code is incorrect or has expired.' });
    await verifyChallengeCode(challenge, email, 'password-reset', code);
    const result = await User.updateOne({ email }, { $set: { password: await bcrypt.hash(password, 12) } });
    await challenge.deleteOne();
    if (result.matchedCount === 0) return res.status(400).json({ message: 'That code is incorrect or has expired.' });
    return res.status(200).json({ message: 'Your password has been reset. Sign in with your new password.' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('Password reset failed:', error.message);
    return res.status(500).json({ message: 'We could not reset your password. Please try again.' });
  }
});

router.post('/otp/resend', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const purpose = req.body?.purpose;
  if (!validEmail(email) || !['registration', 'password-reset'].includes(purpose)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (!isEmailDeliveryConfigured()) {
    return res.status(503).json({ message: 'Email verification is not configured. Contact the workspace administrator.' });
  }

  try {
    if (purpose === 'registration') {
      const challenge = await getChallenge(email, purpose);
      if (!challenge?.registration?.passwordHash) {
        return res.status(400).json({ message: 'Please restart registration to request a new code.' });
      }
      await issueChallenge(email, purpose);
    } else if (await User.exists({ email })) {
      try {
        await issueChallenge(email, purpose);
      } catch (error) {
        if (error.statusCode !== 429) throw error;
      }
    }
    return res.status(202).json({ message: purpose === 'registration'
      ? 'A new verification code has been sent.'
      : 'If an account exists for this email, a new code has been sent.' });
  } catch (error) {
    if (purpose === 'password-reset') {
      console.error('Password recovery resend failed:', error.message);
      return res.status(202).json({ message: 'If an account exists for this email, a new code has been sent.' });
    }
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error('Verification code resend failed:', error.message);
    return res.status(500).json({ message: 'We could not send another code. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    return res.status(400).json({ message: 'Enter your email address and password.' });
  }

  try {
    const user = await User.findOne({ email }).select('name email role +password');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }

    return res.status(200).json(createSession(user));
  } catch (error) {
    console.error('Account sign-in failed:', error.message);
    return res.status(500).json({ message: 'We could not sign you in. Please try again.' });
  }
});

router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.auth.id)
      .select('name email role')
      .lean();
    if (!user) {
      return res.status(401).json({ message: 'This account is no longer available. Please sign in again.' });
    }

    return res.status(200).json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Session verification failed:', error.message);
    return res.status(500).json({ message: 'We could not verify your session. Please try again.' });
  }
});

module.exports = router;
