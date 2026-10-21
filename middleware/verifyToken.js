const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../config/jwt');

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

module.exports = verifyToken;
