# DIGITAL Axis

## Product discovery assistant

The floating **Ask Axis** assistant is available throughout the React app and answers from the live MongoDB product catalog. It can find in-stock items by name, category, description, or location and apply a maximum-price filter (for example, “under 10,000 RWF”). Product location is optional; vendors can add it when creating a product.

The public backend endpoint is `POST /api/chat` with a JSON body such as `{"message":"Find accessories in Kigali under 20000 RWF"}`. It returns an assistant reply and up to four matching products. Requests must contain 1–500 characters. No third-party AI credentials or additional environment variables are required; the frontend uses `VITE_API_URL` when configured and otherwise calls `http://localhost:5000/api`.

## Admin access

Admin access is granted to an existing account by a project operator from the backend project directory:

```powershell
npm run admin:set -- <existing-user-email>
```

This command updates the account role directly in MongoDB and does not expose public admin registration. The promoted user must sign out and sign back in before the Admin button appears. The Admin button is shown only for accounts with the `admin` role.

## Buyer and seller messages

Customers can start a product-specific conversation with its seller using **Message seller** on a product card. Vendors can reply from **Messages** in the workspace. Text conversations are stored in MongoDB and refresh automatically while open.

Participants can also record and send voice notes up to 2 minutes and 5 MiB; audio files are stored in MongoDB GridFS and are only streamed to conversation participants. Voice notes require microphone permission and a secure browser context (HTTPS, or localhost).

One-to-one browser video calls use authenticated Socket.IO signaling and WebRTC. Camera and microphone permissions are required; calls currently ring for up to 60 seconds. The app uses a public STUN server by default. For reliable connectivity across restrictive networks, configure a TURN service using coturn's shared-secret REST authentication:

```text
TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349
TURN_SHARED_SECRET=<coturn-static-auth-secret>
FRONTEND_ORIGIN=https://your-frontend.example.com
```

TURN credentials are generated for the authenticated user and expire after 10 minutes. Configure coturn with `use-auth-secret` and the matching `static-auth-secret`. Serve the frontend over HTTPS in production for browser camera access. If the backend and frontend share an origin, `FRONTEND_ORIGIN` can be omitted.

## Customer checkout and payments

Customers can add catalog products to a local cart and submit an order using **MTN Mobile Money** or **Stripe Checkout**. The browser submits only product IDs and integer quantities. The backend reloads product records, verifies stock, snapshots names and prices, and calculates the RWF total. Every order is owned by the authenticated customer and starts `pending`; only provider-confirmed payment can make it `paid`. Product stock is decremented with conditional atomic updates and duplicate payment notifications cannot reserve it twice. Card details are collected only on Stripe-hosted Checkout.

Sandbox/test mode is enforced by default: MTN uses its sandbox API, and Stripe accepts only `sk_test_` secret keys. Live payment processing is deliberately disabled. Configure provider credentials on the backend only; never put them in frontend `VITE_*` variables or commit them:

```dotenv
# Common public return page (use your deployed frontend URL in production)
CHECKOUT_RETURN_URL=http://localhost:5173/

# Stripe test mode: use test credentials and the webhook signing secret
STRIPE_SECRET_KEY=sk_test_replace_me
STRIPE_WEBHOOK_SECRET=whsec_replace_me

# MTN Collections sandbox. Provision a sandbox API user/key and subscription key
# from the MTN MoMo Developer portal; values are not supplied by this project.
MTN_TARGET_ENVIRONMENT=sandbox
MTN_COLLECTION_SUBSCRIPTION_KEY=replace_me
MTN_COLLECTION_API_USER=replace_me
MTN_COLLECTION_API_KEY=replace_me
MTN_CALLBACK_URL=https://your-public-host.example/api/checkout/mtn/callback
```

For local Stripe webhook testing, install/run the Stripe CLI and forward events to the raw-body endpoint:

```powershell
stripe listen --forward-to localhost:5000/api/checkout/stripe/webhook
```

Put the `whsec_...` value printed by the CLI in `STRIPE_WEBHOOK_SECRET`, then restart the backend. In deployment, register `https://your-backend.example/api/checkout/stripe/webhook` as a Stripe webhook endpoint and use its signing secret. The webhook is mounted before JSON body parsing so Stripe signature verification receives the original request bytes.

MTN callback notifications are treated only as a signal to query MTN's authenticated Collections request-to-pay status endpoint; callback-supplied status text is never trusted. The API also checks provider status when the authenticated customer polls their own order. Point `MTN_CALLBACK_URL` at the public HTTPS endpoint above for a reachable deployment. Use a secure tunnel for local callback tests. Only the MTN sandbox target is enabled; production MTN credentials, environment selection, commercial onboarding, and live settlement require a separate operator/provider decision and are intentionally not enabled.

Provider-confirmed stock reservation and the transition to `paid` run in a MongoDB transaction. Configure `MONGO_URI` to a replica set (including Atlas); standalone MongoDB does not support this settlement path and the backend will fail closed with the order still pending rather than reporting payment or changing inventory non-atomically.

The customer API is mounted at `/api/checkout`:

- `POST /orders` accepts `{ "items": [{ "productId": "...", "quantity": 1 }], "paymentProvider": "mtn" | "stripe", "phone": "0781234567" }`. `phone` is used only for MTN. Client-supplied totals/user IDs are ignored.
- `GET /orders` lists only the signed-in customer's orders.
- `GET /orders/:orderId` reads only that customer's order and refreshes MTN status through the provider API.
- `POST /mtn/callback` is the MTN status-check callback endpoint; it does not accept client-declared payment success.
- `POST /stripe/webhook` is public to Stripe and requires a valid Stripe signature.

If provider configuration is missing, the order endpoint returns HTTP 503 with `PAYMENT_PROVIDER_NOT_CONFIGURED` and the missing backend variable names; it does not create an order or simulate payment. Mobile Money requests remain pending until MTN reports a terminal result. Returning from a browser checkout URL is not proof of payment. If payment is confirmed after the selected stock has become unavailable, the order is failed for fulfillment and flagged `INVENTORY_UNAVAILABLE_AFTER_PAYMENT`; the operator must handle the provider-side refund. No automatic refund integration is claimed.
