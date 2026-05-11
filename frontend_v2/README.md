# ChatLogix Frontend v2 - Mono-repo

This is the mono-repo structure for ChatLogix frontend applications and shared packages.

Brand Colors:
Primary: #091544
Secondary: #04762e


## Structure

```
frontend_v2/
├── apps/
│   ├── web-vendor/          # Vendor web app (React + Vite)
│   ├── web-admin/            # Admin web app (React + Vite)
│   └── vendor-mobile/        # Vendor mobile app (React Native + Expo)
├── packages/
│   ├── ui/                   # Shared UI components
│   ├── design-tokens/        # Design system tokens
│   ├── api-client/           # API wrapper
│   ├── hooks/                # Shared React hooks
│   ├── schemas/              # Zod validation schemas
│   ├── utils/                # Utility functions
│   ├── config/               # Shared configuration
│   └── auth/                 # Authentication logic
├── turbo.json                # Turborepo configuration
├── package.json              # Root package.json
└── tsconfig.json             # Root TypeScript config
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

```bash
# Install all dependencies
npm install
```

### Development

```bash
# Run all apps in development mode
npm run dev

# Run specific app
npm run dev --filter=web-vendor
npm run dev --filter=web-admin
npm run dev --filter=vendor-mobile
```

### Building

```bash
# Build all packages and apps
npm run build

# Build specific package/app
npm run build --filter=@chatlogix/ui
npm run build --filter=web-vendor
```

### Linting & Formatting

```bash
# Lint all packages
npm run lint

# Format code
npm run format

# Check formatting
npm run format:check
```

### Type Checking

```bash
# Type check all packages
npm run type-check
```

## Packages

### @chatlogix/ui
Shared UI components for web and mobile applications.

### @chatlogix/design-tokens
Design system tokens (colors, spacing, typography, breakpoints) for Tailwind and NativeWind.

### @chatlogix/api-client
API client with automatic token injection and error handling.

### @chatlogix/hooks
Shared React hooks (useAuth, useToast, useApiClient, useDebounce).

### @chatlogix/schemas
Zod validation schemas for auth, products, orders, templates.

### @chatlogix/utils
Utility functions (date formatting, currency, phone formatting, validation).

### @chatlogix/config
Shared configuration (env validation, API endpoints, feature flags).

### @chatlogix/auth
Authentication package with phone/OTP flow, auth context, and token management.

## Tech Stack

- **Build System:** Turborepo
- **Web Framework:** React 18 + Vite
- **Mobile Framework:** React Native + Expo
- **Styling:** TailwindCSS (web) + NativeWind (mobile)
- **State Management:** Zustand + TanStack Query
- **Forms:** React Hook Form + Zod
- **Routing:** React Router (web) + React Navigation (mobile)

## Development Workflow

1. Make changes to shared packages or apps
2. Packages are automatically linked via npm workspaces
3. Use `turbo` commands to run tasks across the mono-repo
4. Changes to packages are automatically reflected in apps (with watch mode)

## Current Status

✅ **Phase 1: Infrastructure Setup (Week 1-2) - COMPLETED**

### Week 1: Mono-repo Foundation ✅
- ✅ Turborepo initialized and configured
- ✅ Root package.json with workspace configuration
- ✅ TypeScript root config with path aliases
- ✅ ESLint, Prettier configured
- ✅ All shared packages created and structured

### Week 2: Application Scaffolding ✅
- ✅ Vendor Web App (`apps/web-vendor`) - Vite + React + TypeScript
- ✅ Admin Web App (`apps/web-admin`) - Vite + React + TypeScript
- ✅ Vendor Mobile App (`apps/vendor-mobile`) - Expo + React Native + TypeScript

## Next Steps

See the [implementation plan](.cursor/plans/frontend-mobile-mono-repo-setup-68e70d51.plan.md) for detailed development phases.

**Next Phase:** Phase 2 - Authentication & Core Infrastructure (Weeks 3-4)

