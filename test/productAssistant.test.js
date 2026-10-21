const test = require('node:test');
const assert = require('node:assert/strict');
const { createAssistantReply, rankProducts } = require('../utils/productAssistant');

const products = [
  { name: 'Woven market tote', category: 'Accessories', description: 'Handmade sisal bag', price: 12000, stock: 4, location: 'Kigali' },
  { name: 'Leather sandals', category: 'Shoes', description: 'Comfortable everyday footwear', price: 18000, stock: 3, location: 'Huye' },
  { name: 'Ceramic serving bowl', category: 'Home', description: 'Handmade serving dish', price: 8000, stock: 0, location: 'Kigali' }
];

test('ranks matching product names and categories above unrelated catalog items', () => {
  assert.deepEqual(
    rankProducts('show me a tote', products).map((product) => product.name),
    ['Woven market tote']
  );
});

test('filters recommendations by budget and only includes in-stock products', () => {
  assert.deepEqual(
    rankProducts('anything under 15,000 RWF', products).map((product) => product.name),
    ['Woven market tote']
  );
});

test('matches products by optional location', () => {
  assert.deepEqual(
    rankProducts('in Huye', products).map((product) => product.name),
    ['Leather sandals']
  );
});

test('returns helpful responses when there are no matches', () => {
  assert.match(createAssistantReply('under 1000 RWF', []), /under 1,000 RWF/);
  assert.match(createAssistantReply('something unavailable', []), /couldn’t find an in-stock match/i);
});
