# Authentication Setup

This project uses Firebase phone number authentication mediated entirely through the backend. The frontend never calls Firebase directly and only talks to the `/api/auth/*` endpoints.

## Backend configuration

Set the following environment variables (for local development you can add them to `backend/.env`):

| Variable | Description |
| --- | --- |
| `AUTH_JWT_SECRET` | Secret used to sign session JWTs returned to the frontend. |
| `AUTH_TOKEN_EXPIRES_IN` | Optional token lifetime (default `1h`). |
| `AUTH_ADMIN_PHONES` | Comma-separated list of administrator phone numbers (numbers are normalised when evaluating roles). |
| `FIREBASE_API_KEY` | **Required for production SMS.** Web API key for Identity Toolkit `accounts:sendVerificationCode` and `accounts:signInWithPhoneNumber`. |
| `AUTH_ALLOW_DEV_OTP` | Optional. When `false`, disables the local `123456` fallback even in development. Ignored in production. |
| `FIREBASE_PROJECT_ID` | Firebase project id (Admin SDK / other features; not required for SMS OTP). |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account client email (Admin SDK). |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key. Use `\n` for newlines if storing inline. |
| `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` | Optional path to a JSON service account file (use instead of `FIREBASE_PRIVATE_KEY`). |

> **Note:** `RECAPTCHA_SECRET_KEY` is **not** used on the login path. Firebase Phone Auth validates the invisible reCAPTCHA token from the frontend widget via Identity Toolkit — do not call `google.com/recaptcha/api/siteverify` on that token.

> **Note:** All existing required env vars (`DATABASE_URL`, queue urls, etc.) are still needed.

## Backend endpoints

- `GET /api/auth/recaptcha-params` – returns `{ recaptchaSiteKey, recaptchaStoken }` from Firebase Identity Toolkit. The frontend uses these (with `stoken`) to generate a token Firebase accepts; a static `VITE_RECAPTCHA_SITE_KEY` alone causes `SITE_MISMATCH`.
- `POST /api/auth/send-code` – expects `{ phoneNumber, recaptchaToken? }`. When `FIREBASE_API_KEY` is set, `recaptchaToken` is required and Firebase sends the SMS. Returns `{ sessionInfo, expiresIn, delivery }` where `delivery` is `firebase` or `dev`.
- `POST /api/auth/verify-code` – expects `{ phoneNumber, sessionInfo, code }`. Verifies the OTP, resolves roles (admin/vendor) and returns `{ token, user: { phoneNumber, roles, vendorId? }, isNewUser }`.

When `FIREBASE_API_KEY` is unset and `NODE_ENV` is not `production`, the backend uses an in-memory dev session with code `123456` (`delivery: 'dev'`). Production without `FIREBASE_API_KEY` returns **503**.

Phones that are neither a Vendor row nor in `AUTH_ADMIN_PHONES` still receive **403** after a valid OTP.

All `/api/*` routes require a Bearer token except `/api/auth/*` and webhooks.

## Frontend flow

1. Users land on the phone login page (`frontend_v2/apps/web-vendor/src/pages/Login.tsx`).
2. On submit the app loads Firebase `recaptchaParams` from the backend, renders invisible reCAPTCHA with `stoken`, and calls `/api/auth/send-code` with the token.
3. In local dev without `FIREBASE_API_KEY`, send-code may proceed without a token; the backend uses the dev OTP path.
4. When `delivery === 'dev'`, the login page shows a hint that the code is `123456`.
5. After receiving the OTP, the user submits the code; the frontend calls `/api/auth/verify-code`.
6. The returned JWT + user record are stored in both memory and `localStorage`.
7. `AuthProvider` (`frontend_v2/packages/auth`) adds the `Authorization` header to every request via the shared API client and automatically logs out on a `401`.

### Environment variables (frontend)

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | Base URL for the backend. |
| `VITE_RECAPTCHA_SITE_KEY` | **Optional.** Legacy; login now uses `GET /api/auth/recaptcha-params` instead. |

## Firebase Console checklist (before production login)

1. **Authentication → Sign-in method → Phone** — enabled.
2. **Authentication → Settings → reCAPTCHA** — register a production site key (not Google’s test key). Use the same value for `VITE_RECAPTCHA_SITE_KEY` in vendor `.env` / CI secrets.
3. **Authentication → Settings → Authorized domains** — add `localhost` and `chatlogix.in` (add `app.chatlogix.in` when CloudFront exists).
4. **Project settings → General → Web API Key** — set as `FIREBASE_API_KEY` on the backend. Restart the API after changing env.

## Role behaviour

- **Admins** (phones in `AUTH_ADMIN_PHONES`) can list and manage all vendors.
- **Vendors** (matched by phone on their vendor record) see only their own data.

The backend enforces the same rules via `authenticate`, `requireRole`, and `requireVendorAccess`.

## Testing

```bash
cd backend
npm test -- src/services/__tests__/phoneAuth.test.ts
```

Manual checks:

1. Local, no `FIREBASE_API_KEY`: send code → OTP step → `123456` → JWT for an existing vendor phone.
2. With Firebase + site key: real SMS; `123456` fails.
3. Unknown phone after OTP: still 403 until signup exists.
4. Production without `FIREBASE_API_KEY`: send-code 503.
