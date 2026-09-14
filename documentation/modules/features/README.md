# Feature Documentation

This directory contains detailed documentation for specific features and major improvements in ChatLogix.

## Primary Business Goal

**Chat-Based Order Assistance via WhatsApp**

All features in ChatLogix support the primary goal of enabling customers to place orders and get questions answered through natural WhatsApp conversations, saving vendors **90% of their time** on repetitive questions.

## Features

### [Multi-Stage AI Processing](./multi-stage-ai/)
Documentation for the multi-stage AI processing pipeline, including:
- Implementation status and progress
- Architecture and design decisions
- Troubleshooting guides
- Optimization plans

### [Intent Classification](./intent-classification/)
Documentation for the intent classification system built into the OLD multi-stage pipeline (`intentClassificationService.ts` / `multiStageOrchestrator.ts`), including:
- Intent expansion implementation guides
- GAP4 improvement documentation
- Test cases and verification checklists
- Flow diagrams and explanations

**Note (2026-09-02):** This pipeline is no longer wired to live WhatsApp traffic — production runs `backend/src/conversation/*` (LLM-1 + `CartEngine` + optional LLM-2), where intent is a lightweight telemetry field rather than a dedicated 17-intent classification stage. The old pipeline still runs only via the catalog-import sandbox test-message path. See `docs/CONVERSATION_PROCESSOR_LAMBDA.md`.

### [Product Matching](./product-matching/)
Documentation for product matching and validation system, including:
- Complete solution documentation
- Product source strategies
- Validation rules and fixes

### [Catalog enhancer](./catalog-enhancer/)
Vendor portal “Enhance with AI” for product descriptions and FAQ answers. Authoritative spec: `docs/VENDOR_CATALOG_ENHANCER.md`.

### [Customer Queries](./customer-queries/)
Proposed knowledge inbox: unanswered product/policy questions from WhatsApp → vendor list → English FAQ or catalog variants. Order-status queries never defer. Authoritative spec: `docs/CUSTOMER_QUERIES.md`.

### [Order Delivery Settings](./order-delivery/)
Documentation for order delivery and preparation settings, including:
- Configuration guide for vendors
- API documentation
- Order flow with delivery date
- Migration guide from legacy system

## Related Documentation

- [Architecture Documentation](../architecture/) - System architecture and design
- [Development Guides](../development/) - Development best practices
- [Status Documents](../status/) - Implementation status and progress tracking

