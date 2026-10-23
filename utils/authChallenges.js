const crypto = require('node:crypto');

function createVerificationCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashVerificationCode(email, purpose, code, secret) {
  return crypto.createHmac('sha256', secret)
    .update(`${email}:${purpose}:${code}`)
    .digest('hex');
}

function matchesVerificationCode(email, purpose, code, storedHash, secret) {
  if (!/^\d{6}$/.test(code) || typeof storedHash !== 'string') return false;
  const actual = Buffer.from(hashVerificationCode(email, purpose, code, secret), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = {
  createVerificationCode,
  hashVerificationCode,
  matchesVerificationCode
};