# AWS Lambda Deployment for ChatLogix

This directory contains the AWS Lambda deployment infrastructure for ChatLogix, providing serverless alternatives to the standalone worker processes.

## 📁 Directory Structure

```
src/lambdas/
├── handlers/           # Lambda function handlers
│   ├── webhookHandler.ts            # API Gateway webhook handler → chatlogix-webhook-handler
│   ├── conversationProcessor.ts     # Re-exports src/conversation/handler.ts → chatlogix-incoming-response-generator
│   ├── responseProcessor.ts         # SQS-triggered WhatsApp sender → chatlogix-whatsapp-response-dispatcher
│   ├── orderRecovery.ts             # EventBridge-scheduled sweep → chatlogix-order-recovery
│   ├── debitReconciliationSweep.ts  # EventBridge-scheduled sweep (not yet deployed as its own function — see docs/CONVERSATION_PROCESSOR_LAMBDA.md §19.1)
│   ├── fxRateRefresh.ts             # Optional EventBridge USD/INR refresh. Not one of the 5 hardcoded deploy.yml names. Suggested rule: cron(30 18 * * ? *) UTC = 00:00 IST. The PM2 API process already runs the same refresh from index.ts.
│   └── multiStageProcessor.ts       # Old 14-stage pipeline. No longer wired to any live function's text trigger; kept only in case audio/image ever needs it again.
├── services/           # Lambda-specific services
│   ├── lambdaDeploymentService.ts    # Core deployment service
│   └── lambdaConfigurationService.ts # Configuration management
└── utils/              # Deployment utilities
    └── lambdaDeploymentManager.ts    # High-level deployment manager
```

**Note:** `npm run deploy:lambda` (below) is a second deployment path that exists in this repo but is **not** what actually deploys to production — the real pipelines (`.github/workflows/deploy.yml`, `bitbucket-pipelines.yml`) call `aws lambda update-function-code` directly against 5 hardcoded function names. `lambdaConfigurationService.ts` is kept in sync with those 5 names so this script doesn't create divergent/duplicate functions if someone runs it, but treat the CI pipelines as the source of truth for what's actually live.

## 🚀 Complete Deployment Guide

### 📋 Prerequisites

#### 1. AWS Account Setup

**Create AWS Account and Configure Credentials:**
```bash
# Install AWS CLI (if not already installed)
# Windows: Download from https://aws.amazon.com/cli/
# macOS: brew install awscli
# Linux: sudo apt-get install awscli

# Configure AWS credentials
aws configure
# Enter your:
# - AWS Access Key ID
# - AWS Secret Access Key  
# - Default region (e.g., us-east-1)
# - Default output format (json)

# Verify configuration
aws sts get-caller-identity
```

**Alternative: Environment Variables**
```bash
# Set AWS credentials as environment variables
export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
export AWS_REGION=us-east-1
export AWS_SESSION_TOKEN=optional_session_token
```

#### 2. Required AWS Services Setup

**Create S3 Bucket for Deployment Packages:**
```bash
# Create bucket (replace with your preferred name)
aws s3 mb s3://us-east-1-chatlogix-lambda-deployments-prod

# Verify bucket creation
aws s3 ls s3://us-east-1-chatlogix-lambda-deployments-prod
```

**Create SQS Queues (if not already created):**
```bash
# Create response queue
aws sqs create-queue --queue-name chatlogix-response-queue-prod

# Create text processing queue
aws sqs create-queue --queue-name chatlogix-text-queue-prod

# Create audio processing queue
aws sqs create-queue --queue-name chatlogix-audio-queue-prod

# Create image processing queue
aws sqs create-queue --queue-name chatlogix-image-queue-prod

# Get queue URLs
aws sqs get-queue-url --queue-name chatlogix-response-queue-prod
aws sqs get-queue-url --queue-name chatlogix-text-queue-prod
aws sqs get-queue-url --queue-name chatlogix-audio-queue-prod
aws sqs get-queue-url --queue-name chatlogix-image-queue-prod
```

#### 3. Environment Variables Setup

**Create .env file in backend directory:**
```bash
# Database Configuration
DATABASE_URL=postgresql://username:password@host:5432/database

# Redis Configuration (required by chatlogix-incoming-response-generator's
# conversation lock, which fails closed -- see backend/src/conversation/lock.ts)
REDIS_URL=redis://host:6379

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key

# WhatsApp Configuration
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token

# SQS Queue URLs
RESPONSE_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/account/chatlogix-response-queue-prod
TEXT_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/account/chatlogix-text-queue-prod
AUDIO_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/account/chatlogix-audio-queue-prod
IMAGE_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/account/chatlogix-image-queue-prod

# Application Configuration
NODE_ENV=production
LOG_LEVEL=info
```

**Set Environment Variables (Alternative):**
```bash
# Export all required variables
export DATABASE_URL="postgresql://username:password@host:5432/database"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your_access_key"
export AWS_SECRET_ACCESS_KEY="your_secret_key"
export OPENAI_API_KEY="sk-your-openai-api-key"
export WHATSAPP_ACCESS_TOKEN="your_whatsapp_access_token"
export WHATSAPP_PHONE_NUMBER_ID="your_phone_number_id"
export WHATSAPP_WEBHOOK_VERIFY_TOKEN="your_webhook_verify_token"
export RESPONSE_QUEUE_URL="https://sqs.us-east-1.amazonaws.com/account/chatlogix-response-queue-prod"
export TEXT_QUEUE_URL="https://sqs.us-east-1.amazonaws.com/account/chatlogix-text-queue-prod"
export AUDIO_QUEUE_URL="https://sqs.us-east-1.amazonaws.com/account/chatlogix-audio-queue-prod"
export IMAGE_QUEUE_URL="https://sqs.us-east-1.amazonaws.com/account/chatlogix-image-queue-prod"
export NODE_ENV="production"
export LOG_LEVEL="info"
```

### 🛠️ Installation & Build

#### 1. Install Dependencies
```bash
# Navigate to backend directory
cd backend

# Install all dependencies
npm install

# Generate Prisma client
npm run prisma:generate
```

#### 2. Build Project
```bash
# Build TypeScript to JavaScript
npm run build

# Verify build output
ls -la dist/
```

### 🚀 Deployment Commands

#### Deploy All Functions (Production)
```bash
# Deploy all Lambda functions to production
npm run deploy:lambda

# This will:
# 1. Create deployment packages for each function
# 2. Upload packages to S3
# 3. Create/update Lambda functions
# 4. Configure IAM roles and permissions
# 5. Set environment variables
```

#### Deploy to Staging Environment
```bash
# Deploy to staging environment
npm run deploy:lambda:staging

# This uses NODE_ENV=staging and creates staging-specific resources
```

#### Deploy Specific Functions Only
```bash
# Deploy only response processor and webhook handler
npm run deploy:lambda -- --functions "response-processor,webhook-handler"

# Deploy only text processor
npm run deploy:lambda -- --functions "text-processor"

# Deploy multiple specific functions
npm run deploy:lambda -- --functions "response-processor,text-processor,webhook-handler"
```

#### Custom Deployment Options
```bash
# Deploy with custom S3 bucket
npm run deploy:lambda -- --s3-bucket "my-custom-deployment-bucket"

# Deploy to different region
npm run deploy:lambda -- --region "us-west-2"

# Deploy without creating IAM roles (if roles already exist)
npm run deploy:lambda -- --no-create-role

# Deploy without updating function code (config only)
npm run deploy:lambda -- --no-update-code

# Deploy without updating configuration (code only)
npm run deploy:lambda -- --no-update-config
```

### 📊 Management Commands

#### List All Deployed Functions
```bash
# List all Lambda functions in your AWS account
npm run lambda:list

# Output example:
# 📋 Listing Lambda functions...
# 
# Found 6 Lambda function(s):
# 
# 📦 chatlogix-response-processor
#    Runtime: nodejs18.x
#    Handler: dist/lambdas/handlers/responseProcessor.handler
#    Memory: 512 MB
#    Timeout: 60 seconds
#    Last Modified: 10/25/2025, 9:15:30 AM
#    State: Active
```

#### Get Function Details
```bash
# Get detailed information about a specific function
npm run deploy:lambda -- --details chatlogix-response-processor

# Output includes:
# - Function configuration
# - Environment variables
# - IAM role information
# - CloudWatch log groups
# - Recent invocations
```

#### Help and Options
```bash
# Show help and all available options
npm run deploy:lambda -- --help

# Available options:
# -e, --environment <env>     Deployment environment (default: production)
# -r, --region <region>       AWS region (default: us-east-1)
# -f, --functions <list>      Comma-separated list of function names
# -b, --s3-bucket <bucket>    S3 bucket for deployment packages
# --create-role               Create IAM role if it doesn't exist
# --no-create-role            Don't create IAM role
# --update-code               Update function code (default: true)
# --no-update-code            Don't update function code
# --update-config             Update function configuration
# --no-update-config          Don't update function configuration
# -l, --list                  List all deployed Lambda functions
# -d, --details <name>        Get details of a specific function
# -h, --help                  Show help message
```

### 🔧 Step-by-Step Deployment Process

#### 1. Pre-Deployment Checklist
```bash
# Verify AWS credentials
aws sts get-caller-identity

# Check S3 bucket exists
aws s3 ls s3://us-east-1-chatlogix-lambda-deployments-prod

# Verify environment variables
echo $DATABASE_URL
echo $OPENAI_API_KEY
echo $WHATSAPP_ACCESS_TOKEN

# Check SQS queues exist
aws sqs get-queue-url --queue-name chatlogix-response-queue-prod
```

#### 2. Build and Deploy
```bash
# Clean previous builds
rm -rf dist/

# Build project
npm run build

# Verify build output
ls -la dist/lambdas/

# Deploy functions
npm run deploy:lambda
```

#### 3. Post-Deployment Verification
```bash
# List deployed functions
npm run lambda:list

# Test function (optional)
aws lambda invoke --function-name chatlogix-response-processor response.json

# Check CloudWatch logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/chatlogix"
```

### 🔄 CI/CD Integration

#### GitHub Actions Workflow
Create `.github/workflows/deploy-lambda.yml`:
```yaml
name: Deploy Lambda Functions

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
        
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
          
      - name: Install dependencies
        run: |
          cd backend
          npm ci
          
      - name: Generate Prisma client
        run: |
          cd backend
          npm run prisma:generate
          
      - name: Build project
        run: |
          cd backend
          npm run build
          
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
          
      - name: Deploy Lambda functions
        run: |
          cd backend
          npm run deploy:lambda
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          WHATSAPP_ACCESS_TOKEN: ${{ secrets.WHATSAPP_ACCESS_TOKEN }}
          WHATSAPP_PHONE_NUMBER_ID: ${{ secrets.WHATSAPP_PHONE_NUMBER_ID }}
          WHATSAPP_WEBHOOK_VERIFY_TOKEN: ${{ secrets.WHATSAPP_WEBHOOK_VERIFY_TOKEN }}
          RESPONSE_QUEUE_URL: ${{ secrets.RESPONSE_QUEUE_URL }}
          TEXT_QUEUE_URL: ${{ secrets.TEXT_QUEUE_URL }}
          AUDIO_QUEUE_URL: ${{ secrets.AUDIO_QUEUE_URL }}
          IMAGE_QUEUE_URL: ${{ secrets.IMAGE_QUEUE_URL }}
          MEDIA_FETCH_QUEUE_URL: ${{ secrets.MEDIA_FETCH_QUEUE_URL }}
```

#### Required GitHub Secrets
Add these secrets to your GitHub repository:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `DATABASE_URL`
- `REDIS_URL`
- `OPENAI_API_KEY`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `RESPONSE_QUEUE_URL`
- `TEXT_QUEUE_URL`
- `AUDIO_QUEUE_URL`
- `IMAGE_QUEUE_URL`
- `MEDIA_FETCH_QUEUE_URL`

### 🚨 Troubleshooting Deployment

#### Common Issues and Solutions

**1. AWS Credentials Not Found**
```bash
# Error: AWS credentials not configured
# Solution: Configure AWS credentials
aws configure
# OR set environment variables
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
```

**2. S3 Bucket Does Not Exist**
```bash
# Error: S3 bucket not found
# Solution: Create S3 bucket
aws s3 mb s3://us-east-1-chatlogix-lambda-deployments-prod
```

**3. Permission Denied**
```bash
# Error: Access denied
# Solution: Check IAM permissions
aws iam list-attached-user-policies --user-name your-username

# Required permissions:
# - lambda:CreateFunction
# - lambda:UpdateFunctionCode
# - lambda:UpdateFunctionConfiguration
# - iam:CreateRole
# - iam:AttachRolePolicy
# - s3:PutObject
# - s3:GetObject
```

**4. Function Already Exists**
```bash
# Error: Function already exists
# Solution: Use update mode (default behavior)
# The deployment script automatically updates existing functions
```

**5. Environment Variables Missing**
```bash
# Error: Required environment variable not set
# Solution: Set all required environment variables
export DATABASE_URL="postgresql://..."
export OPENAI_API_KEY="sk-..."
# ... (all other required variables)
```

**6. Unzipped package exceeds 250 MB**
```
InvalidParameterValueException: Unzipped size must be smaller than 262144000 bytes
```
AWS rejects the zip even if the compressed file is well under 50/250 MB. The GitHub/Bitbucket deploy jobs run `backend/scripts/package-lambda.sh`, which drops Prisma's engine cache, extra query engines, and packages the Lambda handlers never import. Do not `zip dist node_modules prisma package.json` raw.

**7. Build Failures**
```bash
# Error: TypeScript compilation failed
# Solution: Fix TypeScript errors
npm run build

# Check for missing dependencies
npm install

# Regenerate Prisma client
npm run prisma:generate
```

#### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=debug

# Run deployment with verbose output
npm run deploy:lambda -- --verbose
```

#### Manual Verification
```bash
# Check AWS Lambda console
aws lambda list-functions

# Check S3 bucket contents
aws s3 ls s3://us-east-1-chatlogix-lambda-deployments-prod/functions/

# Check IAM roles
aws iam list-roles --query 'Roles[?contains(RoleName, `chatlogix`)]'

# Check CloudWatch logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/chatlogix"
```

## 📋 Available Lambda Functions

These are the 5 functions that actually exist in AWS today (account `987272474004`, `ap-south-1`):

| Function Name | Description | Trigger | Memory | Timeout |
|---------------|-------------|---------|--------|---------|
| `chatlogix-webhook-handler` | Receives the WhatsApp webhook, enqueues text messages to `chatlogix-text-queue-prod` | API Gateway (`weeju313k2` HTTP API) | 512MB | 30s |
| `chatlogix-incoming-response-generator` | Consumes `chatlogix-text-queue-prod`, generates the AI reply, publishes to `chatlogix-response-queue-prod` | SQS (text queue only) | 1536MB | 60s |
| `chatlogix-whatsapp-response-dispatcher` | Consumes `chatlogix-response-queue-prod`, sends the WhatsApp message | SQS | 512MB | 60s |
| `chatlogix-order-recovery` | Scans recent pending/confirmed orders for discrepancies and retries recovery | EventBridge schedule (verify a rule actually targets this function — none was found as of 2026-09-01) | 512MB | 300s |
| `chatlogix-media-fetcher` | **Not functional.** Its configured handler (`mediaFetcher.handler`) doesn't exist in this repo — every invocation fails. The webhook Lambda also doesn't currently route audio/image messages anywhere, so the whole audio/image path is a known gap, deliberately deferred (see docs/CONVERSATION_PROCESSOR_LAMBDA.md, which is text-only by design). | SQS (audio/image queues) | 1024MB | 120s |

**History:** this used to be 3 functions (`chatlogix-response-processor`, `chatlogix-webhook-handler`, `chatlogix-multi-stage-processor`) running the old 14-stage pipeline for everything. They were renamed/repurposed to the 5 above as part of adopting the new conversation-processor pipeline (docs/CONVERSATION_PROCESSOR_LAMBDA.md); `chatlogix-incoming-response-generator` is the old `chatlogix-multi-stage-processor` with its handler swapped from `multiStageProcessor.handler` to `conversationProcessor.handler` and its trigger narrowed to text-only (Q5 in that spec). `multiStageProcessor.ts` is kept in the codebase but is not wired to any live trigger.

## 🔧 Configuration

### Environment-Specific Configuration

The deployment system automatically configures functions based on environment:

- **Production**: `NODE_ENV=production`
- **Staging**: `NODE_ENV=staging`
- **Development**: `NODE_ENV=development`

### Custom Configuration

You can customize function configurations by modifying `lambdaConfigurationService.ts`:

```typescript
{
  name: 'chatlogix-response-processor',
  handler: 'dist/lambdas/handlers/responseProcessor.handler',
  runtime: 'nodejs18.x',
  timeout: 60,        // seconds
  memorySize: 512,   // MB
  description: 'Processes response messages from SQS queue',
  environment: { /* environment variables */ },
  sourcePath: 'src/lambdas/handlers/responseProcessor.ts',
  dependencies: ['@aws-sdk/client-sqs']
}
```

## 🛠️ Development

### Creating New Lambda Functions

1. **Create Handler**: Add a new handler in `src/lambdas/handlers/`
   ```typescript
   import type { SQSHandler } from 'aws-lambda';
   
   export const handler: SQSHandler = async (event) => {
     // Your Lambda logic here
   };
   ```

2. **Add Configuration**: Update `lambdaConfigurationService.ts` with your function definition

3. **Deploy**: Use the deployment script to deploy your new function

### Local Testing

Lambda functions can be tested locally using the AWS SAM CLI or by importing the handler directly:

```typescript
import { handler } from './src/lambdas/handlers/responseProcessor.js';

// Test with mock SQS event
const mockEvent = {
  Records: [{
    messageId: 'test-message-id',
    body: JSON.stringify({ to: '+1234567890', text: 'Hello' })
  }]
};

await handler(mockEvent, {} as any, () => {});
```

## 📊 Monitoring

### CloudWatch Logs

Each Lambda function automatically logs to CloudWatch with structured logging:

- **Operation tracking**: Each request gets a unique operation ID
- **Step-by-step logging**: Detailed step tracking within operations
- **Error handling**: Comprehensive error logging with context
- **Performance metrics**: Timing and resource usage information

### CloudWatch Metrics

Monitor these key metrics:

- **Invocations**: Number of function invocations
- **Duration**: Function execution time
- **Errors**: Number of failed invocations
- **Throttles**: Number of throttled invocations
- **Concurrent Executions**: Current concurrent executions

## 🔒 Security

### IAM Roles

Each Lambda function gets an execution role with minimal required permissions:

- **Basic Execution**: CloudWatch Logs access
- **SQS Access**: Read/write access to configured queues
- **Database Access**: Connection to PostgreSQL database
- **External APIs**: Access to OpenAI and WhatsApp APIs

### Environment Variables

Sensitive data is stored as environment variables:

- Database credentials
- API keys
- Queue URLs
- Configuration secrets

## 🚨 Troubleshooting

### Common Issues

1. **Deployment Failures**
   ```bash
   # Check AWS credentials
   aws sts get-caller-identity
   
   # Verify S3 bucket exists
   aws s3 ls s3://your-bucket-name
   ```

2. **Function Timeouts**
   - Increase timeout in configuration
   - Optimize function code
   - Check external API response times

3. **Memory Issues**
   - Increase memory allocation
   - Optimize code for memory usage
   - Check for memory leaks

4. **Database Connection Issues**
   - Verify DATABASE_URL is correct
   - Check VPC configuration if using private subnets
   - Ensure security groups allow database access

### Debugging

Enable debug logging by setting:
```bash
export LOG_LEVEL=debug
```

View CloudWatch logs:
```bash
aws logs tail /aws/lambda/chatlogix-response-processor --follow
```

## 📈 Performance Optimization

### Cold Start Optimization

- Use provisioned concurrency for critical functions
- Minimize dependencies
- Use connection pooling for database connections

### Memory Optimization

- Start with minimal memory and increase as needed
- Monitor actual memory usage in CloudWatch
- Optimize code to reduce memory footprint

### Cost Optimization

- Use appropriate memory sizes
- Implement efficient error handling to avoid retries
- Monitor and optimize function duration

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy Lambda Functions
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - run: npm run deploy:lambda
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### 📊 Monitoring and Maintenance

#### CloudWatch Monitoring
```bash
# View function logs
aws logs tail /aws/lambda/chatlogix-response-processor --follow

# Get function metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=chatlogix-response-processor \
  --start-time 2025-10-25T00:00:00Z \
  --end-time 2025-10-25T23:59:59Z \
  --period 3600 \
  --statistics Average,Maximum

# Check function errors
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=chatlogix-response-processor \
  --start-time 2025-10-25T00:00:00Z \
  --end-time 2025-10-25T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

#### Function Updates and Rollbacks
```bash
# Update function code only
npm run deploy:lambda -- --no-update-config

# Update configuration only
npm run deploy:lambda -- --no-update-code

# Rollback to previous version (manual process)
# 1. Download previous deployment package from S3
aws s3 cp s3://bucket/functions/function-name/previous-version.zip ./rollback.zip

# 2. Update function code with previous version
aws lambda update-function-code \
  --function-name chatlogix-response-processor \
  --zip-file fileb://rollback.zip
```

#### Performance Optimization
```bash
# Monitor memory usage
aws lambda get-function --function-name chatlogix-response-processor

# Update memory allocation
aws lambda update-function-configuration \
  --function-name chatlogix-response-processor \
  --memory-size 1024

# Update timeout
aws lambda update-function-configuration \
  --function-name chatlogix-response-processor \
  --timeout 120
```

#### Cost Monitoring
```bash
# Get function pricing information
aws pricing get-products \
  --service-code AmazonLambda \
  --filters 'Type=TERM_MATCH,Field=location,Value=US East (N. Virginia)'

# Monitor function invocations
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=chatlogix-response-processor \
  --start-time 2025-10-25T00:00:00Z \
  --end-time 2025-10-25T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

### 🔧 Advanced Configuration

#### Custom IAM Policies
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:us-east-1:account:chatlogix-*-queue-prod"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:us-east-1:account:*"
    }
  ]
}
```

#### VPC Configuration (if needed)
```bash
# Configure function for VPC access
aws lambda update-function-configuration \
  --function-name chatlogix-response-processor \
  --vpc-config SubnetIds=subnet-12345,SecurityGroupIds=sg-12345
```

#### Dead Letter Queue Setup
```bash
# Create DLQ
aws sqs create-queue --queue-name chatlogix-dlq-prod

# Configure function with DLQ
aws lambda update-function-configuration \
  --function-name chatlogix-response-processor \
  --dead-letter-config TargetArn=arn:aws:sqs:us-east-1:account:chatlogix-dlq-prod
```

### 🚀 Production Deployment Checklist

#### Pre-Deployment
- [ ] AWS credentials configured
- [ ] S3 bucket exists and accessible
- [ ] SQS queues created and accessible
- [ ] Environment variables set
- [ ] Database connection tested
- [ ] External API keys validated
- [ ] Build process successful
- [ ] Tests passing

#### Deployment
- [ ] Deploy to staging first
- [ ] Test staging functions
- [ ] Deploy to production
- [ ] Verify all functions deployed
- [ ] Test production functions
- [ ] Monitor CloudWatch logs
- [ ] Check error rates

#### Post-Deployment
- [ ] Set up CloudWatch alarms
- [ ] Configure monitoring dashboards
- [ ] Test webhook endpoints
- [ ] Verify SQS message processing
- [ ] Monitor function performance
- [ ] Check cost implications
- [ ] Document any issues

### 📚 Additional Resources

- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/)
- [Serverless Framework](https://www.serverless.com/)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [CloudWatch Logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/)
- [SQS Documentation](https://docs.aws.amazon.com/sqs/)
