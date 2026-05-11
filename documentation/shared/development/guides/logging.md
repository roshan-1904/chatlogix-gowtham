# Logging System Documentation

## Overview

The ChatLogix backend now includes a comprehensive logging system with date-based log files, detailed step tracking, and structured error handling for easy debugging.

## Features

### 📁 Date-Based Log Files
- **Location**: `backend/logs/`
- **Format**: 
  - `app-YYYY-MM-DD.log` - All application logs
  - `error-YYYY-MM-DD.log` - Error logs only
- **Rotation**: New files created daily automatically

### 🔍 Step-by-Step Tracking
Every operation is tracked with:
- **Operation ID**: Unique identifier for each operation
- **Step Counter**: Sequential steps within an operation
- **Timing**: Elapsed time for each step
- **Context**: Relevant data at each step

### 📊 Structured Logging
All logs include:
- **Timestamp**: ISO format with timezone
- **Level**: INFO, WARN, ERROR
- **Operation ID**: Links related log entries
- **Context**: Relevant data and metadata
- **Emojis**: Visual indicators for quick scanning

## Log Levels

### 🚀 START
Operation initiation with context

### 📝 STEP_X
Individual steps within an operation

### ✅ SUCCESS
Successful operation completion

### ⚠️ WARN
Warning conditions

### ❌ ERROR
Error conditions with full context

## Usage Examples

### Basic Step Logger
```typescript
import { StepLogger, createOperationId } from './logger.js';

const operationId = createOperationId('user_registration');
const stepLogger = new StepLogger(operationId, 'User Registration', {
  email: 'user@example.com',
  plan: 'Pro'
});

stepLogger.step('Validating email format');
stepLogger.step('Checking for existing user');
stepLogger.step('Creating user record');
stepLogger.success({ userId: '123', plan: 'Pro' });
```

### Specialized Loggers
```typescript
import { logDbOperation, logWhatsAppOperation, logAIOperation } from './logger.js';

// Database operations
logDbOperation('create', 'vendor', { businessName: 'Test Corp' });

// WhatsApp operations
logWhatsAppOperation('send_text', 'phone_123', '+1234567890', { textLength: 50 });

// AI operations
logAIOperation('classify_intent', 'pricing_query', 150, { messageLength: 25 });
```

## Request/Response Logging

Every HTTP request is automatically logged with:
- **Request details**: Method, URL, User-Agent, IP
- **Response details**: Status code, timing
- **Operation ID**: Links request to processing logs

## Error Handling

### Global Error Handler
- Captures all unhandled errors
- Logs with full context and stack traces
- Returns structured error responses
- Includes operation ID for tracing

### Unhandled Promise Rejections
- Automatically logged with context
- Process exit in production for safety

### Uncaught Exceptions
- Critical error logging
- Process exit to prevent undefined behavior

## Environment Configuration

### Log Level Control
```bash
LOG_LEVEL=debug    # Most verbose
LOG_LEVEL=info     # Default
LOG_LEVEL=warn     # Warnings and errors
LOG_LEVEL=error    # Errors only
```

### Development vs Production
- **Development**: Pretty console output + file logging
- **Production**: File logging only with structured format

## Log File Structure

### Example Log Entry
```json
{
  "level": "INFO",
  "time": "2024-01-15T10:30:45.123Z",
  "operationId": "webhook_event_1705315845123_abc123",
  "step": "STEP_3",
  "stepName": "Processing WhatsApp messages",
  "elapsedMs": 45,
  "data": {
    "messageType": "text",
    "vendorId": "vendor_456",
    "customerPhone": "+1234567890"
  },
  "msg": "📝 Step 3: Processing WhatsApp messages"
}
```

## Debugging Workflow

### 1. Find Operation ID
Search logs for a specific operation:
```bash
grep "operationId.*webhook_event_1705315845123_abc123" logs/app-2024-01-15.log
```

### 2. Trace Steps
Follow the step sequence:
```bash
grep "STEP_" logs/app-2024-01-15.log | grep "webhook_event_1705315845123_abc123"
```

### 3. Check Errors
Look for ERROR level logs:
```bash
grep "ERROR" logs/error-2024-01-15.log
```

### 4. Performance Analysis
Check elapsed times:
```bash
grep "elapsedMs" logs/app-2024-01-15.log | sort -k5 -n
```

## Monitoring and Alerts

### Key Metrics to Monitor
- **Error Rate**: ERROR level logs per minute
- **Response Time**: elapsedMs in request logs
- **Queue Processing**: Worker operation timing
- **Database Operations**: DB operation duration

### Log Rotation
- Files rotate daily at midnight
- Old files can be archived or deleted
- Consider log retention policies

## Best Practices

### 1. Use Descriptive Step Names
```typescript
stepLogger.step('Validating user input');  // ✅ Good
stepLogger.step('Step 1');                 // ❌ Bad
```

### 2. Include Relevant Context
```typescript
stepLogger.step('Processing payment', { 
  amount: 99.99, 
  currency: 'USD',
  paymentMethod: 'card' 
});  // ✅ Good
```

### 3. Handle Errors Gracefully
```typescript
try {
  await riskyOperation();
  stepLogger.success({ result: 'completed' });
} catch (error) {
  stepLogger.error(error, { context: 'additional_info' });
  throw error; // Re-throw if needed
}
```

### 4. Use Appropriate Log Levels
- **INFO**: Normal operations, step tracking
- **WARN**: Recoverable issues, missing optional data
- **ERROR**: Failures, exceptions, critical issues

## Integration with External Tools

### Log Aggregation
- Compatible with ELK Stack (Elasticsearch, Logstash, Kibana)
- Can be integrated with Fluentd, Fluent Bit
- Supports structured JSON format for easy parsing

### Monitoring
- Works with Prometheus, Grafana
- Compatible with DataDog, New Relic
- Supports custom metrics extraction

## Troubleshooting

### Common Issues

#### 1. Log Files Not Created
- Check `logs/` directory permissions
- Verify disk space availability
- Ensure proper file system access

#### 2. Missing Operation IDs
- Check if request logging middleware is properly mounted
- Verify operation ID generation in custom operations

#### 3. Performance Impact
- Adjust log level in production
- Consider async logging for high-volume operations
- Monitor disk I/O for log writes

### Debug Commands
```bash
# Check log file sizes
ls -lh logs/

# Monitor real-time logs
tail -f logs/app-$(date +%Y-%m-%d).log

# Search for specific operations
grep "operationId.*specific_id" logs/app-*.log

# Count errors by type
grep "ERROR" logs/error-*.log | jq '.data.errorType' | sort | uniq -c
```
