# How to Get Your reCAPTCHA Site Key from Firebase Console

## You're in the Right Place! ✅

You're looking at the Firebase Console → Authentication → Settings → reCAPTCHA page.

## Steps to Get the Site Key:

### Option 1: Click on the "ChatLogix" Entry

1. In the "Configured platform site keys" table, find the row with:
   - **Platform**: `</>` (web icon)
   - **Name**: "ChatLogix"
   
2. Click on the **three dots (⋮)** icon on the right side of that row

3. Select **"View details"** or **"Edit"**

4. You'll see the **Site Key** displayed there - copy it!

### Option 2: Use "Configure site keys" Button

1. Click the **"Configure site keys"** button (top right of the table)

2. Find the "ChatLogix" entry in the list

3. Click on it to view details

4. Copy the **Site Key** (it will look something like: `6Lc...` or `6Le...`)

## What to Copy:

- ✅ Copy the **Site Key** (public key, starts with `6L...`)
- ❌ Do NOT copy the Secret Key (that's for backend only)

## After Getting the Key:

1. Open `frontend_v2/apps/web-vendor/.env.local`
2. Replace the test key with your actual key:
   ```env
   VITE_RECAPTCHA_SITE_KEY=your-actual-key-from-firebase
   ```
3. Save the file
4. Restart your frontend dev server

## The Key Should Look Like:

```
6LcAbCdEfGhIjKlMnOpQrStUvWxYz1234567890
```

It's a long string of letters and numbers, typically starting with `6L`.

