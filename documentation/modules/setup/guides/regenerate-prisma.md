# Regenerate Prisma Client

The Prisma client needs to be regenerated after schema changes to sync with the database schema.

## Steps to Regenerate Prisma Client

1. **Stop the backend server** (if running)
   - This is required because the Prisma client files are locked while the server is running

2. **Navigate to the backend directory**
   ```powershell
   cd backend
   ```

3. **Regenerate the Prisma client**
   ```powershell
   npx prisma generate
   ```

   Or use the npm script:
   ```powershell
   npm run prisma:generate
   ```

4. **Restart the backend server**
   ```powershell
   npm run dev
   ```

## Why This Is Needed

When you add new fields to the Prisma schema (like `aiPaused`), the Prisma client TypeScript types need to be regenerated to include those fields. The client is generated from the schema file and creates type-safe database access.

## Current Issue

The `aiPaused` field exists in the schema but the Prisma client hasn't been regenerated yet. The API has been temporarily fixed to use a raw query as a workaround, but you should regenerate the client for proper type safety.

## Alternative: Use Prisma Migrate

If you also need to ensure the database has the column, you can use:

```powershell
npx prisma migrate dev
```

This will:
1. Create a migration if the database is out of sync
2. Apply the migration
3. Regenerate the Prisma client automatically

