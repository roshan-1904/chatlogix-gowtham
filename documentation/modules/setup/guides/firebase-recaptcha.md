# Configuring reCAPTCHA Authorized Domains in Firebase

## If You Only See "Copy key" Button

When you see the "Copy key" button instead of three dots (⋮), use these steps:

## Method 1: Use "Configure site keys" Button

1. **Click the "Configure site keys" button** (top right of the table)
2. This will open a dialog/modal with all your keys
3. Find the "ChatLogix" entry (web platform)
4. Click on it or click "Edit"
5. Look for **"Authorized domains"** section
6. Add `localhost` if it's not there
7. Save

## Method 2: Click on the Key Name

1. **Click directly on "ChatLogix"** (the name in the table)
2. This should open the key details
3. Look for **"Authorized domains"** or **"Domains"** section
4. Add `localhost`
5. Save

## Method 3: Check Authentication Settings

If the above don't work, authorized domains might be in a different place:

1. Go to **Authentication → Settings** (not the reCAPTCHA tab)
2. Look for **"Authorized domains"** section
3. Make sure `localhost` is listed there
4. If not, click "Add domain" and add `localhost`

## What to Look For

When configuring authorized domains, you should see:
- A list of domains like: `yourdomain.com`, `localhost`, etc.
- An "Add domain" or "+" button
- The ability to add `localhost` for local development

## Important Notes

- **For development**: You need `localhost` in authorized domains
- **For production**: You'll need your actual domain (e.g., `chatlogix.com`)
- Some Firebase projects have separate domain lists for different features
- The reCAPTCHA authorized domains might be separate from general authorized domains

## If You Can't Find Authorized Domains

1. **Try clicking "Configure site keys"** - this usually opens the full configuration
2. **Check if there's an "Edit" button** next to the ChatLogix entry
3. **Look for a settings/gear icon** near the key
4. **Try right-clicking** on the ChatLogix row (some UIs have context menus)

## Alternative: Create a New Key

If you can't edit the existing key:

1. Click **"Configure site keys"**
2. Click **"Add key"** or **"Create new"**
3. Configure:
   - **Platform**: Web
   - **Name**: ChatLogix (or ChatLogix-dev)
   - **Authorized domains**: Add `localhost`
4. Copy the new Site Key
5. Update `.env.local` with the new key
6. Restart your dev server

## Quick Check

After adding `localhost`:
1. Save the configuration
2. Wait a few seconds for Firebase to update
3. Try logging in again
4. The SITE_MISMATCH error should be resolved

