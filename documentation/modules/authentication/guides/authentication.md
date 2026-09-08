# Authentication Setup



This project uses Firebase phone number authentication mediated entirely through the backend. The frontend never calls Firebase directly and only talks to the `/api/auth/*` endpoints.



Sessions use a **dual-token model**: a short-lived access JWT in `localStorage` and a long-lived refresh token in an **httpOnly cookie** on the API host.



## Backend configuration



Set the following environment variables (for local development you can add them to `backend/.env`):



| Variable | Description |

| --- | --- |

| `AUTH_JWT_SECRET` | Secret used to sign access JWTs returned to the frontend. |

| `AUTH_ACCESS_TOKEN_EXPIRES_IN` | Access JWT lifetime (default `1h`). |

| `AUTH_TOKEN_EXPIRES_IN` | Deprecated alias for `AUTH_ACCESS_TOKEN_EXPIRES_IN` (kept for one release). |

| `AUTH_REFRESH_TOKEN_EXPIRES_IN` | Refresh cookie + DB expiry (default `7d`). |

| `AUTH_COOKIE_SECURE` | Optional. When `true`/`false`, overrides the Secure cookie flag. Defaults to secure in production. |

| `CORS_ALLOWED_ORIGINS` | Comma-separated browser origins allowed to send credentials, e.g. `http://127.0.0.1:3000,https://app.chatlogix.in`. |

| `AUTH_ADMIN_PHONES` | Comma-separated list of administrator phone numbers (numbers are normalised when evaluating roles). |

| `FIREBASE_API_KEY` | **Required for production SMS.** Web API key for Identity Toolkit `accounts:sendVerificationCode` and `accounts:signInWithPhoneNumber`. |

| `AUTH_ALLOW_DEV_OTP` | Optional. When `false`, disables the local `123456` fallback even in development. Ignored in production. |

| `FIREBASE_PROJECT_ID` | Firebase project id (Admin SDK / other features; not required for SMS OTP). |

| `FIREBASE_CLIENT_EMAIL` | Firebase service account client email (Admin SDK). |

| `FIREBASE_PRIVATE_KEY` | Firebase service account private key. Use `\n` for newlines if storing inline. |

| `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` | Optional path to a JSON service account file (use instead of `FIREBASE_PRIVATE_KEY`). |



> **Note:** `RECAPTCHA_SECRET_KEY` is **not** used on the login path. Firebase Phone Auth validates the invisible reCAPTCHA token from the frontend widget via Identity Toolkit — do not call `google.com/recaptcha/api/siteverify` on that token.



> **Note:** All existing required env vars (`DATABASE_URL`, queue urls, etc.) are still needed.



## Token model



| Token | Lifetime | Client storage | Server |

| --- | --- | --- | --- |

| **Access JWT** | `1h` (configurable) | `localStorage` (`chatlogix_auth_token`) | Stateless verify via `AUTH_JWT_SECRET` |

| **Refresh** | `7d` (configurable) | httpOnly cookie `chatlogix_refresh` on API host (`path=/api/auth`) | SHA-256 hash in `RefreshToken` table; rotated on each refresh |



## Backend endpoints



- `GET /api/auth/recaptcha-params` – returns `{ recaptchaSiteKey, recaptchaStoken }` from Firebase Identity Toolkit. The frontend uses these (with `stoken`) to generate a token Firebase accepts; a static `VITE_RECAPTCHA_SITE_KEY` alone causes `SITE_MISMATCH`.

- `POST /api/auth/send-code` – expects `{ phoneNumber, recaptchaToken? }`. When `FIREBASE_API_KEY` is set, `recaptchaToken` is required and Firebase sends the SMS. Returns `{ sessionInfo, expiresIn, delivery }` where `delivery` is `firebase` or `dev`. App-level limits: **60s cooldown** and **5 sends/hour per phone** (Redis when `REDIS_URL` is set, otherwise in-memory). On **429** responses include `Retry-After` and `error.retryAfter` (seconds).

- `POST /api/auth/verify-code` – expects `{ phoneNumber, sessionInfo, code }`. Verifies the OTP, resolves roles (admin/vendor), returns `{ token, user: { phoneNumber, roles, vendorId? }, isNewUser }`, and sets the refresh cookie.

- `POST /api/auth/refresh` – reads the `chatlogix_refresh` cookie, validates + rotates the server-side refresh token, returns `{ token, user }`, and sets a new refresh cookie. No Bearer token required.

- `POST /api/auth/logout` – revokes the refresh token if present, clears the cookie, returns **204**.



When `FIREBASE_API_KEY` is unset and `NODE_ENV` is not `production`, the backend uses an in-memory dev session with code `123456` (`delivery: 'dev'`). Production without `FIREBASE_API_KEY` returns **503**.



Phones that are neither a Vendor row nor in `AUTH_ADMIN_PHONES` still receive **403** after a valid OTP.



All other `/api/*` routes require a Bearer access token except `/api/auth/*` and webhooks.



## Frontend flow



1. Users land on the phone login page (`frontend_v2/apps/web-vendor/src/pages/Login.tsx`).

2. On submit the app loads Firebase `recaptchaParams` from the backend, renders invisible reCAPTCHA with `stoken`, and calls `/api/auth/send-code` with the token.

3. In local dev without `FIREBASE_API_KEY`, send-code may proceed without a token; the backend uses the dev OTP path.

4. When `delivery === 'dev'`, the login page shows a hint that the code is `123456`.

5. After receiving the OTP, the user submits the code; the frontend calls `/api/auth/verify-code` with `credentials: 'include'`.

6. The returned access JWT + user record are stored in memory and `localStorage`; the refresh token stays in the httpOnly cookie.

7. On app load, `AuthProvider` calls `POST /api/auth/refresh` when the access JWT is missing or expired.

8. The shared API client retries once on **401** by calling refresh, then replays the original request.

9. Logout calls `POST /api/auth/logout` (cookie cleared server-side) and removes the access token locally.



### Environment variables (frontend)



| Variable | Description |

| --- | --- |

| `VITE_API_URL` | Base URL for the backend. Must be the API origin so refresh cookies are sent. |

| `VITE_RECAPTCHA_SITE_KEY` | **Optional.** Legacy; login now uses `GET /api/auth/recaptcha-params` instead. |



## Firebase Console checklist (before production login)



1. **Authentication → Sign-in method → Phone** — enabled.

2. **Authentication → Settings → reCAPTCHA** — Web platform site key (ChatLogix). Domains must include production hosts (`chatlogix.in`, `app.chatlogix.in`) and local dev (`127.0.0.1`; add `localhost` if you use it).

3. **Authentication → Settings → Authorized domains** — `127.0.0.1`, `localhost` (optional), `chatlogix.in`, `app.chatlogix.in` (when CloudFront exists).

4. **Project settings → General → Web API Key** → backend `FIREBASE_API_KEY` (server `.env` on EC2, **not** GitHub). Restart PM2 after changes.

5. **Google Cloud → Credentials** — API key used as `FIREBASE_API_KEY`: Application restrictions **None** or EC2 IP (not HTTP referrers); API restrictions include **Identity Toolkit API**.

6. **Blaze billing** — required for SMS to real phone numbers.



## Local development notes (verified Sep 2026)



- Use **`http://127.0.0.1:3000/login`** (Vite binds to `127.0.0.1`). Firebase often rejects reCAPTCHA tokens from `localhost` (`Hostname match not found`).

- Frontend loads **`GET /api/auth/recaptcha-params`** and renders invisible reCAPTCHA with **`stoken`** (`frontend_v2/apps/web-vendor/src/lib/firebaseRecaptcha.ts`). Do not use Google's test key (`6LeIxAcTAAAA...`).

- Without `FIREBASE_API_KEY`: dev OTP **`123456`** (`delivery: 'dev'`).

- With `FIREBASE_API_KEY` but repeated Firebase failures (e.g. `TOO_MANY_ATTEMPTS_TRY_LATER`): after **2** failed sends, non-production falls back to dev OTP **`123456`** when `AUTH_ALLOW_DEV_OTP` is not `false`. Or unset `FIREBASE_API_KEY` locally to skip Firebase entirely.

- Firebase `TOO_MANY_ATTEMPTS_TRY_LATER` is enforced by Google (often ~15 minutes). Wait before retrying the same number; avoid rapid resend clicks during testing.

- Set `CORS_ALLOWED_ORIGINS=http://127.0.0.1:3000` and ensure all auth/API fetches use `credentials: 'include'`.



## Production deployment



| Variable | Where |

| --- | --- |

| `FIREBASE_API_KEY`, `AUTH_JWT_SECRET`, `AUTH_REFRESH_TOKEN_EXPIRES_IN`, `CORS_ALLOWED_ORIGINS` | EC2 `backend/.env` → `pm2 restart chatlogix-backend --update-env` |

| `VITE_API_URL` | GitHub Actions **variable** (frontend build) |

| `VITE_RECAPTCHA_SITE_KEY` | **Not required** (runtime via `recaptcha-params`) |



Example production values:



- `AUTH_REFRESH_TOKEN_EXPIRES_IN=7d`

- `CORS_ALLOWED_ORIGINS=https://app.chatlogix.in,https://chatlogix.in`

- Refresh cookie uses `SameSite=None; Secure` when `AUTH_COOKIE_SECURE` is true (production default).



## Role behaviour



- **Admins** (phones in `AUTH_ADMIN_PHONES`) can list and manage all vendors.

- **Vendors** (matched by phone on their vendor record) see only their own data.



The backend enforces the same rules via `authenticate`, `requireRole`, and `requireVendorAccess`.



## Testing



```bash

cd backend

npm test -- src/services/__tests__/refreshTokenService.test.ts

npm test -- src/routes/__tests__/auth.refresh.test.ts

npm test -- test/auth/tokenService.test.ts

```



Manual checks:



1. Local, no `FIREBASE_API_KEY`: send code → OTP step → `123456` → JWT + refresh cookie for an existing vendor phone.

2. With Firebase + site key: real SMS; `123456` fails.

3. Unknown phone on **login**: still 403 until public signup is implemented (see [Public Signup & Trial Onboarding](../../features/vendor-onboarding/guides/public-signup-onboarding.md)).

4. Production without `FIREBASE_API_KEY`: send-code 503.

5. Close tab, reopen within 7 days: app restores session via `/auth/refresh` without re-entering OTP.

6. Logout clears cookie; refresh returns 401.



## Notes



- Catalog-import SSE still uses `?token=` access JWT; long imports may need a page refresh if access expires mid-stream (acceptable v1).


