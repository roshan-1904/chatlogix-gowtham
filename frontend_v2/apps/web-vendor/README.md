# Vendor Web App

Vendor web application for ChatLogix platform.

## Tech Stack

- React 18
- Vite
- TypeScript
- TailwindCSS
- React Router
- TanStack Query
- Zustand
- React Hook Form + Zod

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

- `VITE_API_URL` - Backend API URL
- `VITE_ENVIRONMENT` - Environment (development/staging/production)
- `VITE_RECAPTCHA_SITE_KEY` - reCAPTCHA site key

