# Environment Variables Setup

Create a `.env.local` file in `apps/web-vendor/` with the following variables:

```env
# Backend API URL
VITE_API_URL=http://localhost:8000/api

# reCAPTCHA Site Key
# IMPORTANT: This must match the site key configured in Firebase Console
# Get it from: Firebase Console → Authentication → Settings → reCAPTCHA
# DO NOT use Google's test keys - they won't work with Firebase
# See ../RECAPTCHA_SETUP.md for detailed instructions
VITE_RECAPTCHA_SITE_KEY=your-firebase-recaptcha-site-key

# Environment (development/staging/production)
VITE_ENVIRONMENT=development
```

## Getting a reCAPTCHA Site Key

1. Go to https://www.google.com/recaptcha/admin
2. Click "Create" to create a new site
3. Choose reCAPTCHA v2 → "I'm not a robot" Checkbox
4. Add your domain (for local development, use `localhost`)
5. Copy the Site Key and paste it in `.env.local`

## For Development/Testing

Google provides test keys that always pass:
- **Site Key:** `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI`
- **Secret Key:** `6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuJJJ4WifJWe`

These keys work for testing but should NOT be used in production.

## Environment Variable Loading

The application automatically loads environment variables from `.env` files in the following order:

1. **`.env`** - Base environment variables (committed to git)
2. **`.env.local`** - Local overrides (gitignored, use for development)
3. **`.env.production`** - Production-specific variables (for builds)
4. **`.env.production.local`** - Production local overrides (gitignored)

### Development Mode

When running `npm run dev`, the app will:
- ✅ Load variables from `.env.local` (if exists)
- ⚠️ Show console warnings if `VITE_RECAPTCHA_SITE_KEY` is missing or a placeholder
- ✅ Display helpful error messages if reCAPTCHA fails due to missing config

### Production Build

When running `npm run build`:
- ✅ Loads variables from `.env.production` (if exists)
- ❌ **Will fail** if `VITE_RECAPTCHA_SITE_KEY` is missing or contains placeholder values
- ✅ Ensures production builds always have valid configuration

### Validation

The `getRecaptchaSiteKey()` function in `src/lib/env.ts`:
- Validates the key is present and not a placeholder
- Provides helpful console messages in development
- Ensures production builds fail fast if misconfigured

## Notes

- `.env.local` is gitignored and won't be committed
- Restart the dev server after changing environment variables
- Vite requires the `VITE_` prefix for environment variables to be exposed to the client
- Environment variables are embedded at **build time**, not runtime
- For production, ensure `.env.production` exists or set env vars before building

