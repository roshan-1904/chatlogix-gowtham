# Environment Variables Setup

Create a `.env` file in `apps/vendor-mobile/` with the following variables:

```env
# Backend API URL
EXPO_PUBLIC_API_URL=http://localhost:8000/api

# Environment (development/staging/production)
EXPO_PUBLIC_ENVIRONMENT=development
```

## Notes

- `.env` is gitignored and won't be committed
- Expo requires the `EXPO_PUBLIC_` prefix for environment variables to be exposed to the client
- Restart the Expo dev server after changing environment variables
- For production builds, set these in EAS Secrets or app.config.js

