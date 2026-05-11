# Enhanced Logging System

## Overview
The enhanced logging system provides comprehensive tracking of all messages, errors, and system operations. This allows for complete visibility into what's happening in the system and helps identify issues quickly.

## Log Files

### 1. General Application Log (`app-YYYY-MM-DD.log`)
- Contains all application logs (info, warn, error)
- Records all operations, database queries, queue operations, etc.
- Rotates daily

### 2. Error Log (`error-YYYY-MM-DD.log`)
- Contains ONLY error-level logs
- Focused view of all errors and failures
- Includes full error context, stack traces, and system information

### 3. Conversation Log (`conversation-YYYY-MM-DD.log`)
- **NEW**: Dedicated log for all message flows
- Tracks inbound and outbound messages
- Includes message content, status, and metadata
- Perfect for analyzing conversation flow

## Log Types

### 1. Conversation Logs
Tracks all WhatsApp messages flowing through the system:

```typescript
logConversation('inbound', {
  conversationId: 'xxx',
  customerPhone: '919790690170',
  vendorId: 'yyy',
  content: 'Hello, I want to place an order',
  messageType: 'text',
  status: 'received',
  metadata: { messageLength: 30, isRelevant: true }
});

logConversation('outbound', {
  conversationId: 'xxx',
  customerPhone: '919790690170',
  vendorId: 'yyy',
  content: 'Hello! I'd be happy to help you with your order.',
  messageType: 'text',
  status: 'sent',
  metadata: { textLength: 50 }
});
```

### 2. Enhanced Error Logging
Captures detailed error information with full context:

```typescript
logErrorWithContext(error, {
  operationId: 'xxx',
  conversationId: 'yyy',
  customerPhone: '919790690170',
  vendorId: 'zzz',
  step: 'whatsapp_send',
  additionalData: { textLength: 100 }
});
```

This logs:
- Error message and stack trace
- Operation ID for tracing
- Conversation and customer context
- System information (Node version, memory usage)
- Additional relevant data

### 3. Specialized Failure Logs
- `logDatabaseFailure()` - Database operation failures
- `logQueueFailure()` - Queue operation failures
- `logWhatsAppFailure()` - WhatsApp API failures

## Analyzing Conversations

### Find All Messages for a Phone Number
```bash
grep "919790690170" backend/logs/conversation-2025-10-25.log
```

### Find All Errors for a Conversation
```bash
grep "conversationId.*cmh3tu6x" backend/logs/error-2025-10-25.log
```

### Track Message Flow
The conversation log shows the complete flow:
1. Inbound message received
2. Database operations
3. AI response generation
4. Queue operation
5. Outbound message sent

## Log Format

### Conversation Log Format
```json
{
  "type": "conversation",
  "prefix": "INCOMING",
  "direction": "inbound",
  "timestamp": "2025-10-25T10:30:00.000Z",
  "conversationId": "cmh3tu6x...",
  "customerPhone": "919790690170",
  "vendorId": "xxx",
  "content": "Hello",
  "messageType": "text",
  "status": "received",
  "metadata": { ... }
}
```

### Error Log Format
```json
{
  "type": "error",
  "timestamp": "2025-10-25T10:30:00.000Z",
  "error": {
    "message": "Connection timeout",
    "stack": "...",
    "name": "Error"
  },
  "context": {
    "operationId": "op_xxx",
    "conversationId": "yyy",
    "customerPhone": "919790690170",
    "step": "whatsapp_send"
  },
  "system": {
    "nodeVersion": "v20.18.1",
    "platform": "win32",
    "memoryUsage": { ... }
  }
}
```

## Debugging Workflow

### 1. Start a Conversation
When you start a conversation, you'll see:
- Inbound message logged in conversation log
- Step-by-step processing in app log
- Any errors in error log

### 2. Find Issues
```bash
# See conversation flow
cat backend/logs/conversation-2025-10-25.log | grep "919790690170"

# See all errors
cat backend/logs/error-2025-10-25.log

# See processing steps
cat backend/logs/app-2025-10-25.log | grep "operationId.*xxx"
```

### 3. Analyze Problem
Each error includes:
- What step failed
- Complete error message and stack trace
- Full context (conversation, customer, vendor)
- System state at time of error

## Example Analysis

### Scenario: Message not being saved
1. Check conversation log: Was inbound message received?
2. Check error log: Any database failures?
3. Check app log: Follow the operation ID through all steps
4. Identify the exact step that failed

### Scenario: WhatsApp message not sent
1. Check conversation log: Was response generated?
2. Check error log: Any WhatsApp API failures?
3. Look for `whatsapp_send` step errors
4. Check if message was queued

## Key Features

✅ **Complete Message Tracking** - Every inbound and outbound message logged  
✅ **Detailed Error Context** - Full system state when errors occur  
✅ **Operation Tracing** - Follow messages through the entire flow  
✅ **Separate Log Files** - Easy to find what you need  
✅ **JSON Format** - Easy to parse and analyze  
✅ **Timestamp Tracking** - Know exactly when things happened  
✅ **System Information** - Memory, platform, Node version included  

## Usage

Once you start a conversation with any phone number:

1. **Inbound messages** are logged to `conversation-*.log` with status "received"
2. **Processing steps** are logged to `app-*.log` with detailed context
3. **Any errors** are logged to `error-*.log` with full debugging info
4. **Outbound messages** are logged to `conversation-*.log` with status "sent" or "failed"

All logs include timestamps, operation IDs, conversation IDs, and relevant metadata for complete traceability.
