-- Migration: Add indexes for vendor dashboard performance optimization
-- Created: 2025-01-XX
-- Purpose: Improve query performance for dashboard stats endpoint

-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_order_vendor_created ON "Order"("vendorId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_order_vendor_status ON "Order"("vendorId", status);
CREATE INDEX IF NOT EXISTS idx_order_vendor_status_created ON "Order"("vendorId", status, "createdAt" DESC);

-- Credit usage indexes
CREATE INDEX IF NOT EXISTS idx_creditusage_vendor_date ON "CreditUsage"("vendorId", "usageDate" DESC);
CREATE INDEX IF NOT EXISTS idx_creditusage_vendor_type ON "CreditUsage"("vendorId", "conversationType");

-- Conversation indexes
CREATE INDEX IF NOT EXISTS idx_conversation_vendor_updated ON "Conversation"("vendorId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_vendor_status ON "Conversation"("vendorId", status);
CREATE INDEX IF NOT EXISTS idx_conversation_vendor_created ON "Conversation"("vendorId", "createdAt" DESC);

-- Product indexes
CREATE INDEX IF NOT EXISTS idx_product_vendor_active ON "Product"("vendorId", "isActive");
CREATE INDEX IF NOT EXISTS idx_product_vendor_stock ON "Product"("vendorId", "inStock");

-- Message indexes (for response time calculations)
CREATE INDEX IF NOT EXISTS idx_message_conversation_timestamp ON "Message"("conversationId", timestamp DESC);

