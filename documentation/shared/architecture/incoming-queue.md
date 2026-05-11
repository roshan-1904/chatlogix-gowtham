# Fix: Incoming Queue Not Listing Messages

## Problem Identified

1. ❌ `incomingMessageWorker` was NOT running
2. ❌ Old `textWorker` was consuming messages and just deleting them without processing
3. ❌ Messages were being consumed but not processed

## What Was Fixed

✅ Updated `ecosystem.config.js`:
- Replaced `textWorker` with `incomingMessageWorker`
- New worker will properly process messages (credits, AI, storage)

## How to Apply the Fix

### Step 1: Build the Code
```bash
cd backend
npm run build
```

### Step 2: Stop Old Worker and Start New One
```bash
# On your server
pm2 stop chatlogix-text-worker
pm2 delete chatlogix-text-worker

# Start with updated config
pm2 reload ecosystem.config.js
# OR
pm2 restart ecosystem.config.js --update-env
```

### Step 3: Verify It's Running
```bash
pm2 status

# Should show:
# - chatlogix-backend
# - chatlogix-incoming-worker ← NEW!
# - chatlogix-response-worker
# - chatlogix-audio-worker
# - chatlogix-image-worker
```

### Step 4: Check Logs
```bash
# Incoming worker logs
pm2 logs chatlogix-incoming-worker --lines 50

# Should see: "Incoming message worker started"
```

### Step 5: Test
```bash
# Send a WhatsApp message
# Monitor logs
pm2 logs --lines 100

# Should see:
# 1. Webhook storing message
# 2. Incoming worker picking up message
# 3. AI being generated
# 4. Response being sent
```

## What to Look For

### Success Indicators:
```
✅ Incoming message worker started
✅ Processing text message
✅ Generating structured AI response
✅ Storing assistant message
✅ Enqueuing for WhatsApp delivery
```

### If Still Not Working:
1. Check queue depth in AWS SQS console
2. Verify INCOMING_QUEUE_URL in .env
3. Check worker logs for errors

## Why This Happened

The old architecture had `textWorker` which just logged and deleted messages. When we refactored to the new architecture, we created `incomingMessageWorker` but forgot to:
1. Add it to ecosystem.config.js
2. Remove/replace the old textWorker

Now fixed! ✅

