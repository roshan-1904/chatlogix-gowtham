# Environment Variables Setup

Create a `.env.local` file in `apps/web-admin/` with the following variables:

```env
# Backend API URL
VITE_API_URL=http://localhost:8000/api

# Admin-specific API URL (if different from main API)
VITE_ADMIN_API_URL=http://localhost:8000/api

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

## Notes

- `.env.local` is gitignored and won't be committed
- Restart the dev server after changing environment variables
- Vite requires the `VITE_` prefix for environment variables to be exposed to the client

