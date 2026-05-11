# Multi-Stage AI Worker - Troubleshooting Guide

## 🔍 Why Multi-Stage Worker Not Triggering?

### Checklist

1. ✅ **Is the worker running?**
2. ✅ **Are environment variables set correctly?
3. ✅ **Are messages in the queue?**
4. ✅ **Is feature flag enabled?**
5. ✅ **Are both workers running simultaneously?**

---

## Step 1: Check Worker is Running

### Check if worker process is running:

```bash
# Check PM2 processes
pm2 list

# Check logs
pm2 logs chatlogix-multi-stage-ai-worker

# OR if running directly
# Check terminal output for: "Multi-Stage AI Worker started"
```

### Start the worker:

```bash
# Option 1: Using npm script
npm run worker:multi-stage

# Option 2: Using PM2
pm2 start ecosystem.config.js --only chatlogix-multi-stage-ai-worker

# Option 3: Direct execution
npx tsx src/workers/multiStageAIWorker.ts
```

**Expected output when worker starts:**
```
Multi-Stage AI Worker started
```

---

## Step 2: Check Environment Variables

### Required Environment Variables:

```bash
# Check if variables are set
echo $ENABLE_MULTI_STAGE_AI
echo $MULTI_STAGE_AI_ROLLOUT_PERCENTAGE
```

### Add to `.env` file:

```env
# Enable multi-stage for ALL conversations
ENABLE_MULTI_STAGE_AI=true

# OR enable gradual rollout (10%)
ENABLE_MULTI_STAGE_AI=percentage
MULTI_STAGE_AI_ROLLOUT_PERCENTAGE=10
```

### Verify in code:

Create a test script to check:

```typescript
// test-env-check.ts
import { env } from './src/config/env.js';

console.log('ENABLE_MULTI_STAGE_AI:', env.ENABLE_MULTI_STAGE_AI);
console.log('MULTI_STAGE_AI_ROLLOUT_PERCENTAGE:', env.MULTI_STAGE_AI_ROLLOUT_PERCENTAGE);
console.log('INCOMING_QUEUE_URL:', env.INCOMING_QUEUE_URL);
```

Run:
```bash
npx tsx test-env-check.ts
```

---

## Step 3: Check Queue Configuration

### Verify queue URL:

```bash
# Check environment variable
echo $INCOMING_QUEUE_URL

# Should be set in .env:
# INCOMING_QUEUE_URL=http://localhost:4566/000000000000/incoming-queue
# OR
# INCOMING_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/123456789/incoming-queue
```

### Check if messages are in queue:

**For LocalStack:**
```bash
aws --endpoint-url=http://localhost:4566 sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/incoming-queue \
  --attribute-names ApproximateNumberOfMessages
```

**For AWS SQS:**
```bash
aws sqs get-queue-attributes \
  --queue-url $INCOMING_QUEUE_URL \
  --attribute-names ApproximateNumberOfMessages
```

---

## Step 4: Check Feature Flag Logic

### Current Logic:

```typescript
// If ENABLE_MULTI_STAGE_AI is:
// - 'false' → Multi-stage disabled (legacy handles all)
// - 'true' → Multi-stage enabled for ALL
// - 'percentage' → Multi-stage enabled for X% (needs MULTI_STAGE_AI_ROLLOUT_PERCENTAGE)
// - undefined/null → Multi-stage disabled (default)
```

### Common Issues:

1. **Variable not set** → Defaults to `false` (disabled)
2. **Variable set to empty string** → Treated as `undefined` → Disabled
3. **Variable has extra spaces** → May not match `'true'` exactly
4. **Variable set but worker not restarted** → Old value cached

---

## Step 5: Check Worker Coordination

### Both Workers Running?

If **both** `incomingMessageWorker` and `multiStageAIWorker` are running:

- **Legacy worker** checks feature flag → Skips if multi-stage enabled
- **Multi-stage worker** checks feature flag → Processes if enabled
- **SQS visibility timeout** prevents duplicate processing

### Issue: Both workers processing same message

**Solution:** Make sure feature flag is set correctly and both workers are reading it.

---

## Step 6: Add Debug Logging

Add this to see what's happening:

```typescript
// In multiStageAIWorker.ts, add at start of loop():
logger.info({
  enableMultiStage: env.ENABLE_MULTI_STAGE_AI,
  rolloutPercentage: env.MULTI_STAGE_AI_ROLLOUT_PERCENTAGE,
  queueUrl: env.INCOMING_QUEUE_URL
}, 'Worker configuration check');
```

---

## Step 7: Test Feature Flag Logic

Create a test script:

```typescript
// test-feature-flag.ts
import { env } from './src/config/env.js';

function shouldUseMultiStage(conversationId: string): boolean {
  const enableMultiStage = env.ENABLE_MULTI_STAGE_AI;
  const rolloutPercentage = env.MULTI_STAGE_AI_ROLLOUT_PERCENTAGE;
  
  console.log('enableMultiStage:', enableMultiStage);
  console.log('rolloutPercentage:', rolloutPercentage);
  
  if (enableMultiStage === 'false') {
    console.log('Result: false (explicitly disabled)');
    return false;
  }
  
  if (enableMultiStage === 'true') {
    console.log('Result: true (explicitly enabled)');
    return true;
  }
  
  if (rolloutPercentage) {
    const percentage = Number.parseInt(rolloutPercentage, 10);
    console.log('Parsed percentage:', percentage);
    
    // Test hash
    let hash = 0;
    for (let i = 0; i < conversationId.length; i++) {
      const char = conversationId.codePointAt(i) ?? 0;
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    hash = Math.abs(hash);
    
    const eligible = (hash % 100) < percentage;
    console.log('Hash:', hash, 'Mod:', hash % 100, 'Eligible:', eligible);
    return eligible;
  }
  
  console.log('Result: false (default - disabled)');
  return false;
}

// Test with sample conversation IDs
const testIds = ['conv-123', 'conv-456', 'conv-789'];
testIds.forEach(id => {
  console.log(`\nTesting conversationId: ${id}`);
  shouldUseMultiStage(id);
});
```

Run:
```bash
npx tsx test-feature-flag.ts
```

---

## Common Issues & Solutions

### Issue 1: Worker Not Starting

**Symptoms:**
- No "Multi-Stage AI Worker started" message
- Process exits immediately

**Solutions:**
1. Check for errors in console
2. Verify all dependencies installed: `npm install`
3. Check database connection: `npm run db:test`
4. Verify queue URL is accessible

### Issue 2: Worker Running But Not Processing

**Symptoms:**
- Worker starts successfully
- No messages being processed
- No logs after startup

**Solutions:**
1. Check if messages are in queue
2. Verify `INCOMING_QUEUE_URL` is correct
3. Check SQS permissions (if using AWS)
4. Verify LocalStack is running (if using local)

### Issue 3: Feature Flag Not Working

**Symptoms:**
- Worker running but skipping all messages
- Legacy worker processing everything

**Solutions:**
1. Verify `.env` file has correct values
2. Restart worker after changing `.env`
3. Check for typos: `ENABLE_MULTI_STAGE_AI=true` (not `True` or `TRUE`)
4. Remove quotes if present: `ENABLE_MULTI_STAGE_AI="true"` → `ENABLE_MULTI_STAGE_AI=true`

### Issue 4: Percentage Rollout Not Working

**Symptoms:**
- Set to 10% but nothing processes
- Set to 100% but only some process

**Solutions:**
1. Verify both variables set:
   ```env
   ENABLE_MULTI_STAGE_AI=percentage
   MULTI_STAGE_AI_ROLLOUT_PERCENTAGE=10
   ```
2. Check percentage is valid (0-100)
3. Test with different conversation IDs
4. Use `ENABLE_MULTI_STAGE_AI=true` for 100%

### Issue 5: Both Workers Processing Same Message

**Symptoms:**
- Duplicate responses
- Messages processed twice

**Solutions:**
1. Check SQS visibility timeout (should be 30 seconds)
2. Verify feature flag logic in both workers
3. Only run one worker at a time during testing
4. Check that legacy worker is skipping when multi-stage enabled

---

## Quick Diagnostic Script

Run this to check everything:

```bash
# 1. Check worker is running
pm2 list | grep multi-stage

# 2. Check environment variables
node -e "require('dotenv').config(); console.log('ENABLE_MULTI_STAGE_AI:', process.env.ENABLE_MULTI_STAGE_AI)"

# 3. Check queue
aws --endpoint-url=http://localhost:4566 sqs get-queue-attributes \
  --queue-url $INCOMING_QUEUE_URL \
  --attribute-names ApproximateNumberOfMessages

# 4. Check logs
pm2 logs chatlogix-multi-stage-ai-worker --lines 50
```

---

## Expected Behavior

### When Multi-Stage is Enabled (`ENABLE_MULTI_STAGE_AI=true`):

1. **Legacy Worker:**
   - Receives message
   - Checks feature flag
   - Sees multi-stage enabled
   - **Skips processing** (doesn't delete message)
   - Logs: "Multi-stage AI processing enabled - skipping legacy processing"

2. **Multi-Stage Worker:**
   - Receives message (after visibility timeout)
   - Checks feature flag
   - Sees multi-stage enabled
   - **Processes message** through multi-stage pipeline
   - Deletes message from queue

### When Multi-Stage is Disabled (`ENABLE_MULTI_STAGE_AI=false`):

1. **Legacy Worker:**
   - Receives message
   - Checks feature flag
   - Sees multi-stage disabled
   - **Processes message** with legacy method
   - Deletes message from queue

2. **Multi-Stage Worker:**
   - Receives message
   - Checks feature flag
   - Sees multi-stage disabled
   - **Skips processing** (doesn't delete message)

---

## Still Not Working?

1. **Enable debug logging:**
   ```env
   LOG_LEVEL=debug
   ```

2. **Check worker logs for:**
   - "Multi-Stage AI Worker started"
   - "Using multi-stage AI processing"
   - "Using legacy AI processing"
   - Any error messages

3. **Test with a single message:**
   ```bash
   npm run test:multi-stage "test message"
   ```

4. **Verify database tables exist:**
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_name IN ('ConversationMemory', 'StageExecutionLog');
   ```

