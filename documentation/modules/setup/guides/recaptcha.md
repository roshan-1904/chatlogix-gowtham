# reCAPTCHA Setup Guide

## Problem: Hostname match not found / SITE_MISMATCH

Use **`http://127.0.0.1:3000`** (not `localhost`) and add **`127.0.0.1`** to Firebase Authorized domains. Ensure the Web reCAPTCHA platform key includes the same hostname.

## Problem: SITE_MISMATCH Error

If you're seeing the error:
```
CAPTCHA_CHECK_FAILED : Recaptcha verification failed - SITE_MISMATCH
```

This means the reCAPTCHA site key in your frontend doesn't match the one configured in Firebase Console.

## Solution

### Step 1: reCAPTCHA params (current implementation)

Login no longer uses a static `VITE_RECAPTCHA_SITE_KEY`. The frontend calls:

```
GET /api/auth/recaptcha-params
```

and renders invisible reCAPTCHA with the returned `recaptchaSiteKey` **and** `recaptchaStoken`.

See `frontend_v2/apps/web-vendor/src/lib/firebaseRecaptcha.ts` and `documentation/modules/authentication/guides/authentication.md`.

### Step 1 (legacy): Static site key from Firebase Console

If debugging an older build that still used `react-google-recaptcha`:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Authentication** → **Settings** → **reCAPTCHA**
4. Copy the **Site Key** (not the Secret Key)

### Step 2: Update Frontend Environment

Update your `.env.local` file in the frontend app:

**For web-vendor (`frontend_v2/apps/web-vendor/.env.local`):**
```env
VITE_RECAPTCHA_SITE_KEY=your-actual-site-key-from-firebase
```

**For web-admin (`frontend_v2/apps/web-admin/.env.local`):**
```env
VITE_RECAPTCHA_SITE_KEY=your-actual-site-key-from-firebase
```
(Note: `web-admin` is still scaffolding — its `Login.tsx` is currently a placeholder with no real Firebase/reCAPTCHA wiring yet, even though `env.template` already reserves this variable. The steps below are only exercised by `web-vendor` today.)

### Step 3: Restart the Frontend Server

After updating the `.env.local` file, restart your frontend development server:

```bash
# Stop the current server (Ctrl+C)
# Then restart
npm run dev
```

## Important Notes

- The **Site Key** is public and safe to use in frontend code
- The **Secret Key** should only be used in the backend (if needed)
- The site key must match exactly what's configured in Firebase Console
- Google's test keys (like `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI`) will NOT work with Firebase

## Development vs Production

- **Development**: Use the site key from your Firebase project
- **Production**: Use the same site key, or create a separate reCAPTCHA site for production

## Troubleshooting

1. **Still getting SITE_MISMATCH?**
   - Double-check the site key in Firebase Console
   - Make sure you copied the Site Key (not Secret Key)
   - Clear browser cache and restart the dev server

2. **reCAPTCHA not showing?**
   - Check that `VITE_RECAPTCHA_SITE_KEY` is set in `.env.local`
   - Make sure the file is named `.env.local` (not `.env`)
   - Restart the dev server after changing environment variables

3. **Need to create a new reCAPTCHA site?**
   - Go to [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin)
   - Create a new site
   - Add the domain (e.g., `localhost` for development)
   - Copy the Site Key to your `.env.local` file
   - Update Firebase Console with the new Secret Key

