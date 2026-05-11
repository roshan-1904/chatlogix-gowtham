# Troubleshooting reCAPTCHA SITE_MISMATCH After Updating Key

## ✅ You've Updated the Key - Now What?

If you've updated `VITE_RECAPTCHA_SITE_KEY` in `.env.local` but still get SITE_MISMATCH:

## Step 1: RESTART the Frontend Dev Server ⚠️ CRITICAL

**Vite only loads environment variables when the server starts!**

1. **Stop** the frontend dev server:
   - Press `Ctrl+C` in the terminal where it's running
   - Wait for it to fully stop

2. **Start** it again:
   ```bash
   cd frontend_v2
   npm run dev
   ```

3. **Wait** for the server to fully start (you'll see "Local: http://localhost:3000")

## Step 2: Verify the Key is Loaded

After restarting, check the browser console:

1. Open browser DevTools (F12)
2. Go to Console tab
3. Type: `import.meta.env.VITE_RECAPTCHA_SITE_KEY`
4. Press Enter
5. It should show your new key (not the old test key)

If it still shows the old key, the server didn't restart properly.

## Step 3: Clear Browser Cache

1. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Or clear cache: DevTools → Application → Clear storage → Clear site data

## Step 4: Verify Key Matches Firebase

1. Go to Firebase Console → Authentication → Settings → reCAPTCHA
2. Click the three dots (⋮) next to "ChatLogix"
3. Verify the Site Key matches what's in your `.env.local` file
4. Make sure you copied the **Site Key** (not Secret Key)

## Step 5: Check Domain Configuration

In Firebase Console, make sure:
- The reCAPTCHA key is configured for web platform (`</>` icon)
- The domain `localhost` is authorized (for development)
- The key name matches "ChatLogix"

## Common Issues:

### Issue: Still shows old key after restart
**Solution:** 
- Make sure you saved `.env.local` before restarting
- Check the file path: `frontend_v2/apps/web-vendor/.env.local` (not `.env`)
- Verify no typos in variable name: `VITE_RECAPTCHA_SITE_KEY`

### Issue: Key format wrong
**Solution:**
- No quotes: `VITE_RECAPTCHA_SITE_KEY=6LeeMAgsAAAAAIk-QaaPIbK04i8KjHgbV1TGUIWf` ✅
- Not: `VITE_RECAPTCHA_SITE_KEY="6LeeMAgsAAAAAIk-QaaPIbK04i8KjHgbV1TGUIWf"` ❌
- No spaces: `VITE_RECAPTCHA_SITE_KEY = 6Lee...` ❌

### Issue: Wrong key type
**Solution:**
- Make sure it's the **Site Key** (public, starts with `6L...`)
- NOT the Secret Key (private, also starts with `6L...` but different)
- Site Key is safe to use in frontend code
- Secret Key should only be in backend

## Still Not Working?

1. Double-check the key in Firebase Console matches `.env.local`
2. Verify the key is for the **web** platform (not iOS/Android)
3. Make sure `localhost` is in authorized domains in Firebase
4. Try creating a new reCAPTCHA key in Firebase and updating both places

## Quick Test:

After restarting, open browser console and run:
```javascript
console.log('RECAPTCHA_KEY:', import.meta.env.VITE_RECAPTCHA_SITE_KEY);
```

This should show your new key. If it shows the old test key, the server didn't restart properly.

