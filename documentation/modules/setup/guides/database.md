# Database Setup Guide

This guide will help you set up your PostgreSQL database with the Prisma schema and import backup data.

## Prerequisites

1. PostgreSQL installed and running
2. Database created (if not, create it: `CREATE DATABASE chatlogix;`)
3. `.env` file configured with `DATABASE_URL`

## Step 1: Fix Database Permissions

The error "permission denied for schema public" means your database user doesn't have the necessary permissions.

### Option A: Fix as PostgreSQL Superuser (Recommended)

1. Connect as the postgres superuser:
   ```powershell
   psql -U postgres -d chatlogix
   ```

2. Run these commands:
   ```sql
   GRANT ALL ON SCHEMA public TO PUBLIC;
   GRANT CREATE ON SCHEMA public TO PUBLIC;
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO PUBLIC;
   GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO PUBLIC;
   ```

   Or use the script:
   ```powershell
   psql -U postgres -d chatlogix -f scripts\grant-permissions-quick.sql
   ```

### Option B: If using a specific user

Replace `PUBLIC` with your database username in the commands above, or modify the SQL script.

## Step 2: Push Prisma Schema

```powershell
cd backend
npx prisma db push --accept-data-loss
```

This will create all tables, enums, and relationships according to your Prisma schema.

## Step 3: Generate Prisma Client

```powershell
npx prisma generate
```

## Step 4: Import Backup Data

Run the import script:

```powershell
.\scripts\import-backup-data.ps1
```

Or manually import in this order:

1. Admin_rows.sql
2. Vendor_rows.sql
3. Customer_rows.sql
4. Conversation_rows.sql
5. Message_rows.sql
6. CreditUsage_rows.sql
7. WalletTransaction_rows.sql
8. WhatsAppNumber_rows.sql
9. Order_rows.sql
10. CustomerInsights_rows.sql
11. _prisma_migrations_rows.sql

### Manual Import Example:

```powershell
$env:PGPASSWORD = "your_password"
psql -h localhost -U your_user -d chatlogix -f database_backup\Admin_rows.sql
psql -h localhost -U your_user -d chatlogix -f database_backup\Vendor_rows.sql
# ... continue for all files
```

## Troubleshooting

### Permission Denied Error

- Make sure you've run the permission fix from Step 1
- Verify your user has the correct permissions
- Check if PostgreSQL version is 15+ (which has stricter default permissions)

### Connection Issues

- Verify `DATABASE_URL` in your `.env` file
- Format: `postgresql://user:password@host:port/database`
- Test connection: `psql -h host -U user -d database`

### Foreign Key Violations

- Make sure you import files in the correct order (as listed above)
- Check that parent records exist before importing child records

## Quick Setup (All-in-One)

If you have all permissions set up, you can run:

```powershell
cd backend
npx prisma db push --accept-data-loss
npx prisma generate
.\scripts\import-backup-data.ps1
```

