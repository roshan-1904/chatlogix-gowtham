# Quick Setup - Step by Step

## ⚠️ Important: Create Tables FIRST, Then Import Data!

---

## Step 1: Push Prisma Schema (Creates All Tables)

This command reads your `schema.prisma` file and creates all the database tables.

### On your Bitnami server:

```bash
cd ~/ChatLogix/backend
npx prisma db push --accept-data-loss
```

**What this does:**
- ✅ Creates all tables (Vendor, Customer, Conversation, Message, etc.)
- ✅ Creates all enums (MessageType, OrderStatus, etc.)
- ✅ Sets up relationships and foreign keys
- ✅ Creates indexes

**Expected output:**
```
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "chatlogix"

✔ Generated Prisma Client

The database is now in sync with your schema.
✔ Generated Prisma Client
```

---

## Step 2: Generate Prisma Client

```bash
npx prisma generate
```

---

## Step 3: Import Backup Data (NOW Tables Exist!)

After tables are created, import your data. **Note:** `scripts/import-backup-data.sh` no longer exists in this repo — use the current npm script instead:

```bash
cd ~/ChatLogix/backend

# Run the import (make sure DATABASE_URL is in your .env, and that
# backend/database_backup/ has the *_rows.sql files — copy them from
# scripts/database/backups/ at the repo root if it's empty)
npm run db:import
```

**This will import files in the correct order:**
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

---

## All Commands Together

```bash
# Navigate to backend
cd ~/ChatLogix/backend

# 1. Create tables
npx prisma db push --accept-data-loss

# 2. Generate client
npx prisma generate

# 3. Import data
npm run db:import
```

---

## If You Get Permission Errors

Before Step 1, fix permissions:

```bash
sudo -u postgres psql -d chatlogix -c "GRANT ALL ON SCHEMA public TO PUBLIC; GRANT CREATE ON SCHEMA public TO PUBLIC;"
```

---

## Verify It Worked

Check that tables exist:
```bash
psql $DATABASE_URL -c "\dt"
```

Check data was imported:
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Vendor\";"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Message\";"
```

