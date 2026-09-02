# Setup Guide

## Initial Setup

1. **Install Dependencies**

```bash
cd frontend_v2
npm install
```

2. **Build Shared Packages**

```bash
# Build all packages
npm run build

# Or build specific package
npm run build --filter=@chatlogix/ui
```

3. **Run Applications**

### Vendor Web App
```bash
cd apps/web-vendor
npm run dev
# Runs on http://localhost:3000
```

### Admin Web App
```bash
cd apps/web-admin
npm run dev
# Runs on http://localhost:3001
```

### Vendor Mobile App
```bash
cd apps/vendor-mobile
npm start
# Opens Expo DevTools
```

## Development Workflow

### Using Turborepo Commands

From the root (`frontend_v2/`):

```bash
# Run dev for all apps
npm run dev

# Run dev for specific app
npm run dev --filter=web-vendor
npm run dev --filter=web-admin
npm run dev --filter=vendor-mobile

# Build all packages and apps
npm run build

# Build specific package/app
npm run build --filter=@chatlogix/ui
npm run build --filter=web-vendor

# Lint all
npm run lint

# Type check all
npm run type-check
```

## Environment Variables

### Vendor Web App
Create `apps/web-vendor/.env.local`:
```
VITE_API_URL=http://localhost:8000/api
VITE_ENVIRONMENT=development
VITE_RECAPTCHA_SITE_KEY=your-key
```

### Admin Web App
Create `apps/web-admin/.env.local`:
```
VITE_API_URL=http://localhost:8000/api
VITE_ADMIN_API_URL=http://localhost:8000/api
VITE_ENVIRONMENT=development
```

### Mobile App
Create `apps/vendor-mobile/.env`:
```
EXPO_PUBLIC_API_URL=http://localhost:8000/api
EXPO_PUBLIC_ENVIRONMENT=development
```

(`http://localhost:8000` is the backend API port used by each app's `env.template`/`ENV_SETUP.md`. Don't confuse it with the frontend dev-server ports below — 3000 for web-vendor, 3001 for web-admin.)

## Troubleshooting

### Package Not Found Errors

If you see errors about packages not being found:

1. Make sure you've installed dependencies at the root:
```bash
npm install
```

2. Build the shared packages:
```bash
npm run build
```

3. If using workspace packages, ensure they're properly linked:
```bash
npm run build --filter=...shared-packages
```

### TypeScript Path Alias Issues

If TypeScript can't resolve path aliases:

1. Check `tsconfig.json` has correct paths
2. Restart TypeScript server in your IDE
3. Ensure packages are built before importing

### Mobile App Issues

If Expo has issues:

1. Clear cache:
```bash
cd apps/vendor-mobile
npx expo start -c
```

2. Reinstall dependencies:
```bash
rm -rf node_modules
npm install
```

## Project Structure

```
frontend_v2/
├── apps/
│   ├── web-vendor/          # Vendor web app
│   ├── web-admin/            # Admin web app
│   └── vendor-mobile/        # Vendor mobile app
├── packages/
│   ├── ui/                   # Shared UI components
│   ├── design-tokens/        # Design system
│   ├── api-client/           # API wrapper
│   ├── hooks/                # React hooks
│   ├── schemas/              # Zod schemas
│   ├── utils/                # Utilities
│   ├── config/               # Configuration
│   └── auth/                 # Authentication
├── package.json              # Root package.json
├── turbo.json                # Turborepo config
└── tsconfig.json             # Root TypeScript config
```

