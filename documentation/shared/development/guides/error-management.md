# Enhanced Error Management System

## Overview

The ChatLogix project now includes a comprehensive error management system that provides detailed error logging, monitoring, and reporting capabilities. This system ensures that all API errors are logged with extensive context for debugging and monitoring purposes.

## Key Features

### 1. Structured Error Types
- **VALIDATION**: Input validation errors (400)
- **AUTHENTICATION**: Authentication failures (401)
- **AUTHORIZATION**: Permission/authorization errors (403)
- **NOT_FOUND**: Resource not found errors (404)
- **DATABASE**: Database operation errors (500)
- **EXTERNAL_API**: External service API errors (502)
- **BUSINESS_LOGIC**: Business rule violations (400)
- **SYSTEM**: General system errors (500)
- **NETWORK**: Network connectivity issues (503)
- **TIMEOUT**: Request timeout errors (408)
- **RATE_LIMIT**: Rate limiting errors (429)
- **PAYMENT**: Payment processing errors (402)
- **WHATSAPP**: WhatsApp API errors (500)
- **AI_SERVICE**: AI service errors (500)
- **QUEUE**: Message queue errors (500)

### 2. Error Severity Levels
- **LOW**: Minor issues that don't affect core functionality
- **MEDIUM**: Issues that may affect user experience
- **HIGH**: Issues that significantly impact functionality
- **CRITICAL**: Issues that cause system failures

### 3. Enhanced Error Context
Every error is logged with comprehensive context including:
- Request details (method, URL, headers, body)
- User context (vendor ID, user ID)
- Error metadata (type, severity, code)
- Technical details (stack trace, memory usage)
- Business context (operation, data)
- Timing information

## Implementation

### Error Handler Middleware

The enhanced error handler (`enhancedGlobalErrorHandler`) automatically:
- Records errors for monitoring
- Logs detailed error context
- Provides structured error responses
- Sanitizes sensitive data

```typescript
import { enhancedGlobalErrorHandler } from './middleware/errorHandler.js';

app.use(enhancedGlobalErrorHandler);
```

### Async Route Handlers

Use `asyncHandlerWithContext` for automatic error handling with context:

```typescript
import { asyncHandlerWithContext, ErrorType, ErrorSeverity } from './middleware/errorHandler.js';

ordersRouter.get('/', asyncHandlerWithContext(async (req, res) => {
  // Your route logic here
}, ErrorType.BUSINESS_LOGIC, ErrorSeverity.LOW));
```

### Service Error Logging

Use the `ServiceErrorLogger` for comprehensive service-level error logging:

```typescript
import { createServiceErrorLogger } from '../utils/errorLogger.js';

const errorLogger = createServiceErrorLogger('OrderService', 'createOrder', {
  vendorId,
  customerId
});

try {
  // Service logic
} catch (error) {
  throw errorLogger.logDatabaseError(error, 'create', 'order', orderData);
}
```

## Error Monitoring

### Error Statistics Endpoint

Access error statistics via `/api/errors/stats`:

```json
{
  "totalErrors": 45,
  "errorCounts": {
    "VALIDATION_400": 12,
    "DATABASE_500": 8,
    "EXTERNAL_API_502": 5
  },
  "errorTypes": {
    "VALIDATION": 12,
    "DATABASE": 8,
    "EXTERNAL_API": 5
  },
  "severityCounts": {
    "LOW": 15,
    "MEDIUM": 20,
    "HIGH": 8,
    "CRITICAL": 2
  },
  "vendorErrorCounts": {
    "vendor123": 25,
    "vendor456": 20
  },
  "currentErrorRate": 3,
  "timestamp": "2025-01-20T10:30:00.000Z",
  "uptime": 3600,
  "memoryUsage": {
    "rss": 45678912,
    "heapTotal": 20971520,
    "heapUsed": 15728640,
    "external": 1234567
  }
}
```

### Error Rate Monitoring

The system automatically monitors error rates and alerts when they exceed thresholds:
- Default: 100 errors per 5-minute window
- Configurable thresholds
- Automatic alerting for high error rates

## Log Files

### Error Log Structure

Errors are logged to separate files with detailed context:

**File**: `logs/error-YYYY-MM-DD.log`

```json
{
  "level": "ERROR",
  "time": "2025-01-20T10:30:00.000Z",
  "operationId": "req_1737369000000_abc123",
  "errorType": "DATABASE",
  "severity": "HIGH",
  "errorCode": "DATABASE_500",
  "statusCode": 500,
  "isOperational": true,
  "vendorId": "vendor123",
  "userId": "user456",
  "endpoint": "POST /api/orders",
  "userAgent": "Mozilla/5.0...",
  "ip": "192.168.1.100",
  "context": {
    "operation": "create",
    "table": "order",
    "query": "INSERT INTO orders..."
  },
  "stack": "Error: Database connection failed\n    at ...",
  "timestamp": "2025-01-20T10:30:00.000Z",
  "msg": "🚨 API Error: Database connection failed"
}
```

### Application Log Structure

**File**: `logs/app-YYYY-MM-DD.log`

```json
{
  "level": "INFO",
  "time": "2025-01-20T10:30:00.000Z",
  "operationId": "req_1737369000000_abc123",
  "method": "POST",
  "url": "/api/orders",
  "userAgent": "Mozilla/5.0...",
  "ip": "192.168.1.100",
  "timestamp": "2025-01-20T10:30:00.000Z",
  "msg": "📥 Incoming request: POST /api/orders"
}
```

## Error Response Format

API errors return structured responses:

```json
{
  "error": {
    "message": "Vendor ID is required",
    "statusCode": 400,
    "operationId": "req_1737369000000_abc123",
    "timestamp": "2025-01-20T10:30:00.000Z",
    "errorCode": "VALIDATION_400",
    "stack": "Error: Vendor ID is required\n    at ...",
    "context": {
      "field": "vendorId",
      "value": null
    },
    "errorType": "VALIDATION",
    "severity": "LOW"
  }
}
```

## Best Practices

### 1. Use Appropriate Error Types
- Use `VALIDATION` for input validation errors
- Use `DATABASE` for database operation errors
- Use `EXTERNAL_API` for third-party service errors
- Use `BUSINESS_LOGIC` for business rule violations

### 2. Set Appropriate Severity Levels
- Use `LOW` for validation errors
- Use `MEDIUM` for business logic errors
- Use `HIGH` for database and external API errors
- Use `CRITICAL` for system failures

### 3. Provide Rich Context
Always include relevant context in errors:
```typescript
throw createDatabaseError(
  'Failed to create order',
  'create',
  'order',
  { vendorId, customerId, orderData }
);
```

### 4. Use Service Error Loggers
For service-level operations, use the `ServiceErrorLogger`:
```typescript
const errorLogger = createServiceErrorLogger('OrderService', 'createOrder');
// ... service logic
errorLogger.logDatabaseError(error, 'create', 'order', orderData);
```

### 5. Monitor Error Patterns
- Check error statistics regularly
- Monitor error rates for anomalies
- Track vendor-specific error patterns
- Alert on critical errors

## Configuration

### Environment Variables

```bash
# Log level (debug, info, warn, error)
LOG_LEVEL=info

# Node environment
NODE_ENV=production

# Enable detailed error responses in development
NODE_ENV=development
```

### Error Rate Monitoring

Configure error rate thresholds in `ErrorRateMonitor`:
```typescript
private static readonly WINDOW_SIZE = 5 * 60 * 1000; // 5 minutes
private static readonly MAX_ERRORS_PER_WINDOW = 100;
```

## Monitoring and Alerting

### Error Metrics
- Total error count
- Error type distribution
- Severity level distribution
- Vendor-specific error counts
- Current error rate

### Alerting Triggers
- High error rate (>100 errors in 5 minutes)
- Critical errors
- Uncaught exceptions
- Unhandled promise rejections

### Health Check
Monitor system health via `/health` endpoint:
```json
{
  "status": "ok",
  "env": "production",
  "time": "2025-01-20T10:30:00.000Z"
}
```

## Troubleshooting

### Common Error Patterns

1. **Database Errors**: Check connection, query syntax, and data integrity
2. **External API Errors**: Verify service availability and authentication
3. **Validation Errors**: Check input data format and required fields
4. **Business Logic Errors**: Review business rules and constraints

### Debugging Steps

1. Check error logs for detailed context
2. Use operation IDs to trace request flow
3. Monitor error statistics for patterns
4. Check system health and resource usage
5. Verify external service status

### Log Analysis

Use structured logging for easy analysis:
```bash
# Count errors by type
grep '"errorType"' logs/error-*.log | jq '.errorType' | sort | uniq -c

# Find errors for specific vendor
grep '"vendorId":"vendor123"' logs/error-*.log

# Monitor error rate
grep '"level":"ERROR"' logs/error-*.log | wc -l
```

This enhanced error management system provides comprehensive error tracking, detailed logging, and monitoring capabilities to ensure robust error handling throughout the ChatLogix application.
