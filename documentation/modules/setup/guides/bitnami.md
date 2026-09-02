# Bitnami PostgreSQL Setup Guide

## Problem: Peer Authentication Failed

This error occurs because PostgreSQL uses peer authentication by default on Linux. Here are several solutions:

## Solution 1: Use sudo to switch to postgres user (Recommended)

```bash
sudo -u postgres psql -d chatlogix -c "GRANT ALL ON SCHEMA public TO PUBLIC; GRANT CREATE ON SCHEMA public TO PUBLIC;"
```

Or connect interactively:
```bash
sudo -u postgres psql -d chatlogix
```

Then run:
```sql
GRANT ALL ON SCHEMA public TO PUBLIC;
GRANT CREATE ON SCHEMA public TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO PUBLIC;
\q
```

## Solution 2: Connect via TCP/IP using DATABASE_URL

If you have DATABASE_URL set in your .env file:

```bash
# Source your environment variables
source ~/.bashrc  # or wherever your .env is loaded

# Or export directly
export DATABASE_URL="postgresql://user:password@localhost:5432/chatlogix"

# Connect using the connection string
psql $DATABASE_URL -c "GRANT ALL ON SCHEMA public TO PUBLIC; GRANT CREATE ON SCHEMA public TO PUBLIC;"
```

## Solution 3: Connect as bitnami user (if it has access)

On Bitnami, you might be able to connect directly:

```bash
psql -U bitnami -d chatlogix -h localhost
```

Or check what PostgreSQL users exist:
```bash
sudo -u postgres psql -c "\du"
```

## Solution 4: Use the helper script

```bash
cd /path/to/ChatLogix/backend
chmod +x backend/scripts/fix-permissions-bitnami.sh
./backend/scripts/fix-permissions-bitnami.sh
```

## Complete Setup Process

Once permissions are fixed:

### 1. Fix Permissions (choose one method above)

### 2. Push Prisma Schema

```bash
cd /path/to/ChatLogix/backend
npx prisma db push --accept-data-loss
```

### 3. Generate Prisma Client

```bash
npx prisma generate
```

### 4. Import Backup Data

**Note:** `backend/scripts/import-backup-data.sh` (referenced below and by `setup-database-bitnami.sh`) no longer exists in this repo. The current equivalent is the npm script `db:import`, which runs `backend/scripts/import-database-backup.ts`:

```bash
cd backend
npm run db:import
```

That script reads the `_rows.sql` files listed below from `backend/database_backup/` — that directory doesn't ship in the repo, so copy the files from `scripts/database/backups/` (repo root) into `backend/database_backup/` first, or point the script at wherever your backup files actually live.

The original (now-missing) script commands, kept for reference:

```bash
chmod +x backend/scripts/import-backup-data.sh
./backend/scripts/import-backup-data.sh
```

The all-in-one script `backend/scripts/setup-database-bitnami.sh` still exists and runs permission-fix + schema push + Prisma generate, but its own final "Import Backup Data" step silently no-ops today (it looks for the same missing `import-backup-data.sh`) — run `npm run db:import` yourself afterward.

## Troubleshooting

### Check PostgreSQL status
```bash
sudo /opt/bitnami/ctlscript.sh status postgresql
```

### Restart PostgreSQL
```bash
sudo /opt/bitnami/ctlscript.sh restart postgresql
```

### Check pg_hba.conf location (Bitnami)
```bash
ls -la /opt/bitnami/postgresql/conf/pg_hba.conf
```

### View current users
```bash
sudo -u postgres psql -c "\du"
```

### Check database exists
```bash
sudo -u postgres psql -l | grep chatlogix
```

## Quick Reference: Manual Import Order

If `npm run db:import` doesn't work, import manually in this order:

```bash
export PGPASSWORD="your_password"
psql -h localhost -U your_user -d chatlogix -f scripts/database/backups/Admin_rows.sql
psql -h localhost -U your_user -d chatlogix -f scripts/database/backups/Vendor_rows.sql
psql -h localhost -U your_user -d chatlogix -f scripts/database/backups/Customer_rows.sql
psql -h localhost -U your_user -d chatlogix -f scripts/database/backups/Conversation_rows.sql
psql -h localhost -U your_user -d chatlogix -f scripts/database/backups/Message_rows.sql
psql -h localhost -U your_user -d chatlogix -f scripts/database/backups/CreditUsage_rows.sql
psql -h localhost -U your_user -d chatlogix -f scripts/database/backups/WalletTransaction_rows.sql
psql -h localhost -U your_user -d chatlogix -f scripts/database/backups/WhatsAppNumber_rows.sql
psql -h localhost -U your_user -d chatlogix -f scripts/database/backups/Order_rows.sql
psql -h localhost -U your_user -d chatlogix -f scripts/database/backups/CustomerInsights_rows.sql
psql -h localhost -U your_user -d chatlogix -f scripts/database/backups/_prisma_migrations_rows.sql
unset PGPASSWORD
```

