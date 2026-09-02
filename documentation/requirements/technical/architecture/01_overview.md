# Architecture Overview - Queue-Based System

> **⚠️ Superseded (as of 2026-09):** This document describes the PM2 + SQS worker architecture (`incomingMessageWorker.ts`, `responseWorker.ts`) as it stood on 2025-10-27. Those worker files have since been deleted; production WhatsApp message processing now runs on AWS Lambda functions (`chatlogix-webhook-handler`, `chatlogix-incoming-response-generator`, `chatlogix-whatsapp-response-dispatcher`, etc.), not PM2-managed SQS workers. See `backend/src/lambdas/README.md` and `docs/CONVERSATION_PROCESSOR_LAMBDA.md` for the current architecture. The content below is kept for historical reference.

## 🏗️ Current Architecture (as of Oct 2025 — see notice above)

### Queue-Based Processing

```
WhatsApp → Webhook → INCOMING_QUEUE → Incoming Worker → RESPONSE_QUEUE → Response Worker → WhatsApp
            ↓              ↓                              ↓
         Store msg     Process msg                    Send msg
         (fast)        (credits, AI)                  (delivery)
```

### Components

1. **Webhook Handler** - Receives messages, stores, queues
2. **Incoming Message Worker** - Processes messages (credits, AI, storage)
3. **Response Worker** - Sends WhatsApp messages

## Key Benefits

✅ **Fast webhook response** - Returns 200 OK in < 50ms
✅ **Scalable** - Workers can scale independently
✅ **Reliable** - Queue provides retry mechanism
✅ **Lambda-ready** - Workers can be deployed as AWS Lambda functions
✅ **Better monitoring** - Track queue depths and processing times

## Quick Start

```bash
# Build
cd backend && npm run build

# Deploy
pm2 reload ecosystem.config.js

# Monitor
pm2 logs chatlogix-incoming-worker
```

## Key Metrics

- **Webhook response time**: < 100ms
- **Total processing time**: 3-7 seconds
- **Throughput**: Scales with worker instances

## Documentation Index

- **[02_functional_flow.md](./02_functional_flow.md)** - Detailed step-by-step flow
- **[03_component_details.md](./03_component_details.md)** - Component responsibilities
- **[04_deployment.md](./04_deployment.md)** - Deployment instructions
- **[05_sqs_queues.md](./05_sqs_queues.md)** - SQS configuration
- **[06_troubleshootingging.md](./06_troubleshooting.md)** - Troubleshooting guide

---

**Version**: 2.0.0 (Queue-Based Architecture)  
**Last Updated**: October 27, 2025

