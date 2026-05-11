# Testing Checklist for New Features

This checklist covers all the newly implemented features. Test each item systematically to ensure everything works correctly.

## Prerequisites
- [ ] Database migration has been run: `add_vendor_timezone_and_order_prefix.sql`
- [ ] Prisma client has been regenerated: `npx prisma generate`
- [ ] `date-fns-tz` package is installed: `npm install date-fns-tz`
- [ ] Backend builds successfully: `npm run build`
- [ ] Backend is running and accessible

---

## 1. First Customer Message Introduction

**Objective:** Verify that the system introduces itself on the first customer message.

### Test Cases:

#### Test 1.1: New Customer First Message
- [ ] Create a new conversation with a customer who has never messaged before
- [ ] Send the first message from the customer (e.g., "Hi" or "Hello")
- [ ] **Expected:** Response should include:
  - Introduction: "Hi! I'm {aiBotName}, your AI assistant for {businessName}"
  - Explanation: "I'm here to help you instantly with orders, product inquiries, and any questions you have"
  - Time-based greeting (Good morning/afternoon/evening)
- [ ] Verify the introduction appears naturally in the response

#### Test 1.2: Second Message (No Introduction)
- [ ] Send a second message from the same customer
- [ ] **Expected:** Response should NOT include the introduction again
- [ ] Response should only include the time-based greeting if appropriate

#### Test 1.3: Multiple Conversations
- [ ] Create a new conversation with a different customer
- [ ] Send first message
- [ ] **Expected:** Introduction appears again (each new conversation gets introduction)

---

## 2. India Timezone and Time-Based Greetings

**Objective:** Verify time-based greetings work correctly using India timezone.

### Test Cases:

#### Test 2.1: Morning Greeting (5 AM - 11:59 AM IST)
- [ ] Set system time or vendor timezone to India (Asia/Kolkata)
- [ ] Send a message during morning hours (5 AM - 11:59 AM IST)
- [ ] **Expected:** Greeting should be "Good morning"
- [ ] Verify greeting appears in first message introduction

#### Test 2.2: Afternoon Greeting (12 PM - 4:59 PM IST)
- [ ] Send a message during afternoon hours (12 PM - 4:59 PM IST)
- [ ] **Expected:** Greeting should be "Good afternoon"
- [ ] Verify greeting appears correctly

#### Test 2.3: Evening Greeting (5 PM - 8:59 PM IST)
- [ ] Send a message during evening hours (5 PM - 8:59 PM IST)
- [ ] **Expected:** Greeting should be "Good evening"
- [ ] Verify greeting appears correctly

#### Test 2.4: Night Greeting (9 PM - 4:59 AM IST)
- [ ] Send a message during night hours (9 PM - 4:59 AM IST)
- [ ] **Expected:** Greeting should be "Hello" (no time-specific greeting)
- [ ] Verify greeting appears correctly

#### Test 2.5: Timezone Default
- [ ] Check vendor record in database
- [ ] **Expected:** `timezone` field should default to `'Asia/Kolkata'` for existing vendors
- [ ] Verify new vendors also get India timezone by default

---

## 3. Custom AI Assistant Name

**Objective:** Verify the system uses the custom AI assistant name from vendor configuration.

### Test Cases:

#### Test 3.1: Custom AI Name in Introduction
- [ ] Set `aiBotName` in vendor configuration (e.g., "ChatBot", "OrderBot", "Assistant")
- [ ] Send first customer message
- [ ] **Expected:** Introduction should use the custom name: "Hi! I'm {customName}, your AI assistant..."
- [ ] Verify name appears correctly

#### Test 3.2: Custom AI Name in Greetings
- [ ] Send subsequent messages
- [ ] **Expected:** Greetings should reference the custom AI name when appropriate
- [ ] Verify name is used consistently throughout conversation

#### Test 3.3: Default AI Name Fallback
- [ ] Set `aiBotName` to NULL or empty in vendor configuration
- [ ] Send a message
- [ ] **Expected:** Should fallback to "AI assistant" or default name
- [ ] Verify no errors occur

---

## 4. New Order ID Format

**Objective:** Verify order IDs follow the new format: `ORD-{prefix}-YYYYMM{4-digit-count}`

### Test Cases:

#### Test 4.1: Order ID Format with Custom Prefix
- [ ] Set `orderPrefix` in vendor table (e.g., "VENDI", "BAKER", "SHOP1")
- [ ] Create a new order
- [ ] **Expected:** Order ID format should be: `ORD-VENDI-YYYYMM0001` (example)
- [ ] Verify:
  - Prefix is exactly 5 characters (padded if needed)
  - Year and month are correct (YYYYMM format)
  - Count starts at 0001 for first order of the month

#### Test 4.2: Order ID Sequential Count
- [ ] Create multiple orders in the same month
- [ ] **Expected:** Order IDs should increment:
  - `ORD-VENDI-2024120001`
  - `ORD-VENDI-2024120002`
  - `ORD-VENDI-2024120003`
- [ ] Verify count increments correctly

#### Test 4.3: Order ID Month Reset
- [ ] Create orders at end of month
- [ ] Create orders at start of next month
- [ ] **Expected:** Count should reset to 0001 for new month
- [ ] Verify format: `ORD-VENDI-2025010001` (example)

#### Test 4.4: Default Prefix (NULL orderPrefix)
- [ ] Set `orderPrefix` to NULL in vendor table
- [ ] Create a new order
- [ ] **Expected:** Should use default "ORDER" prefix: `ORD-ORDER-YYYYMM0001`
- [ ] Verify default works correctly

#### Test 4.5: Prefix Padding
- [ ] Set `orderPrefix` to "VEN" (3 characters)
- [ ] Create a new order
- [ ] **Expected:** Should pad to 5 characters: `ORD-VENXX-YYYYMM0001`
- [ ] Verify padding works correctly

#### Test 4.6: Prefix Truncation
- [ ] Set `orderPrefix` to "VENDOR123" (9 characters)
- [ ] Create a new order
- [ ] **Expected:** Should truncate to 5 characters: `ORD-VENDO-YYYYMM0001`
- [ ] Verify truncation works correctly

---

## 5. Enhanced CustomerInsights Storage

**Objective:** Verify all customer information is captured and stored in CustomerInsights.

### Test Cases:

#### Test 5.1: Basic Customer Information
- [ ] Customer provides name, phone, email, language
- [ ] **Expected:** All fields should be stored in CustomerInsights:
  - `customerName`
  - `alternativePhoneNumber`
  - `email`
  - `preferredLanguage`
- [ ] Verify data is persisted in database

#### Test 5.2: Delivery Information
- [ ] Customer provides delivery address and instructions
- [ ] **Expected:** Should store:
  - `primaryDeliveryAddress`
  - `deliveryAddress`
  - `deliveryInstructions`
  - `whatsappLocation` (if provided)
- [ ] Verify all delivery fields are captured

#### Test 5.3: Preferences and Communication Style
- [ ] Customer mentions preferences or communication style
- [ ] **Expected:** Should store:
  - `preferences`
  - `communicationStyle`
- [ ] Verify preferences are stored correctly

---

## 6. CustomerInsights Usage - No Repeated Questions

**Objective:** Verify the system uses stored customer insights and doesn't ask for repeated information.

### Test Cases:

#### Test 6.1: Name Already Known
- [ ] Customer name is stored in CustomerInsights
- [ ] Start a new conversation or ask a question
- [ ] **Expected:** System should NOT ask for name again
- [ ] System should use the stored name naturally in responses
- [ ] Verify: "What's your name?" should NOT appear

#### Test 6.2: Address Already Known
- [ ] Customer address is stored in CustomerInsights
- [ ] Customer places a new order
- [ ] **Expected:** System should NOT ask for address again
- [ ] System should use stored address: "Should I deliver to {stored address}?"
- [ ] Verify: "What's your delivery address?" should NOT appear if address exists

#### Test 6.3: Preferences Already Known
- [ ] Customer preferences are stored (e.g., "prefers spicy food")
- [ ] Customer orders food
- [ ] **Expected:** System should reference stored preferences
- [ ] System should NOT ask for preferences again
- [ ] Verify preferences are used in recommendations

---

## Integration Tests

### Test I.1: Complete Flow - New Customer
- [ ] New customer sends first message
- [ ] **Expected:**
  - Introduction appears with custom AI name
  - Time-based greeting is correct
  - System asks for necessary information
- [ ] Customer provides name, address, preferences
- [ ] **Expected:** All information is stored in CustomerInsights
- [ ] Customer places order
- [ ] **Expected:** Order ID follows new format
- [ ] Customer places second order
- [ ] **Expected:** System uses stored information, doesn't ask again

### Test I.2: Complete Flow - Returning Customer
- [ ] Returning customer (with stored insights) sends message
- [ ] **Expected:** No introduction (not first message)
- [ ] Time-based greeting appears
- [ ] Customer places order
- [ ] **Expected:**
  - System uses stored name, address, preferences
  - System does NOT ask for repeated information
  - Order ID follows new format
  - Order count increments correctly

---

## Edge Cases and Error Handling

### Test E.1: Missing Vendor Configuration
- [ ] Vendor has NULL `aiBotName`
- [ ] **Expected:** Should fallback to default "AI assistant"
- [ ] No errors should occur

### Test E.2: Missing Order Prefix
- [ ] Vendor has NULL `orderPrefix`
- [ ] **Expected:** Should use default "ORDER" prefix
- [ ] Order ID should still be generated correctly

### Test E.3: Invalid Timezone
- [ ] Vendor has invalid timezone value
- [ ] **Expected:** Should fallback gracefully to default greeting "Hello"
- [ ] No errors should crash the system

---

## Quick Test Script

For quick verification, run these commands:

```bash
# 1. Verify migration
psql -d your_database -f backend/prisma/migrations/add_vendor_timezone_and_order_prefix.sql

# 2. Verify Prisma client
cd backend && npx prisma generate

# 3. Verify build
cd backend && npm run build

# 4. Check vendor table has new fields
psql -d your_database -c "SELECT id, \"aiBotName\", timezone, \"orderPrefix\" FROM \"Vendor\" LIMIT 1;"
```

---

## Test Data Setup

### Sample Vendor Configuration:
```sql
UPDATE "Vendor" 
SET 
  "aiBotName" = 'OrderBot',
  timezone = 'Asia/Kolkata',
  "orderPrefix" = 'VENDI'
WHERE id = 'your-vendor-id';
```

### Sample Customer Insights:
```sql
INSERT INTO "CustomerInsights" (
  "customerId", 
  "vendorId", 
  "customerName",
  "primaryDeliveryAddress",
  "preferences",
  "communicationStyle"
) VALUES (
  'customer-id',
  'vendor-id',
  'John Doe',
  '123 Main St, City',
  'Prefers spicy food',
  'friendly'
);
```

---

## Sign-off

**Tester Name:** _________________________

**Date:** _________________________

**Status:** 
- [ ] All tests passed
- [ ] Some tests failed (see notes below)
- [ ] Tests not completed

**Notes:**
_________________________________________________________________
_________________________________________________________________
