const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCartItems,
  createPricedItems,
  calculateOrderTotal,
  normalizeRwandanMomoPhone,
  providerStatusToOrderStatus
} = require('../utils/checkout');

const productId = '507f1f77bcf86cd799439011';

test('accepts only a bounded cart of valid unique IDs and positive integer quantities', () => {
  assert.deepEqual(validateCartItems([{ productId, quantity: 2 }]), [{ productId, quantity: 2 }]);
  for (const items of [
    [],
    [{ productId: 'not-an-id', quantity: 1 }],
    [{ productId, quantity: 0 }],
    [{ productId, quantity: 1.5 }],
    [{ productId, quantity: 11 }],
    [{ productId, quantity: 1 }, { productId, quantity: 2 }]
  ]) {
    assert.throws(() => validateCartItems(items));
  }
  assert.throws(() => validateCartItems(Array.from({ length: 21 }, (_, index) => ({
    productId: (index + 100).toString(16).padStart(24, '0'),
    quantity: 1
  }))));
});

test('creates immutable-looking server snapshots from current product records and calculates RWF totals', () => {
  const product = { _id: productId, name: 'Market basket', price: 12000, stock: 4 };
  const cartItems = validateCartItems([{ productId, quantity: 2 }]);
  const priced = createPricedItems(cartItems, [product]);
  assert.deepEqual(priced, [{ productId, name: 'Market basket', unitPrice: 12000, quantity: 2 }]);
  assert.equal(calculateOrderTotal(priced), 24000);
});

test('rejects missing, understocked, and invalid-price products instead of trusting submitted amounts', () => {
  const cartItems = validateCartItems([{ productId, quantity: 2 }]);
  assert.throws(() => createPricedItems(cartItems, []), /no longer available/);
  assert.throws(() => createPricedItems(cartItems, [{ _id: productId, name: 'Basket', price: 10, stock: 1 }]), /enough stock/);
  assert.throws(() => createPricedItems(cartItems, [{ _id: productId, name: 'Basket', price: 10.5, stock: 2 }]), /invalid price/);
});

test('accepts Rwandan mobile formats and normalizes to MTN API MSISDN format', () => {
  assert.equal(normalizeRwandanMomoPhone('078 123 4567'), '250781234567');
  assert.equal(normalizeRwandanMomoPhone('+250 781 234 567'), '250781234567');
  assert.equal(normalizeRwandanMomoPhone('250781234567'), '250781234567');
  assert.equal(normalizeRwandanMomoPhone('07812345'), null);
  assert.equal(normalizeRwandanMomoPhone('+1 202 555 0100'), null);
});

test('maps only authoritative terminal provider values to terminal order states', () => {
  assert.equal(providerStatusToOrderStatus('SUCCESSFUL'), 'paid');
  assert.equal(providerStatusToOrderStatus('FAILED'), 'failed');
  assert.equal(providerStatusToOrderStatus('EXPIRED'), 'cancelled');
  assert.equal(providerStatusToOrderStatus('PENDING'), 'pending');
  assert.equal(providerStatusToOrderStatus('arbitrary'), 'pending');
});
