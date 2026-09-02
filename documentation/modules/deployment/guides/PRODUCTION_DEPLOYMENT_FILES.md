# Production Deployment Files Checklist

This document lists all files and folders that need to be moved to the production server for ChatLogix deployment.

## Prerequisites

Before deploying, ensure you have built all components:

```bash
# Build backend
cd backend
npm run build

# Build frontend applications
cd frontend_v2
npm run build
```

---

## Files and Folders to Deploy

### 1. Backend Files

#### Required Files:
```
backend/
├── dist/                          # ✅ REQUIRED - Compiled TypeScript output
│   ├── index.js                   # Main entry point
│   ├── config/                    # Configuration files
│   ├── db/                        # Database utilities
│   ├── middleware/                # Express middleware
│   ├── routes/                    # API route handlers
│   ├── services/                  # Business logic services
│   ├── workers/                   # Background workers
│   ├── utils/                     # Utility functions
│   └── types/                     # TypeScript type definitions
├── package.json                   # ✅ REQUIRED - For npm install
├── package-lock.json              # ✅ REQUIRED - Lock file for consistent installs
└── prisma/                        # ✅ REQUIRED - Database schema and migrations
    ├── schema.prisma              # Prisma schema
    └── migrations/                # Database migration files
        └── [all migration files]  # All .sql and migration.toml files
```

#### Optional but Recommended:
```
backend/
└── .env.example                   # Template for environment variables (reference only)
```

#### Files NOT to Deploy:
- `backend/src/` - Source TypeScript files (not needed, only dist/)
- `backend/node_modules/` - Will be installed on server
- `backend/logs/` - Logs directory (created on server)
- `backend/test/` - Test files
- `backend/scripts/` - Development scripts
- `backend/tsconfig.json` - TypeScript config (not needed for runtime)
- `backend/.env` - Environment file (create on server, never commit)

---

### 2. Frontend Files (frontend_v2)

#### Required Files:
```
frontend_v2/
└── apps/
    ├── web-vendor/
    │   └── dist/                  # ✅ REQUIRED - Built vendor web app (the active, primary app)
    │       ├── index.html
    │       ├── assets/            # JS, CSS, images, fonts
    │       └── [all static files]
    └── web-admin/
        └── dist/                  # ⚠️ OPTIONAL - web-admin is still scaffolding (per CLAUDE.md), not
            ├── index.html         #    deployed by the current CI pipeline (.github/workflows/deploy.yml
            ├── assets/            #    only packages web-vendor/dist). Include it only if you're
            └── [all static files] #    intentionally serving it.
```

#### Files NOT to Deploy:
- `frontend_v2/node_modules/` - Not needed for production
- `frontend_v2/apps/*/src/` - Source files (not needed)
- `frontend_v2/packages/` - Package source code (not needed if apps are built)
- `frontend_v2/.turbo/` - Build cache
- `frontend_v2/package.json` - Not needed for static files
- `frontend_v2/tsconfig.json` - TypeScript config (not needed)

---

### 3. Configuration Files

#### Required Files:
```
ecosystem.config.js                # ✅ REQUIRED - PM2 configuration
                                   # NOTE: Update paths in this file for production server
```

#### Files to Create on Server (NOT moved):
```
backend/.env                       # ❌ DO NOT MOVE - Create on server with production values
```

---

### 4. Legacy Frontend (if still using)

If you're still using the old `frontend/` directory:

```
frontend/
└── dist/                          # ✅ REQUIRED - Built frontend (if using)
    ├── index.html
    └── assets/
```

---

## Deployment Package Structure

When packaging for deployment, your archive should have this structure:

```
chatlogix-production/
├── backend/
│   ├── dist/
│   ├── package.json
│   ├── package-lock.json
│   └── prisma/
├── frontend_v2/
│   └── apps/
│       ├── web-vendor/
│       │   └── dist/
│       └── web-admin/
│           └── dist/
└── ecosystem.config.js
```

---

## Step-by-Step Deployment Package Creation

### On Windows (PowerShell):

```powershell
# Create deployment directory
$deployDir = "C:\temp\chatlogix-deploy"
New-Item -ItemType Directory -Force -Path $deployDir
cd $deployDir

# Copy backend
New-Item -ItemType Directory -Force -Path "backend"
Copy-Item -Recurse "C:\Projects\ChatLogix\backend\dist" "backend\dist"
Copy-Item "C:\Projects\ChatLogix\backend\package.json" "backend\"
Copy-Item "C:\Projects\ChatLogix\backend\package-lock.json" "backend\"
Copy-Item -Recurse "C:\Projects\ChatLogix\backend\prisma" "backend\prisma"

# Copy frontend builds
New-Item -ItemType Directory -Force -Path "frontend_v2\apps\web-vendor"
Copy-Item -Recurse "C:\Projects\ChatLogix\frontend_v2\apps\web-vendor\dist" "frontend_v2\apps\web-vendor\dist"

New-Item -ItemType Directory -Force -Path "frontend_v2\apps\web-admin"
Copy-Item -Recurse "C:\Projects\ChatLogix\frontend_v2\apps\web-admin\dist" "frontend_v2\apps\web-admin\dist"

# Copy PM2 config
Copy-Item "C:\Projects\ChatLogix\ecosystem.config.js" "."

# Create zip archive
Compress-Archive -Path * -DestinationPath "chatlogix-production.zip" -Force
Write-Host "Deployment package created: chatlogix-production.zip"
```

### On Linux/Mac:

```bash
# Create deployment directory
DEPLOY_DIR="/tmp/chatlogix-deploy"
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

# Copy backend
mkdir -p backend
cp -r /path/to/ChatLogix/backend/dist ./backend/
cp /path/to/ChatLogix/backend/package.json ./backend/
cp /path/to/ChatLogix/backend/package-lock.json ./backend/
cp -r /path/to/ChatLogix/backend/prisma ./backend/

# Copy frontend builds
mkdir -p frontend_v2/apps/web-vendor
cp -r /path/to/ChatLogix/frontend_v2/apps/web-vendor/dist ./frontend_v2/apps/web-vendor/

mkdir -p frontend_v2/apps/web-admin
cp -r /path/to/ChatLogix/frontend_v2/apps/web-admin/dist ./frontend_v2/apps/web-admin/

# Copy PM2 config
cp /path/to/ChatLogix/ecosystem.config.js ./

# Create tar archive
tar -czf chatlogix-production.tar.gz *
echo "Deployment package created: chatlogix-production.tar.gz"
```

---

## File Size Estimates

Approximate sizes (may vary):

- `backend/dist/` - ~5-15 MB (compiled JavaScript)
- `backend/prisma/` - ~1-5 MB (migrations)
- `frontend_v2/apps/web-vendor/dist/` - ~2-10 MB (static assets)
- `frontend_v2/apps/web-admin/dist/` - ~2-10 MB (static assets)
- **Total package size**: ~10-40 MB (compressed: ~5-20 MB)

---

## Important Notes

### 1. Environment Variables
- **NEVER** copy `.env` files to production
- Create `.env` file directly on the server with production values
- Use `.env.example` as a reference template only

### 2. Prisma Migrations
- **MUST** include all migration files in `prisma/migrations/`
- These are required for `prisma migrate deploy` command
- Missing migrations can cause database schema issues

### 3. PM2 Configuration
- The root `ecosystem.config.js` already targets the live production box (`cwd: '/home/bitnami/chatlogix'`, Bitnami on EC2) and defines exactly 2 apps today: `chatlogix-backend` and `chatlogix-media-worker`. There is no separate response/incoming/multi-stage worker anymore — the WhatsApp AI pipeline and response dispatch run as AWS Lambda functions in production (see `backend/src/lambdas/README.md`).
- If you're deploying to a **different** host than the Bitnami box, update `cwd` (and any other paths) in `ecosystem.config.js` to match your server layout before deployment.

### 4. Node Modules
- **DO NOT** copy `node_modules/` folders
- Install dependencies on the server using `npm ci --only=production` (backend)
- Frontend dist folders don't need node_modules (they're static files)

### 5. Build Verification
Before packaging, verify builds exist:
```bash
# Check backend build
ls backend/dist/index.js

# Check frontend builds
ls frontend_v2/apps/web-vendor/dist/index.html
ls frontend_v2/apps/web-admin/dist/index.html
```

---

## Quick Checklist

Before creating deployment package:

- [ ] Backend built (`npm run build` in backend/)
- [ ] Frontend apps built (`npm run build` in frontend_v2/)
- [ ] `backend/dist/` folder exists and contains compiled files
- [ ] `frontend_v2/apps/web-vendor/dist/` exists
- [ ] `frontend_v2/apps/web-admin/dist/` exists
- [ ] `backend/prisma/migrations/` contains all migration files
- [ ] `ecosystem.config.js` paths updated for production server
- [ ] No `.env` files included in package
- [ ] No `node_modules/` folders included
- [ ] No source files (`src/`) included (only `dist/`)

---

## After Deployment on Server

Once files are on the server, you'll need to:

1. **Install backend dependencies:**
   ```bash
   cd /path/to/chatlogix/backend
   npm ci --only=production
   ```

2. **Generate Prisma client:**
   ```bash
   cd /path/to/chatlogix/backend
   npx prisma generate
   ```

3. **Run database migrations:**
   ```bash
   cd /path/to/chatlogix/backend
   npx prisma migrate deploy
   ```

4. **Create `.env` file** with production values

5. **Start PM2 processes:**
   ```bash
   cd /path/to/chatlogix
   pm2 start ecosystem.config.js --env production
   ```

6. **Configure Nginx** to serve frontend files and proxy API requests

See `MANUAL_DEPLOYMENT_STEPS.md` for complete server setup instructions.

---

## Summary

**Essential Files:**
- ✅ `backend/dist/` - Compiled backend code
- ✅ `backend/package.json` & `package-lock.json` - Dependency management
- ✅ `backend/prisma/` - Database schema and migrations
- ✅ `frontend_v2/apps/web-vendor/dist/` - Vendor web app build
- ✅ `frontend_v2/apps/web-admin/dist/` - Admin web app build
- ✅ `ecosystem.config.js` - PM2 configuration

**Files to Exclude:**
- ❌ Source files (`src/`, `*.ts` files)
- ❌ `node_modules/` folders
- ❌ `.env` files
- ❌ Test files (`test/`, `*.test.ts`)
- ❌ Development scripts (`scripts/`)
- ❌ Log files (`logs/`)
- ❌ Build caches (`.turbo/`, `.vite/`, etc.)

