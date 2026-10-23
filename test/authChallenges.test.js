const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createVerificationCode,
  hashVerificationCode,
  matchesVerificationCode
} = require('../utils/authChallenges');

test('creates six-digit verification codes, including leading zeroes', () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(createVerificationCode(), /^\d{6}$/);
  }
});

test('binds code hashes to the email and purpose and rejects malformed guesses', () => {
  const secret = 'test-only-secret';
  const hash = hashVerificationCode('buyer@example.com', 'registration', '012345', secret);

  assert.equal(matchesVerificationCode('buyer@example.com', 'registration', '012345', hash, secret), true);
  assert.equal(matchesVerificationCode('other@example.com', 'registration', '012345', hash, secret), false);
  assert.equal(matchesVerificationCode('buyer@example.com', 'password-reset', '012345', hash, secret), false);
  assert.equal(matchesVerificationCode('buyer@example.com', 'registration', '12345', hash, secret), false);
});