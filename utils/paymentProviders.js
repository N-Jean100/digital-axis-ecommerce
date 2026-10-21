const MTN_SANDBOX_BASE_URL = 'https://sandbox.momodeveloper.mtn.com';

function missingStripeConfiguration() {
  return ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'CHECKOUT_RETURN_URL']
    .filter((name) => !process.env[name]);
}

function missingMtnConfiguration() {
  return [
    'MTN_COLLECTION_SUBSCRIPTION_KEY',
    'MTN_COLLECTION_API_USER',
    'MTN_COLLECTION_API_KEY',
    'MTN_CALLBACK_URL'
  ].filter((name) => !process.env[name]);
}

function assertMtnConfiguration() {
  const missing = missingMtnConfiguration();
  if (missing.length) {
    const error = new Error('MTN Mobile Money is not configured on this server.');
    error.statusCode = 503;
    error.code = 'PAYMENT_PROVIDER_NOT_CONFIGURED';
    error.missing = missing;
    throw error;
  }
  if (process.env.MTN_TARGET_ENVIRONMENT && process.env.MTN_TARGET_ENVIRONMENT !== 'sandbox') {
    const error = new Error('Only the MTN Collections sandbox is enabled for this deployment.');
    error.statusCode = 503;
    error.code = 'PAYMENT_PROVIDER_NOT_CONFIGURED';
    throw error;
  }
  if (!isAllowedPublicUrl(process.env.MTN_CALLBACK_URL)) {
    const error = new Error('MTN_CALLBACK_URL must be a public HTTPS URL (localhost is allowed for development).');
    error.statusCode = 503;
    error.code = 'PAYMENT_PROVIDER_NOT_CONFIGURED';
    throw error;
  }
}

function isAllowedPublicUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getMtnAccessToken() {
  assertMtnConfiguration();

  const response = await fetchWithTimeout(`${MTN_SANDBOX_BASE_URL}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.MTN_COLLECTION_API_USER}:${process.env.MTN_COLLECTION_API_KEY}`).toString('base64')}`,
      'Ocp-Apim-Subscription-Key': process.env.MTN_COLLECTION_SUBSCRIPTION_KEY
    }
  });
  if (!response.ok) {
    throw new Error('MTN authorization failed. Check sandbox credentials and subscription access.');
  }
  const data = await response.json();
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('MTN authorization returned an invalid response.');
  }
  return data.access_token;
}

async function startMtnRequest({ order, phone, referenceId }) {
  const callbackUrl = process.env.MTN_CALLBACK_URL;
  assertMtnConfiguration();
  const accessToken = await getMtnAccessToken();
  let response;
  try {
    response = await fetchWithTimeout(`${MTN_SANDBOX_BASE_URL}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Reference-Id': referenceId,
        'X-Target-Environment': 'sandbox',
        'Ocp-Apim-Subscription-Key': process.env.MTN_COLLECTION_SUBSCRIPTION_KEY,
        'Content-Type': 'application/json',
        'X-Callback-Url': callbackUrl
      },
      body: JSON.stringify({
        amount: String(order.total),
        currency: 'RWF',
        externalId: String(order._id),
        payer: { partyIdType: 'MSISDN', partyId: phone },
        payerMessage: 'DIGITAL Axis order payment',
        payeeNote: `Order ${order._id}`
      })
    });
  } catch {
    const error = new Error('MTN did not confirm whether it accepted the request. The order remains pending while the status is checked.');
    error.code = 'MTN_REQUEST_UNCERTAIN';
    throw error;
  }
  if (response.status >= 500) {
    const error = new Error('MTN did not confirm whether it accepted the request. The order remains pending while the status is checked.');
    error.code = 'MTN_REQUEST_UNCERTAIN';
    throw error;
  }
  if (response.status !== 202) {
    throw new Error('MTN did not accept the payment request. Check the sandbox account and phone number.');
  }
  return { referenceId, accepted: true };
}

async function getMtnRequestStatus(referenceId) {
  const accessToken = await getMtnAccessToken();
  const response = await fetchWithTimeout(
    `${MTN_SANDBOX_BASE_URL}/collection/v1_0/requesttopay/${encodeURIComponent(referenceId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Target-Environment': 'sandbox',
        'Ocp-Apim-Subscription-Key': process.env.MTN_COLLECTION_SUBSCRIPTION_KEY
      }
    }
  );
  if (!response.ok) throw new Error('MTN could not confirm this payment status yet.');
  const result = await response.json();
  return typeof result.status === 'string' ? result.status.toUpperCase() : 'PENDING';
}

function createStripeClient() {
  const missing = missingStripeConfiguration();
  if (missing.length) {
    const error = new Error('Stripe Checkout is not configured on this server.');
    error.statusCode = 503;
    error.code = 'PAYMENT_PROVIDER_NOT_CONFIGURED';
    error.missing = missing;
    throw error;
  }
  if (!isAllowedPublicUrl(process.env.CHECKOUT_RETURN_URL)) {
    const error = new Error('CHECKOUT_RETURN_URL must be a public HTTPS URL (localhost is allowed for development).');
    error.statusCode = 503;
    error.code = 'PAYMENT_PROVIDER_NOT_CONFIGURED';
    throw error;
  }
  if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    const error = new Error('Only Stripe test-mode credentials are enabled for this deployment.');
    error.statusCode = 503;
    error.code = 'PAYMENT_PROVIDER_NOT_CONFIGURED';
    throw error;
  }
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

module.exports = {
  MTN_SANDBOX_BASE_URL,
  missingStripeConfiguration,
  missingMtnConfiguration,
  assertMtnConfiguration,
  isAllowedPublicUrl,
  startMtnRequest,
  getMtnRequestStatus,
  createStripeClient
};
