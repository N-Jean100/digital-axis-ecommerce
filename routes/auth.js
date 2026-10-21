const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const JWT_SECRET = require('../config/jwt');

const router = express.Router();
const publicRoles = ['customer', 'vendor'];

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
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const requestedRole = typeof body.role === 'string' ? body.role : 'customer';

  if (!name || name.length > 100) {
    return res.status(400).json({ message: 'Enter a name with no more than 100 characters.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
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

    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 12),
      role: requestedRole
    });

    return res.status(201).json({
      ...createSession(user),
      message: 'Your account is ready.'
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists. Sign in instead.' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Please check your account details and try again.' });
    }
    console.error('Account registration failed:', error.message);
    return res.status(500).json({ message: 'We could not create your account. Please try again.' });
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
