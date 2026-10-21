const MAX_ITEMS_PER_ORDER = 20;
const MAX_QUANTITY_PER_ITEM = 10;

function validateCartItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS_PER_ORDER) {
    throw new Error(`Choose between 1 and ${MAX_ITEMS_PER_ORDER} different products.`);
  }

  const ids = new Set();
  return items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || typeof item.productId !== 'string'
      || !/^[a-f\d]{24}$/i.test(item.productId)) {
      throw new Error('Each cart item must include a valid product ID.');
    }
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY_PER_ITEM) {
      throw new Error(`Each product quantity must be between 1 and ${MAX_QUANTITY_PER_ITEM}.`);
    }
    const productId = item.productId.toLowerCase();
    if (ids.has(productId)) {
      throw new Error('Each product can only appear once in the cart.');
    }
    ids.add(productId);
    return { productId, quantity: item.quantity };
  });
}

function createPricedItems(cartItems, products) {
  const productsById = new Map(products.map((product) => [String(product._id), product]));
  return cartItems.map(({ productId, quantity }) => {
    const product = productsById.get(productId);
    if (!product) {
      throw new Error('A product in your cart is no longer available.');
    }
    if (!Number.isSafeInteger(product.price) || product.price < 1) {
      throw new Error('A product in your cart has an invalid price and cannot be purchased.');
    }
    if (!Number.isSafeInteger(product.stock) || product.stock < quantity) {
      throw new Error(`${product.name} does not have enough stock for this quantity.`);
    }
    return {
      productId: product._id,
      name: product.name,
      unitPrice: product.price,
      quantity
    };
  });
}

function calculateOrderTotal(items) {
  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  if (!Number.isSafeInteger(total) || total < 1) {
    throw new Error('The order total is outside the supported payment range.');
  }
  return total;
}

function normalizeRwandanMomoPhone(phone) {
  if (typeof phone !== 'string') return null;
  const compact = phone.trim().replace(/[\s()-]/g, '');
  const normalized = compact.startsWith('+')
    ? compact.slice(1)
    : compact.startsWith('0')
      ? `250${compact.slice(1)}`
      : compact;
  return /^2507\d{8}$/.test(normalized) ? normalized : null;
}

function providerStatusToOrderStatus(status) {
  switch (status) {
    case 'SUCCESSFUL': return 'paid';
    case 'FAILED':
    case 'REJECTED':
    case 'TIMEOUT': return 'failed';
    case 'EXPIRED': return 'cancelled';
    default: return 'pending';
  }
}

module.exports = {
  MAX_ITEMS_PER_ORDER,
  MAX_QUANTITY_PER_ITEM,
  validateCartItems,
  createPricedItems,
  calculateOrderTotal,
  normalizeRwandanMomoPhone,
  providerStatusToOrderStatus
};
