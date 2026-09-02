# MySQL Migration Checklist

> **⚠️ ARCHIVED / HISTORICAL.** This documents a one-time migration to MySQL that has since been reverted. The project runs PostgreSQL today: `backend/prisma/schema.prisma` has `provider = "postgresql"`, and `backend/.env.example`'s `DATABASE_URL` points at Supabase Postgres (confusingly, this doc's own closing line below says the same thing). Do not follow the steps here for a current setup — see `documentation/modules/setup/guides/database.md` instead. Also note: the worker commands below (`npm run worker:incoming`, `npm run worker:response`) reference npm scripts that no longer exist — current worker scripts are `npm run worker:conversation` and `npm run worker:media` (see root `CLAUDE.md`).

## ✅ Completed

### Database Schema
- [x] Updated Prisma schema from PostgreSQL to MySQL
- [x] Changed provider from `postgresql` to `mysql`
- [x] Updated all `@default(cuid())` to `@default(uuid())`
- [x] Added `@db.Text` annotations for large text fields
- [x] Added `@@map()` annotations for all models
- [x] Added `onDelete: Cascade` to all relations
- [x] Added missing columns (role, registrationStatus, etc.) to Vendor model
- [x] Added Admin model to schema
- [x] Generated Prisma client for MySQL
- [x] Created database schema in MySQL

### Data Migration
- [x] Created conversion script (convert-postgres-to-mysql.ts)
- [x] Converted all SQL files from PostgreSQL to MySQL format
- [x] Fixed reserved keyword issues (Order table)
- [x] Imported all data successfully

### Code Updates
- [x] Updated SQL queries in conversations.ts (removed PostgreSQL quotes)
- [x] Updated test-db-connection.ts for MySQL syntax
- [x] Updated prisma.ts connection logging (removed PostgreSQL-specific params)
- [x] Updated test files (tokenService.test.ts)

### Documentation
- [x] Updated TROUBLESHOOTING_DATABASE.md for MySQL
- [x] Updated README.md (removed PostgreSQL references)
- [x] Updated Dockerfile (removed postgresql-client)
- [x] Updated lambdas README.md

## ✅ Verification Steps

### 1. Environment Variables
Verify your `.env` file has MySQL connection:
```env
DATABASE_URL=mysql://apiuser:ChatLogix!@65.1.191.185:3306/chatlogix
```

### 2. Test Database Connection
```powershell
cd backend
npx tsx scripts/test-db-connection.ts
```

### 3. Verify Services Use MySQL
All services and workers automatically use MySQL because they:
- Import Prisma client from `src/db/prisma.ts`
- Prisma client reads from `DATABASE_URL` environment variable
- Prisma schema is set to MySQL provider

**Services that use the database:**
- ✅ API routes (vendors.ts, conversations.ts, orders.ts, webhook.ts)
- ✅ Workers (incomingMessageWorker.ts, responseWorker.ts, textWorker.ts)
- ✅ Services (messageProcessor.ts, aiService.ts, orderService.ts, etc.)
- ✅ Lambda functions (via lambdaConfigurationService.ts)

### 4. Start Services and Verify

**Start API:**
```powershell
cd backend
npm run dev
```

**Start Workers:**
```powershell
# Terminal 1
npm run worker:incoming

# Terminal 2
npm run worker:response
```

**Verify in logs:**
- Look for: `Prisma DB config summary` - should show MySQL host/port
- Look for: `Prisma connectivity probe succeeded` - confirms MySQL connection

### 5. Test API Endpoints
```powershell
# Test health endpoint
curl http://localhost:3000/health

# Test database connection through API
# (depends on your API endpoints)
```

## 🔍 Key Points

1. **All services use Prisma Client** - No code changes needed in services/workers
2. **DATABASE_URL is the single source of truth** - Make sure it's MySQL format
3. **Prisma handles the database abstraction** - Services don't need to know it's MySQL
4. **Workers inherit database config** - They use the same Prisma client

## ⚠️ Important Notes

- **No hardcoded database references** - Everything uses Prisma
- **Environment variables** - All database config comes from `.env`
- **Connection pooling** - Prisma handles this automatically
- **Transactions** - Prisma transactions work the same with MySQL

## 🚀 Next Steps

1. **Update production .env** - Ensure DATABASE_URL is MySQL format
2. **Restart all services** - After updating .env, restart API and workers
3. **Monitor logs** - Check for any MySQL-specific errors
4. **Test thoroughly** - Verify all features work with MySQL

## 📝 Files Updated

- `backend/prisma/schema.prisma` - MySQL provider
- `backend/src/routes/conversations.ts` - MySQL SQL syntax
- `backend/scripts/test-db-connection.ts` - MySQL queries
- `backend/src/db/prisma.ts` - MySQL connection logging
- `backend/test/auth/tokenService.test.ts` - MySQL URL
- `backend/TROUBLESHOOTING_DATABASE.md` - MySQL documentation
- `backend/README.md` - Updated references
- `backend/Dockerfile` - Removed PostgreSQL client
- `backend/src/lambdas/README.md` - MySQL examples

## ✅ Migration Complete!

Your entire application is now using PostgreSQL instead of Supabase. All services, workers, and API routes will automatically use the PostgreSQL database configured in your `DATABASE_URL` environment variable.

