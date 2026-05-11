# Production Deployment Quick Reference

## 🚀 Quick Start

### 1. Build Everything

```bash
# Build backend
cd backend
npm run build

# Build frontend
cd frontend_v2
npm run build
```

### 2. Create Deployment Package

**Windows (PowerShell):**
```powershell
.\scripts\deployment\create-deployment-package.ps1
```

**Linux/Mac:**
```bash
bash scripts/deployment/create-deployment-package.sh
```

**Manual (if scripts don't work):**
See `PRODUCTION_DEPLOYMENT_FILES.md` for detailed instructions.

### 3. Transfer to Server

```bash
# Windows
scp C:\temp\chatlogix-deploy\chatlogix-production.zip user@server:/home/user/

# Linux/Mac
scp /tmp/chatlogix-deploy/chatlogix-production.tar.gz user@server:/home/user/
```

### 4. Deploy on Server

Follow instructions in `MANUAL_DEPLOYMENT_STEPS.md`

---

## 📦 Files to Deploy

### ✅ Required Files:

```
backend/
├── dist/                    # Compiled backend code
├── package.json
├── package-lock.json
└── prisma/                  # Schema + migrations

frontend_v2/apps/
├── web-vendor/dist/         # Vendor web app build
└── web-admin/dist/          # Admin web app build

ecosystem.config.js          # PM2 configuration
```

### ❌ Do NOT Deploy:

- `src/` folders (source code)
- `node_modules/` folders
- `.env` files (create on server)
- `logs/` folders
- `test/` folders
- Build caches (`.turbo/`, `.vite/`)

---

## 📋 Checklist

Before creating package:
- [ ] Backend built (`cd backend && npm run build`)
- [ ] Frontend built (`cd frontend_v2 && npm run build`)
- [ ] All builds verified

Package contents:
- [ ] `backend/dist/` exists
- [ ] `backend/prisma/` exists
- [ ] `frontend_v2/apps/web-vendor/dist/` exists
- [ ] `frontend_v2/apps/web-admin/dist/` exists
- [ ] `ecosystem.config.js` included
- [ ] No `.env` files included
- [ ] No `node_modules/` included

---

## 📚 Full Documentation

- **File List**: `PRODUCTION_DEPLOYMENT_FILES.md` - Complete list of files to deploy
- **Deployment Steps**: `MANUAL_DEPLOYMENT_STEPS.md` - Step-by-step server setup
- **Package Scripts**: `scripts/deployment/` - Automated packaging scripts

---

## ⚠️ Important Notes

1. **Environment Variables**: Never copy `.env` files. Create them on the server.
2. **Prisma Migrations**: Must include all migration files in `prisma/migrations/`
3. **PM2 Config**: Update paths in `ecosystem.config.js` for your server
4. **Node Modules**: Install on server with `npm ci --only=production`

---

## 🔧 Server Setup Commands

```bash
# Install dependencies
cd backend
npm ci --only=production

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Start with PM2
cd ..
pm2 start ecosystem.config.js --env production
pm2 save
```

---

## 📞 Need Help?

- Check `MANUAL_DEPLOYMENT_STEPS.md` for detailed instructions
- Review `PRODUCTION_DEPLOYMENT_FILES.md` for file requirements
- Check server logs: `pm2 logs` or `sudo tail -f /var/log/nginx/error.log`

