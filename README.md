# Kinship Contact Vault

Responsive React/Vite frontend and Express/MongoDB API. Accounts use a username and password. Contacts can be selected in the mobile browser picker or imported in bulk from one `.vcf` file.

## Contact selection

The phone's browser controls the native contact picker. Websites cannot programmatically select the entire address book. For a bulk transfer, export the phone contacts as one `.vcf` file from the Contacts app, then choose **Import many contacts (.vcf)** in the vault. The importer accepts multiple vCards from one file.

## Contact retention

Choose a retention period from 1 to 3650 days before syncing or importing. Saving contacts sets the vault's expiration from that moment; another sync or import replaces the current vault and starts a fresh timer. MongoDB's TTL index removes expired vault documents automatically, and the API also checks expiration when the vault is requested. Expiration is at the selected deadline, with MongoDB's TTL cleanup running asynchronously shortly after it.

## Run locally

1. Install Node.js and MongoDB.
2. In `backend`, copy `.env.example` to `.env`. Set `MONGO_URI` and replace `JWT_SECRET` with a random secret of at least 32 characters. Then run `npm install` and `npm start`.
3. In `frontend`, copy `.env.example` to `.env`, then run `npm install` and `npm run dev`.
4. Open the Vite URL. In development, `/api` is proxied to `http://127.0.0.1:5000`.

## Deploy

- Deploy the `backend` folder as the Render web service. Set `MONGO_URI`, `JWT_SECRET` (a private random secret of at least 32 characters), and `PORT` if required. Deploy the updated backend code; the old username-only API will not work with the password-based frontend.
- Deploy the `frontend` folder to Vercel. Set `VITE_API_BASE_URL` to `https://contactadd.onrender.com` in the Vercel frontend project's environment variables, then redeploy. Vite embeds this variable during the frontend build.
- MongoDB Atlas must allow network connections from the Render service. Do not put the JWT secret in any `VITE_` variable or frontend environment file.

## Accounts and data

- Registration creates the account and signs the user in. Passwords are bcrypt-hashed; incorrect credentials return an error. API sessions use a signed token that expires after seven days.
- This version removes Firebase phone OTP. Existing Firebase-only users must register a password account. Passwordless legacy accounts cannot be safely claimed automatically; choose a new username if that username already exists.
- Contacts are stored in a separate MongoDB vault document with a TTL index. Legacy contacts embedded in older User documents are not imported into new accounts.
- Payment remains removed. The old `/api/pay-and-set-days` endpoint remains only as a 501 compatibility response and never activates a plan.

## API

- `POST /api/register` — `{ username, password }`
- `POST /api/login` — `{ username, password }`
- `POST /api/sync-contacts` — authenticated; `{ contacts, retentionDays }`
- `GET /api/get-contacts/:username` — authenticated, username must match the token
- `GET /api/health` — backend health check
