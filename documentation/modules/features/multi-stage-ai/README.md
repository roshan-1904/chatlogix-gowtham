# Multi-Stage AI Processing Documentation

> **⚠️ Superseded — not the production pipeline.** The 14-stage `multiStageOrchestrator.ts` pipeline this folder documents is no longer on the production hot path. It was replaced by a ground-up rewrite (`backend/src/conversation/*`: an LLM-1 draft/cart-ops call, a deterministic `CartEngine`, and an optional LLM-2 verifier call) that runs live via the `chatlogix-incoming-response-generator` Lambda. See **`docs/CONVERSATION_PROCESSOR_LAMBDA.md`** for the current design and an explicit "current vs new" comparison. `multiStageOrchestrator.ts` still exists in the codebase, but its only remaining live caller is `catalogImportSandboxService.ts` (catalog import tooling, not live message processing). The documents linked below are kept as historical/reference material describing how the old pipeline worked and was iterated on.

This directory contains all documentation related to the Multi-Stage AI Processing system.

## Overview

The Multi-Stage AI Processing system enables **chat-based order assistance via WhatsApp**, helping customers place orders and get questions answered through natural conversations. This system saves vendors **90% of their time** on repetitive questions by automating customer service.

### Business Value

**Primary Goal:** Enable customers to place orders and get questions answered through natural WhatsApp conversations, saving vendors 90% of time on repetitive questions.

**Key Capabilities:**
- **Order Placement:** Customers can place orders naturally through chat
- **Question Answering:** Automatically answers product inquiries, order status, delivery questions
- **Order Management:** Handles order updates, modifications, and confirmations
- **Time Savings:** Vendors save 90% of time on repetitive questions
- **Natural Experience:** Human-like conversations, not robotic responses

### Technical Implementation

The system uses a sophisticated pipeline that processes WhatsApp messages through multiple stages (0-9), optimizing cost (target: $0.0022 per message) while maintaining high-quality, natural responses. All technical optimizations (cost reduction, quality improvements, validation) are designed to support the primary business goal of automated chat-based order assistance.

## Key Documents

### Implementation & Status
- **[Implementation Status](./implementation-status.md)** - Current implementation status (most up-to-date)
- **[Multi-Stage Status](./MULTI_STAGE_STATUS.md)** - Status tracking document
- **[System Analysis](./MULTI_STAGE_SYSTEM_ANALYSIS.md)** - Detailed system analysis

### Setup & Configuration
- **[Local Setup](./LOCAL_SETUP_MULTI_STAGE.md)** - Local development setup guide
- **[Database Migration](./DATABASE_MIGRATION_MULTI_STAGE.md)** - Database migration guide

### Planning & Optimization
- **[Improvements Plan](./MULTI_STAGE_IMPROVEMENTS_PLAN.md)** - Planned improvements
- **[Quality Focused Model Plan](./QUALITY_FOCUSED_MODEL_PLAN.md)** - Quality optimization plan
- **[Multi-Model Optimization Plan](./MULTI_MODEL_OPTIMIZATION_PLAN.md)** - Multi-model optimization strategy
- **[Implementation Plan (Quality Focused)](./IMPLEMENTATION_PLAN_QUALITY_FOCUSED.md)** - Quality-focused implementation plan
- **[Validation Improvements Plan](./VALIDATION_IMPROVEMENTS_IMPLEMENTATION_PLAN.md)** - Validation enhancements to prevent orders without required fields
- **[Memory Update and Clarification Plan](./MEMORY_UPDATE_AND_CLARIFICATION_PLAN.md)** - Early memory updates and clarification rules enhancement (NEW)

### Troubleshooting
- **[Troubleshooting Guide](./TROUBLESHOOTING_MULTI_STAGE.md)** - Common issues and solutions

## Quick Start

1. Read the [Implementation Status](./implementation-status.md) to understand current state
2. Review [Local Setup](./LOCAL_SETUP_MULTI_STAGE.md) for development setup
3. Check [Troubleshooting Guide](./TROUBLESHOOTING_MULTI_STAGE.md) if you encounter issues

## Related Documentation

- [Architecture Documentation](../../architecture/) - System architecture
- [Development Guides](../../development/) - Development best practices

