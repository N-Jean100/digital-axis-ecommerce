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
