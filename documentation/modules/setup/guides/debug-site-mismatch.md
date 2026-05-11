# Debugging SITE_MISMATCH Error

## Your Key Looks Valid ✅
Your key `6LeeMAgsAAAAAIk-QaaPIbK04i8KjHgbV1TGUIWf` is correctly formatted.

## Common Causes of SITE_MISMATCH:

### 1. 🔴 Domain Not Authorized in Firebase
**Most Common Issue!**

Firebase reCAPTCHA keys need to have `localhost` authorized.

**Check in Firebase Console:**
1. Go to **Authentication → Settings → reCAPTCHA**
2. Click the three dots (⋮) next to "ChatLogix" (web platform)
3. Check **"Authorized domains"**
4. Make sure `localhost` is listed
5. If not, add it:
   - Click "Edit" or "Configure"
   - Add `localhost` to authorized domains
   - Save

### 2. 🔴 Wrong Platform Key
**Make sure you're using the WEB key, not iOS/Android!**

In Firebase Console:
- ✅ Use the key with `</>` icon (Web platform)
- ❌ NOT the iOS or Android keys

### 3. 🔴 Key Mismatch
**The key in Firebase must EXACTLY match .env.local**

**Verify:**
1. Firebase Console → Authentication → Settings → reCAPTCHA
2. Click three dots (⋮) next to "ChatLogix"
3. Copy the Site Key
4. Compare with `frontend_v2/apps/web-vendor/.env.local`
5. They must be **identical** (no spaces, no quotes)

### 4. 🔴 Server Not Restarted
**Vite only loads env vars at startup!**

```bash
# Stop server (Ctrl+C)
# Then restart:
cd frontend_v2
npm run dev
```

### 5. 🔴 Browser Cache
**Clear browser cache:**
- Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- Or: DevTools → Application → Clear storage → Clear site data

## Step-by-Step Debugging:

### Step 1: Verify Key is Loaded
Open browser console (F12) and run:
```javascript
console.log('Key:', import.meta.env.VITE_RECAPTCHA_SITE_KEY);
```
Should show: `"6LeeMAgsAAAAAIk-QaaPIbK04i8KjHgbV1TGUIWf"`

### Step 2: Check Firebase Configuration
1. Firebase Console → Authentication → Settings → reCAPTCHA
2. Find "ChatLogix" entry with `</>` icon
3. Click three dots (⋮) → View details
4. Verify:
   - Site Key matches `.env.local` exactly
   - `localhost` is in authorized domains
   - Platform is "Web" (`</>`)

### Step 3: Test reCAPTCHA Directly
Add this to browser console to test:
```javascript
// This will show if reCAPTCHA is working
window.grecaptcha.execute('6LeeMAgsAAAAAIk-QaaPIbK04i8KjHgbV1TGUIWf', {action: 'submit'})
  .then(token => console.log('Token:', token))
  .catch(err => console.error('Error:', err));
```

## Quick Fix Checklist:

- [ ] Key in `.env.local` matches Firebase exactly
- [ ] `localhost` is in authorized domains in Firebase
- [ ] Using the **Web** platform key (not iOS/Android)
- [ ] Frontend dev server was restarted after updating `.env.local`
- [ ] Browser cache cleared (hard refresh)
- [ ] No extra spaces/quotes in `.env.local` key

## Still Not Working?

### Option 1: Create New Key in Firebase
1. Firebase Console → Authentication → Settings → reCAPTCHA
2. Click "Configure site keys"
3. Click "Add key" or edit existing
4. Make sure:
   - Platform: **Web**
   - Name: "ChatLogix"
   - Authorized domains: Include `localhost`
5. Copy the NEW Site Key
6. Update `.env.local` with new key
7. Restart dev server

### Option 2: Check Network Tab
1. Open DevTools → Network tab
2. Try to login
3. Look for requests to `recaptcha` or `firebase`
4. Check if there are any CORS or domain errors

### Option 3: Verify Firebase Project
Make sure you're using the correct Firebase project:
- Check `FIREBASE_PROJECT_ID` in backend `.env`
- Verify it matches the project in Firebase Console
- The reCAPTCHA key must be from the SAME project

## Most Likely Solution:

**90% of SITE_MISMATCH errors are caused by:**
1. `localhost` not being in authorized domains in Firebase
2. Using the wrong platform key (iOS/Android instead of Web)

**Fix:**
1. Go to Firebase Console
2. Authentication → Settings → reCAPTCHA
3. Edit the "ChatLogix" web key
4. Add `localhost` to authorized domains
5. Save
6. Try again

