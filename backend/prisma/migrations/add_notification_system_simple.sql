-- Migration: Add Notification System (HeidiSQL Compatible)
-- Run this SQL directly against your PostgreSQL database
-- If enums already exist, you can skip those CREATE TYPE statements

-- Step 1: Create NotificationType enum
-- If this fails with "already exists", that's okay - just continue
CREATE TYPE "NotificationType" AS ENUM ('order_status_update', 'payment_link', 'shipping_update', 'custom_template');

-- Step 2: Create NotificationStatus enum
-- If this fails with "already exists", that's okay - just continue
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed', 'retrying');

-- Step 3: Create NotificationHistory table
CREATE TABLE IF NOT EXISTS "NotificationHistory" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "orderId" TEXT,
    "customerId" TEXT NOT NULL,
    "notificationType" "NotificationType" NOT NULL,
    "templateName" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "whatsappMessageId" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationHistory_pkey" PRIMARY KEY ("id")
);

-- Step 4: Add notificationSettings column to Vendor table
-- Run this only if the column doesn't exist
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "notificationSettings" JSONB;

-- Step 5: Add sendNotifications column to Order table
-- Run this only if the column doesn't exist
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sendNotifications" BOOLEAN NOT NULL DEFAULT true;

-- Step 6: Add foreign key constraints
-- Run these one at a time. If a constraint already exists, skip that statement.
ALTER TABLE "NotificationHistory" 
ADD CONSTRAINT "NotificationHistory_vendorId_fkey" 
FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationHistory" 
ADD CONSTRAINT "NotificationHistory_orderId_fkey" 
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationHistory" 
ADD CONSTRAINT "NotificationHistory_customerId_fkey" 
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 7: Create indexes
CREATE INDEX IF NOT EXISTS "NotificationHistory_vendorId_createdAt_idx" 
ON "NotificationHistory"("vendorId", "createdAt");

CREATE INDEX IF NOT EXISTS "NotificationHistory_orderId_idx" 
ON "NotificationHistory"("orderId");

CREATE INDEX IF NOT EXISTS "NotificationHistory_status_idx" 
ON "NotificationHistory"("status");

