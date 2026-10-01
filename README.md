# Kinship Contact Vault

A responsive React/Vite frontend and Express/MongoDB backend for the supplied contact-sync project. Sign-in, contact sync, and export are available without payment.

## Start locally

1. Install Node.js and MongoDB, and make sure MongoDB is running.
2. In one terminal, open `backend`, copy `.env.example` to `.env`, then run `npm install` and `npm start`. Wait for `Server running on port 5000` before continuing. If the terminal reports `MongoDB connection failed`, start MongoDB and restart the backend.
3. In a second terminal, open `frontend`, run `npm install` and `npm run dev`.
4. Open the local URL printed by Vite. In development, Vite forwards `/api` requests to `http://127.0.0.1:5000`, so the browser does not need a hard-coded backend host.

If the API runs on another host or port during development, create `frontend/.env` with `VITE_API_PROXY_TARGET=http://127.0.0.1:5000` (replace the address as needed) and restart Vite. For a deployed frontend, set `VITE_API_BASE_URL` to the full API base URL when building the app.

### If sign-in still fails

- `ERR_CONNECTION_REFUSED`: the backend is not listening. Check the backend terminal and confirm it prints `Server running on port 5000`; MongoDB must connect first.
- `404` for `/api/login`: confirm the backend is this project's `backend/server.js`, restart it, then restart Vite so the proxy is active. The login route is `POST /api/login`.
- Open browser developer tools' Network panel and check that the request URL begins with the same Vite origin and `/api/login`, rather than `localhost:5000`.

## Current limitations

- Payment has been removed from the app flow. The legacy `/api/pay-and-set-days` endpoint is retained for compatibility and returns HTTP 501 without activating a plan.
- The supplied username-only login has no password or session authentication. It is suitable only as a prototype; usernames alone must not be treated as secure account access.
- Contact Picker availability depends on browser support and a secure context. On Android, use the latest Chrome and open the site's HTTPS URL as a normal page. The picker is opened directly from the button tap, checks secure-context/API support, and handles cancellation and unsupported browsers. Other mobile browsers may not expose the web Contact Picker API.
- Existing expiry dates and payment flags are retained in the database for compatibility but no longer gate sync or export, and expired plans no longer trigger automatic contact deletion.

## API contract

- `POST /api/login` — `{ username }`
- `POST /api/pay-and-set-days` — legacy placeholder; returns 501 without activating a plan
- `POST /api/sync-contacts` — `{ username, contacts }`
- `GET /api/get-contacts/:username`

The exported `.vcf` is vCard 3.0 with escaped text and every available name, telephone number, and email address.
