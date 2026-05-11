# Fix Special Characters Encoding - Quick Guide

## The Problem
Special characters like emojis (😊), accented characters (é, ñ), and other Unicode characters are displaying as garbled text.

## Quick Fix (3 Steps)

### Step 1: Update DATABASE_URL

**Edit `backend/.env` file** and change:

```env
DATABASE_URL=mysql://apiuser:ChatLogix!@65.1.191.185:3306/chatlogix
```

**To:**

```env
DATABASE_URL=mysql://apiuser:ChatLogix!@65.1.191.185:3306/chatlogix?charset=utf8mb4
```

**Important:** Add `?charset=utf8mb4` at the end!

### Step 2: Fix Database and Tables

**In your MySQL client, run:**

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

**Or use the SQL file:**
```sql
source C:/Projects/ChatLogix/backend/database_backup/mysql/FIX_ENCODING.sql;
```

### Step 3: Restart Your Application

```powershell
# Stop all running services (Ctrl+C)

# Restart API
cd backend
npm run dev

# Restart Workers (in separate terminals)
npm run worker:incoming
npm run worker:response
```

## Verify It's Fixed

After restarting, check the logs. You should see:
```
Prisma DB config summary { host: '65.1.191.185', port: '3306', db: 'chatlogix' }
```

Then test with a message containing emojis or special characters.

## If Data is Still Corrupted

If existing data still shows garbled characters, the data was likely imported with wrong encoding. Options:

1. **Re-import the data** (from your database backup with proper encoding)
2. **Manually fix corrupted records** through the admin interface
3. **The new data will be correct** - only existing corrupted data needs fixing

## Why This Happens

- MySQL's default `utf8` is actually 3-byte (incomplete Unicode)
- `utf8mb4` is full 4-byte Unicode (supports emojis, all special characters)
- The connection must explicitly specify `charset=utf8mb4` to use it
- Without the charset parameter, MySQL may use a different encoding

## Summary

1. ✅ Add `?charset=utf8mb4` to DATABASE_URL in `.env`
2. ✅ Run the ALTER TABLE commands to fix existing tables
3. ✅ Restart all services
4. ✅ New data will be correct, existing corrupted data may need re-import

