# Complete Database Setup Guide

## ✅ Correct Order of Operations

**IMPORTANT:** You must create the tables first before importing data!

1. **Fix Permissions** (if needed)
2. **Push Prisma Schema** → Creates all tables, enums, and relationships
3. **Import Backup Data** → Inserts data into the created tables

---

## Step 1: Fix PostgreSQL Permissions (If Needed)

### On Bitnami Linux Server:

```bash
# Connect as postgres user
sudo -u postgres psql -d chatlogix

# Inside psql, run:
GRANT ALL ON SCHEMA public TO PUBLIC;
GRANT CREATE ON SCHEMA public TO PUBLIC;
\q
```

### On Windows (Local):

If you get permission errors, connect to your PostgreSQL as an admin and run the same GRANT commands.

---

## Step 2: Push Prisma Schema (CREATE TABLES)

This step creates all the database tables according to your Prisma schema.

### On Linux/Bitnami:

```bash
cd ~/ChatLogix/backend
npx prisma db push --accept-data-loss
```

### On Windows:

```powershell
cd backend
npx prisma db push --accept-data-loss
```

**What this does:**
- Creates all tables (Vendor, Customer, Conversation, Message, etc.)
- Creates all enums (MessageType, WalletTransactionType, OrderStatus)
- Sets up all relationships and foreign keys
- Creates indexes

**Expected output:**
```
✔ Generated Prisma Client
The database is now in sync with your schema.
```

---

## Step 3: Generate Prisma Client

After pushing the schema, generate the Prisma client:

```bash
npx prisma generate
```

---

## Step 4: Import Backup Data

Now that tables exist, import your backup data.

### On Linux/Bitnami:

```bash
cd ~/ChatLogix/backend

# Make script executable
chmod +x scripts/import-backup-data.sh

# Run import (ensure DATABASE_URL is set in .env)
./scripts/import-backup-data.sh
```

### On Windows:

```powershell
cd backend
.\scripts\import-backup-data.ps1
```

### Manual Import (if scripts don't work):

Import files in this exact order (respects foreign key constraints):

```bash
# Set password (adjust as needed)
export PGPASSWORD="your_password"

# Import in order
psql -h localhost -U your_user -d chatlogix -f database_backup/Admin_rows.sql
psql -h localhost -U your_user -d chatlogix -f database_backup/Vendor_rows.sql
psql -h localhost -U your_user -d chatlogix -f database_backup/Customer_rows.sql
psql -h localhost -U your_user -d chatlogix -f database_backup/Conversation_rows.sql
psql -h localhost -U your_user -d chatlogix -f database_backup/Message_rows.sql
psql -h localhost -U your_user -d chatlogix -f database_backup/CreditUsage_rows.sql
psql -h localhost -U your_user -d chatlogix -f database_backup/WalletTransaction_rows.sql
psql -h localhost -U your_user -d chatlogix -f database_backup/WhatsAppNumber_rows.sql
psql -h localhost -U your_user -d chatlogix -f database_backup/Order_rows.sql
psql -h localhost -U your_user -d chatlogix -f database_backup/CustomerInsights_rows.sql
psql -h localhost -U your_user -d chatlogix -f database_backup/_prisma_migrations_rows.sql

unset PGPASSWORD
```

---

## Quick All-in-One Commands

### Linux/Bitnami:

```bash
cd ~/ChatLogix/backend

# 1. Fix permissions (if needed)
sudo -u postgres psql -d chatlogix -c "GRANT ALL ON SCHEMA public TO PUBLIC; GRANT CREATE ON SCHEMA public TO PUBLIC;"

# 2. Push schema (creates tables)
npx prisma db push --accept-data-loss

# 3. Generate client
npx prisma generate

# 4. Import data
chmod +x scripts/import-backup-data.sh
./scripts/import-backup-data.sh
```

### Windows:

```powershell
cd backend

# 1. Push schema (creates tables)
npx prisma db push --accept-data-loss

# 2. Generate client
npx prisma generate

# 3. Import data
.\scripts\import-backup-data.ps1
```

---

## Verify Setup

### Check tables were created:

```bash
psql $DATABASE_URL -c "\dt"
```

You should see:
- Admin
- Vendor
- Customer
- Conversation
- Message
- CreditUsage
- WalletTransaction
- WhatsAppNumber
- Order
- CustomerInsights
- BillingHistory
- _prisma_migrations

### Check data was imported:

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Vendor\";"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Customer\";"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Message\";"
```

---

## Troubleshooting

### Error: "relation does not exist"
- **Cause:** Tables weren't created yet
- **Solution:** Run `npx prisma db push` first

### Error: "permission denied for schema public"
- **Cause:** User doesn't have permissions
- **Solution:** Fix permissions (Step 1)

### Error: "foreign key constraint violation"
- **Cause:** Importing in wrong order or missing parent records
- **Solution:** Import files in the exact order listed above

### Error: "duplicate key value violates unique constraint"
- **Cause:** Data already exists
- **Solution:** Either truncate tables first or skip already-imported files

---

## Summary

**Remember:**
1. ✅ **First:** Create tables with `prisma db push`
2. ✅ **Then:** Import data with the backup scripts
3. ✅ Tables must exist before data can be imported!

