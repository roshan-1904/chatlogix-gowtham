# Admin Web App

Admin web application for ChatLogix platform.

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
# Run development server (port 3001)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

- `VITE_API_URL` - Backend API URL
- `VITE_ADMIN_API_URL` - Admin-specific API (if different)
- `VITE_ENVIRONMENT` - Environment (development/staging/production)

