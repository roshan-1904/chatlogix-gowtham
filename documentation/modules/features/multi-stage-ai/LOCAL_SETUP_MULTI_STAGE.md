# Running Multi-Stage AI Worker Locally

> **⚠️ Superseded — this worker no longer exists.** The 14-stage `multiStageOrchestrator.ts` pipeline this guide sets up locally is no longer on the production hot path; it was replaced by `backend/src/conversation/*` (see **`docs/CONVERSATION_PROCESSOR_LAMBDA.md`** for the current design). Worse, `backend/src/workers/multiStageAIWorker.ts` — the worker these instructions build and run (`npm run worker:multi-stage`, PM2 process `chatlogix-multi-stage-ai-worker`) — was deleted as dead code on 2026-09-02 (zero remaining references), so the commands below will not work as written. For local development against the current pipeline, use `npm run worker:conversation` (runs `backend/src/workers/conversationWorker.ts`) instead. The steps below are kept as historical/reference material describing how the old pipeline was run locally.

## Prerequisites

1. **Node.js 18+** installed
2. **PostgreSQL Database** running (or MySQL if configured)
3. **Redis** (optional, for caching)
4. **AWS SQS** or **LocalStack** (for local SQS simulation)
5. **OpenAI API Key** (for AI processing)

## Step 1: Install Dependencies

```bash
cd backend
npm install
```

## Step 2: Setup Environment Variables

Create or update `.env` file in `backend/` directory:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/chatlogix"
# OR MySQL:
# DATABASE_URL="mysql://user:password@localhost:3306/chatlogix"

# Redis (optional)
REDIS_URL="redis://localhost:6379"

# Queue Configuration
QUEUE_PROVIDER="sqs"  # or "redis" for local development
AWS_REGION="ap-south-1"

# For LocalStack (local SQS simulation)
AWS_SQS_ENDPOINT="http://localhost:4566"  # LocalStack endpoint
AWS_ACCESS_KEY_ID="test"
AWS_SECRET_ACCESS_KEY="test"

# SQS Queue URLs
# For LocalStack, these will be created automatically
# Format: http://localhost:4566/000000000000/incoming-queue
INCOMING_QUEUE_URL="http://localhost:4566/000000000000/incoming-queue"
RESPONSE_QUEUE_URL="http://localhost:4566/000000000000/response-queue"

# AI Configuration
OPENAI_API_KEY="sk-your-openai-api-key"

# Multi-Stage AI Feature Flags
ENABLE_MULTI_STAGE_AI="true"  # or "percentage" for gradual rollout
MULTI_STAGE_AI_ROLLOUT_PERCENTAGE="100"  # 0-100, only used if ENABLE_MULTI_STAGE_AI="percentage"

# Logging
LOG_LEVEL="debug"  # Use "debug" for detailed logs during development

# Other required vars (minimal setup)
NODE_ENV="development"
PORT="3000"
```

## Step 3: Setup LocalStack (for Local SQS)

If you don't have AWS SQS, use LocalStack to simulate SQS locally:

### Option A: Docker Compose (Recommended)

Create `docker-compose.yml` in project root:

```yaml
version: '3.8'
services:
  localstack:
    image: localstack/localstack:latest
    ports:
      - "4566:4566"
    environment:
      - SERVICES=sqs
      - DEBUG=1
      - DATA_DIR=/tmp/localstack/data
    volumes:
      - "./localstack-data:/tmp/localstack"
```

Start LocalStack:
```bash
docker-compose up -d
```

### Option B: Install LocalStack Directly

```bash
pip install localstack
localstack start
```

### Create Queues in LocalStack

```bash
# Install AWS CLI if not installed
# Then create queues:

aws --endpoint-url=http://localhost:4566 sqs create-queue \
  --queue-name incoming-queue \
  --region ap-south-1

aws --endpoint-url=http://localhost:4566 sqs create-queue \
  --queue-name response-queue \
  --region ap-south-1

# Get queue URLs
aws --endpoint-url=http://localhost:4566 sqs get-queue-url \
  --queue-name incoming-queue \
  --region ap-south-1

aws --endpoint-url=http://localhost:4566 sqs get-queue-url \
  --queue-name response-queue \
  --region ap-south-1
```

Update `.env` with the queue URLs returned.

## Step 4: Setup Database

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations (if needed)
npm run prisma:migrate

# Test database connection
npm run db:test
```

## Step 5: Build the Code

```bash
npm run build
```

## Step 6: Run the Multi-Stage AI Worker

### Option A: Using npm script (Recommended)

```bash
npm run worker:multi-stage
```

### Option B: Direct execution

```bash
# Using tsx (TypeScript execution)
npx tsx src/workers/multiStageAIWorker.ts

# OR after building
node dist/workers/multiStageAIWorker.js
```

### Option C: Using PM2 (for production-like testing)

```bash
# Install PM2 globally
npm install -g pm2

# Start worker
pm2 start ecosystem.config.js --only chatlogix-multi-stage-ai-worker

# Monitor
pm2 logs chatlogix-multi-stage-ai-worker

# Stop
pm2 stop chatlogix-multi-stage-ai-worker
```

## Step 7: Test the Worker

### Send a Test Message to Queue

Using AWS CLI:
```bash
aws --endpoint-url=http://localhost:4566 sqs send-message \
  --queue-url http://localhost:4566/000000000000/incoming-queue \
  --message-body '{
    "type": "TextMessage",
    "vendorId": "test-vendor-id",
    "customerPhone": "+1234567890",
    "content": "I want to order 2kg brownie",
    "phoneNumberId": "test-phone-id"
  }'
```

Using Node.js script:
```javascript
// test-send-message.js
import { publishToQueue } from './src/queue/sqsClient.js';
import { env } from './src/config/env.js';

await publishToQueue(env.INCOMING_QUEUE_URL, {
  type: 'TextMessage',
  vendorId: 'test-vendor-id',
  customerPhone: '+1234567890',
  content: 'I want to order 2kg brownie',
  phoneNumberId: 'test-phone-id'
});

console.log('Message sent!');
```

Run:
```bash
npx tsx test-send-message.js
```

## Step 8: Monitor Logs

The worker will output logs to console. Look for:

```
Multi-Stage AI Worker started
Multi-Stage AI Worker { conversationKey: '...', messageCount: 1 }
Storing messages in database
Using multi-stage AI processing
Executing multi-stage pipeline
Multi-stage processing completed { stagesExecuted: [...], totalCost: ... }
```

## Running Multiple Workers (Optional)

You can run both legacy and multi-stage workers simultaneously:

### Terminal 1: Legacy Worker
```bash
npm run worker:incoming
```

### Terminal 2: Multi-Stage Worker
```bash
npm run worker:multi-stage
```

### Terminal 3: Response Worker
```bash
npm run worker:response
```

**Note:** Both workers will poll the same queue. The legacy worker will skip messages that multi-stage handles (based on feature flag).

## Feature Flag Testing

### Test 1: Disable Multi-Stage (All Legacy)
```bash
export ENABLE_MULTI_STAGE_AI=false
npm run worker:multi-stage
```
- Multi-stage worker will skip all messages
- Legacy worker will process everything

### Test 2: Enable Multi-Stage (All Multi-Stage)
```bash
export ENABLE_MULTI_STAGE_AI=true
npm run worker:multi-stage
```
- Multi-stage worker processes all messages
- Legacy worker skips all messages

### Test 3: Gradual Rollout (10%)
```bash
export ENABLE_MULTI_STAGE_AI=percentage
export MULTI_STAGE_AI_ROLLOUT_PERCENTAGE=10
npm run worker:multi-stage
```
- 10% of conversations use multi-stage
- 90% use legacy
- Consistent routing per conversation

## Troubleshooting

### Issue: "Queue not found"
**Solution:** Make sure LocalStack is running and queues are created:
```bash
docker-compose ps  # Check LocalStack is running
aws --endpoint-url=http://localhost:4566 sqs list-queues
```

### Issue: "Database connection failed"
**Solution:** Check DATABASE_URL and ensure database is running:
```bash
npm run db:test
```

### Issue: "OpenAI API error"
**Solution:** Verify OPENAI_API_KEY is set correctly:
```bash
echo $OPENAI_API_KEY  # Should show your key
```

### Issue: "No messages processed"
**Solution:** 
1. Check if messages are in queue:
```bash
aws --endpoint-url=http://localhost:4566 sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/incoming-queue \
  --attribute-names ApproximateNumberOfMessages
```

2. Check feature flag:
```bash
echo $ENABLE_MULTI_STAGE_AI
```

3. Check logs for errors

### Issue: "Worker crashes immediately"
**Solution:** Check for missing environment variables:
```bash
# Verify all required vars are set
node -e "require('dotenv').config(); console.log(process.env.INCOMING_QUEUE_URL)"
```

## Development Tips

1. **Use Debug Logging:**
   ```bash
   export LOG_LEVEL=debug
   ```

2. **Watch for Changes (Auto-restart):**
   ```bash
   # Install nodemon
   npm install -g nodemon
   
   # Run with auto-restart
   nodemon --exec "npm run worker:multi-stage"
   ```

3. **Test with Real Data:**
   - Create a test vendor in database
   - Create a test conversation
   - Send messages to that conversation

4. **Monitor Costs:**
   - Check logs for `totalCost` in stage execution
   - Compare with legacy processing costs

## Quick Start Checklist

- [ ] Node.js 18+ installed
- [ ] Database running and accessible
- [ ] `.env` file configured
- [ ] LocalStack running (or AWS SQS configured)
- [ ] Queues created
- [ ] Dependencies installed (`npm install`)
- [ ] Prisma client generated (`npm run prisma:generate`)
- [ ] Code built (`npm run build`)
- [ ] Worker started (`npm run worker:multi-stage`)
- [ ] Test message sent to queue
- [ ] Logs showing processing

## Next Steps

Once running locally:
1. Test with different feature flag settings
2. Monitor stage execution logs
3. Compare costs with legacy processing
4. Test error scenarios
5. Test gradual rollout percentages

For production deployment, see `backend/INTEGRATION_COMPLETE.md`

