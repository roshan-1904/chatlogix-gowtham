-- Migration: Add Notification System
-- Run this SQL directly against your PostgreSQL database
-- Compatible with HeidiSQL and other database clients

-- Create NotificationType enum (only if it doesn't exist)
CREATE TYPE "NotificationType" AS ENUM ('order_status_update', 'payment_link', 'shipping_update', 'custom_template');

-- Create NotificationStatus enum (only if it doesn't exist)
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed', 'retrying');

-- Create NotificationHistory table
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

-- Add notificationSettings column to Vendor table (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Vendor' AND column_name = 'notificationSettings'
    ) THEN
        ALTER TABLE "Vendor" ADD COLUMN "notificationSettings" JSONB;
    END IF;
END $$;

-- Add sendNotifications column to Order table (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Order' AND column_name = 'sendNotifications'
    ) THEN
        ALTER TABLE "Order" ADD COLUMN "sendNotifications" BOOLEAN NOT NULL DEFAULT true;
    END IF;
END $$;

-- Add foreign key constraints (only if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'NotificationHistory_vendorId_fkey'
    ) THEN
        ALTER TABLE "NotificationHistory" 
        ADD CONSTRAINT "NotificationHistory_vendorId_fkey" 
        FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'NotificationHistory_orderId_fkey'
    ) THEN
        ALTER TABLE "NotificationHistory" 
        ADD CONSTRAINT "NotificationHistory_orderId_fkey" 
        FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'NotificationHistory_customerId_fkey'
    ) THEN
        ALTER TABLE "NotificationHistory" 
        ADD CONSTRAINT "NotificationHistory_customerId_fkey" 
        FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Create indexes (only if they don't exist)
CREATE INDEX IF NOT EXISTS "NotificationHistory_vendorId_createdAt_idx" 
ON "NotificationHistory"("vendorId", "createdAt");

CREATE INDEX IF NOT EXISTS "NotificationHistory_orderId_idx" 
ON "NotificationHistory"("orderId");

CREATE INDEX IF NOT EXISTS "NotificationHistory_status_idx" 
ON "NotificationHistory"("status");
