const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'be', 'for', 'from', 'i', 'in', 'is', 'it',
  'me', 'my', 'of', 'on', 'or', 'the', 'to', 'with', 'you', 'your', 'find',
  'looking', 'need', 'want', 'show', 'please', 'product', 'products', 'rwf',
  'under', 'below', 'less', 'than', 'up', 'maximum', 'max', 'budget', 'most',
  'anything'
]);

function tokenize(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[\p{L}\p{N}]+/gu) || [];
}

function getMaximumPrice(message) {
  const match = String(message || '').match(
    /(?:under|below|less than|up to|max(?:imum)?|budget(?: of)?|at most)\s*(?:rwf\s*)?([\d,]+(?:\.\d+)?)/i
  );
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function rankProducts(message, products, limit = 4) {
  const terms = [...new Set(tokenize(message).filter((term) => (
    term.length > 1 && !/^\d+$/.test(term) && !STOP_WORDS.has(term)
  )))];
  const maximumPrice = getMaximumPrice(message);
  const availableProducts = products.filter((product) => Number(product.stock) > 0);

  return availableProducts
    .filter((product) => maximumPrice === null || Number(product.price) <= maximumPrice)
    .map((product) => {
      const fields = {
        name: tokenize(product.name),
        category: tokenize(product.category),
        description: tokenize(product.description),
        location: tokenize(product.location)
      };
      const score = terms.reduce((total, term) => (
        total
        + (fields.name.includes(term) ? 4 : 0)
        + (fields.category.includes(term) ? 3 : 0)
        + (fields.location.includes(term) ? 3 : 0)
        + (fields.description.includes(term) ? 1 : 0)
      ), 0);
      return { product, score };
    })
    .filter(({ score }) => terms.length === 0 || score > 0)
    .sort((a, b) => b.score - a.score || Number(b.product.stock) - Number(a.product.stock))
    .slice(0, Math.max(0, limit))
    .map(({ product }) => product);
}

function createAssistantReply(message, products) {
  if (products.length === 0) {
    const maxPrice = getMaximumPrice(message);
    return maxPrice === null
      ? 'I couldn’t find an in-stock match for that search. Try a product name, category, or location.'
      : `I couldn’t find an in-stock match under ${maxPrice.toLocaleString()} RWF. Try a higher budget or a different search.`;
  }

  if (products.length === 1) return 'Here’s an in-stock product that matches your search.';
  return `I found ${products.length} in-stock products that could be a good fit.`;
}

module.exports = { createAssistantReply, rankProducts };
