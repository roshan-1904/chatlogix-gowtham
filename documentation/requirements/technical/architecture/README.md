# ChatLogix - Queue-Based Architecture Documentation

## 📚 Complete Documentation Index

This folder contains all architecture documentation for ChatLogix version 2.0 (Queue-Based Architecture).

## 📖 Documentation Files

| File | Description |
|------|-------------|
| **[01_overview.md](./01_overview.md)** | Architecture overview, quick start, key metrics |
| **[02_functional_flow.md](./02_functional_flow.md)** | Detailed step-by-step functional flow |
| **[03_component_details.md](./03_component_details.md)** | Component responsibilities and implementation details |
| **[04_deployment.md](./04_deployment.md)** | Deployment instructions and PM2 configuration |
| **[05_sqs_queues.md](./05_sqs_queues.md)** | SQS queue configuration and setup |
| **[06_troubleshooting.md](./06_troubleshooting.md)** | Troubleshooting guide and FAQ |

## 🏗️ Architecture

```
WhatsApp → Webhook → INCOMING_QUEUE → Incoming Worker → RESPONSE_QUEUE → Response Worker → WhatsApp
```

## 🚀 Quick Start

See [01_overview.md](./01_overview.md) for quick start commands.

## 📝 Documentation Status

**Note**: This documentation was reorganized on October 27, 2025. Full content for all files will be available soon.

---

**Version**: 2.0.0  
**Last Updated**: October 27, 2025
