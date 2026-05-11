# Quick Fix: reCAPTCHA SITE_MISMATCH Error

## The Problem
You're seeing this error:
```
CAPTCHA_CHECK_FAILED : Recaptcha verification failed - SITE_MISMATCH
```

This happens because your `.env.local` file has a test reCAPTCHA key that doesn't match Firebase.

## Quick Solution (3 Steps)

### Step 1: Get the Site Key from Firebase Console

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Authentication** → **Settings** tab → Scroll to **reCAPTCHA** section
4. Copy the **Site Key** (the public key, not the secret)

### Step 2: Update Your .env.local File

Open `frontend_v2/apps/web-vendor/.env.local` and replace the reCAPTCHA key:

```env
VITE_RECAPTCHA_SITE_KEY=paste-your-firebase-site-key-here
```

**Remove the test key** `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI` and replace it with the actual key from Firebase.

### Step 3: Restart Your Dev Server

1. Stop the frontend dev server (Ctrl+C)
2. Start it again: `npm run dev` (from `frontend_v2/`)

## That's It!

After these 3 steps, try logging in again. The error should be resolved.

## Still Having Issues?

- Make sure you copied the **Site Key** (not Secret Key) from Firebase
- Verify the key in `.env.local` has no extra spaces or quotes
- Clear your browser cache
- Check that the file is named `.env.local` (not `.env`)

## Need More Help?

See `frontend_v2/RECAPTCHA_SETUP.md` for detailed troubleshooting.

