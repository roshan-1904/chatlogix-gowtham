# Authentication Setup

This project now uses Firebase phone number authentication mediated entirely through the backend. The frontend never calls Firebase directly and only talks to the new `/auth/*` endpoints.

## Backend configuration

Set the following environment variables (for local development you can add them to `backend/.env`):

| Variable | Description |
| --- | --- |
| `AUTH_JWT_SECRET` | Secret used to sign session JWTs returned to the frontend. |
| `AUTH_TOKEN_EXPIRES_IN` | Optional token lifetime (default `1h`). |
| `AUTH_ADMIN_PHONES` | Comma-separated list of administrator phone numbers (numbers are normalised when evaluating roles). |
| `FIREBASE_PROJECT_ID` | Firebase project id from the service account. |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account client email. |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key. Use `\n` for newlines if storing inline. |
| `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` | Optional path to a JSON service account file (use instead of `FIREBASE_PRIVATE_KEY`). |
| `FIREBASE_API_KEY` | REST API key used for `accounts:sendVerificationCode` and `accounts:signInWithPhoneNumber`. |
| `RECAPTCHA_SECRET_KEY` | Optional – required if you want the backend to verify reCAPTCHA tokens. |

> **Note:** All existing required env vars (`DATABASE_URL`, queue urls, etc.) are still needed.

## Backend endpoints

- `POST /auth/send-code` – expects `{ phoneNumber, recaptchaToken }`. Triggers Firebase to send an OTP.
- `POST /auth/verify-code` – expects `{ phoneNumber, sessionInfo, code }`. Verifies the OTP, resolves roles (admin/vendor) and returns `{ token, user: { phoneNumber, roles, vendorId? } }`.

All `/api/*` routes now require a Bearer token. Admin-only routes include the vendors list and onboarding helpers; vendor scoped routes are filtered so vendors only see their own data.

## Frontend flow

1. Users land on the new phone login page (`LoginPage`).
2. On submit we execute invisible reCAPTCHA (if a site key is configured) and call `/auth/send-code`.
3. After receiving the OTP, the user submits the code; the frontend calls `/auth/verify-code`.
4. The returned JWT + user record are stored in both memory and `localStorage`.
5. `AuthProvider` adds the `Authorization` header to every request via the shared API client and automatically logs out on a `401`.

### Environment variables (frontend)

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | Base URL for the backend. |
| `VITE_RECAPTCHA_SITE_KEY` | Optional site key used by the login page. |

## Role behaviour

- **Admins** (phones present in `AUTH_ADMIN_PHONES`) can:
  - See the conversation testing tools.
  - List and manage all vendors.
  - View any vendor’s orders/conversations.
- **Vendors** (matched by phone number on their vendor record) can:
  - Only see their own conversations and orders.
  - The UI hides cross-vendor navigation and auto-selects their vendor profile.

The backend enforces the same rules via middleware:

- `authenticate` parses the JWT and attaches `req.user`.
- `requireRole` guards admin-only endpoints.
- `requireVendorAccess` ensures vendor scoped routes only expose matching vendor records.

## Testing

Run backend unit tests (includes token service coverage):

```bash
cd backend
npm test
```

The frontend build (`npm run build` in `frontend`) validates the new auth flow compiles.


