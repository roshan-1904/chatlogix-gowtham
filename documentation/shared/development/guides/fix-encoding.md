# Fix Special Characters Encoding Issue

> **Note (historical):** This guide describes a fix for a MySQL-backed deployment. The project has since moved to PostgreSQL (Supabase) via Prisma — see `backend/prisma/schema.prisma` (`provider = "postgresql"`) and `CLAUDE.md` — so the `utf8mb4`/MySQL-specific steps below no longer apply to the current database. It's also stale on the restart step: `npm run worker:incoming` and `npm run worker:response` were removed from `backend/package.json` (those workers no longer exist); the current local worker scripts are `npm run worker:conversation` and `npm run worker:media`. Kept here for historical context only.

## Problem
Special characters, emojis, and Unicode characters are displaying as garbled text (e.g., "fyè", "Õé", "fi¹½ÖØñ´©Å") after migrating to MySQL.

## Root Cause
The MySQL connection needs to explicitly specify `charset=utf8mb4` to properly handle Unicode characters.

## Solution

### Step 1: Update DATABASE_URL

**Manually edit your `.env` file** and update the `DATABASE_URL` to include the charset parameter:

**Current:**
```env
DATABASE_URL=mysql://apiuser:ChatLogix!@65.1.191.185:3306/chatlogix
```

**Updated (add `?charset=utf8mb4`):**
```env
DATABASE_URL=mysql://apiuser:ChatLogix!@65.1.191.185:3306/chatlogix?charset=utf8mb4
```

### Step 2: Verify Database Character Set

Run this in your MySQL client to verify the database is using utf8mb4:

```sql
-- Check database character set
SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = 'chatlogix';

-- Should show: utf8mb4 / utf8mb4_unicode_ci
```

If not utf8mb4, run:
```sql
ALTER DATABASE chatlogix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Step 3: Verify Table Character Sets

Check all tables are using utf8mb4:

```sql
SELECT TABLE_NAME, TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'chatlogix'
AND TABLE_TYPE = 'BASE TABLE';
```

If any tables are not using utf8mb4, fix them:

```sql
ALTER TABLE Vendor CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE Customer CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE Conversation CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE Message CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `Order` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE CreditUsage CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE WalletTransaction CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE WhatsAppNumber CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE CustomerInsights CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE Admin CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE BillingHistory CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Step 4: Fix Existing Data (If Already Corrupted)

If data is already corrupted, you have two options:

#### Option A: Re-import Data (Recommended)

1. Export data again from your PostgreSQL database with proper encoding
2. Or use the existing SQL files but ensure they're imported with utf8mb4

#### Option B: Fix Connection and Re-save Data

1. Update DATABASE_URL with charset parameter
2. Restart your application
3. The application will automatically use utf8mb4 for new data
4. For existing corrupted data, you may need to manually fix or re-import

### Step 5: Restart All Services

After updating `.env`:

```powershell
# Restart API
npm run dev

# Restart Workers (in separate terminals)
npm run worker:incoming
npm run worker:response
```

### Step 6: Verify Connection Character Set

Run the diagnostic script:

```powershell
cd backend
npx tsx scripts/fix-mysql-charset.ts
```

This will check:
- Database character set
- Table character sets
- Connection character set

### Step 7: Test Special Characters

After restarting, test with a message containing:
- Emojis: 😊 🍫 ❤️
- Special characters: é, ñ, ü, etc.
- Unicode: 中文, العربية, etc.

## Quick Fix Script

Run this SQL in your MySQL client to fix everything at once:

```sql
-- Fix database
ALTER DATABASE chatlogix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Fix all tables
ALTER TABLE Vendor CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE Customer CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE Conversation CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE Message CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `Order` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE CreditUsage CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE WalletTransaction CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE WhatsAppNumber CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE CustomerInsights CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE Admin CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE BillingHistory CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## Important Notes

1. **The `charset=utf8mb4` parameter in DATABASE_URL is critical** - This ensures Prisma/MySQL connection uses utf8mb4
2. **utf8mb4 vs utf8** - MySQL's `utf8` is actually a subset (3 bytes), `utf8mb4` is full 4-byte Unicode
3. **Existing corrupted data** - May need to be re-imported if already corrupted
4. **New data** - Will automatically use utf8mb4 once connection is fixed

## Verification

After applying fixes, check:

```sql
-- Check connection charset
SHOW VARIABLES LIKE 'character_set%';

-- Should show utf8mb4 for:
-- character_set_client
-- character_set_connection  
-- character_set_database
-- character_set_results
```

## Still Having Issues?

If special characters are still not working:

1. Check MySQL server configuration (`my.cnf` or `my.ini`):
   ```ini
   [mysqld]
   character-set-server=utf8mb4
   collation-server=utf8mb4_unicode_ci
   ```

2. Restart MySQL server after changing configuration

3. Verify client connection:
   ```sql
   SET NAMES utf8mb4;
   ```

4. Check if data was imported with wrong encoding - may need to re-import

