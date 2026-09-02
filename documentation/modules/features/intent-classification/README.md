# Intent Classification Documentation

> **Architecture note (2026-09-02):** Everything in this directory describes the intent-classification logic that lives in the OLD multi-stage pipeline (`backend/src/services/intentClassificationService.ts` + `multiStageOrchestrator.ts`, 17 intents). That pipeline is **no longer wired to live WhatsApp traffic** — production now runs `backend/src/conversation/*` (LLM-1 + deterministic `CartEngine` + optional LLM-2 verifier), where intent is a lightweight, telemetry-only string returned by LLM-1's single structured-output call, not a dedicated classification stage with a fixed 17-intent taxonomy. The code described here still exists and still runs, but only via the catalog-import sandbox test-message path (`backend/src/services/catalogImportSandboxService.ts`). See `docs/CONVERSATION_PROCESSOR_LAMBDA.md` for the current architecture.

This directory contains all documentation related to the Intent Classification system and GAP4 improvements.

## Overview

The Intent Classification system identifies user intents from WhatsApp messages, enabling context-aware responses. This includes the expansion from 9 to 17 intents and AI-powered memory extraction.

## Key Documents

### GAP4 Documentation (AI-Powered Memory Extraction)
- **[GAP4 Documentation Index](./GAP4_DOCUMENTATION_INDEX.md)** - Complete index of GAP4 documentation
- **[GAP4 Improvement Summary](./GAP4_IMPROVEMENT_SUMMARY.md)** - High-level overview
- **[Implementation Checklist](./IMPLEMENTATION_CHECKLIST_GAP4.md)** - Step-by-step implementation guide
- **[Quick Reference](./QUICK_REFERENCE_GAP4.md)** - Quick reference guide
- **[AI Memory Extraction](./IMPROVEMENT_GAP4_AI_MEMORY_EXTRACTION.md)** - Detailed memory extraction documentation

### Intent Expansion
- **[Intent Classification Expansion](./INTENT_CLASSIFICATION_EXPANSION.md)** - Overview of intent expansion
- **[Implementation Guide](./INTENT_EXPANSION_IMPLEMENTATION_GUIDE.md)** - Complete implementation guide (most comprehensive)
- **[Test Cases](./INTENT_EXPANSION_TEST_CASES.md)** - Test cases for intent expansion
- **[Verification Checklist](./INTENT_EXPANSION_VERIFICATION_CHECKLIST.md)** - Verification checklist

### Intent Identification
- **[Intent Identification Explained](./INTENT_IDENTIFICATION_EXPLAINED.md)** - Detailed explanation of intent identification
- **[Intent Identification Flow](./INTENT_IDENTIFICATION_FLOW.md)** - Flow diagrams and process

## Quick Start

1. **New to Intent Classification?** Start with [Intent Identification Explained](./INTENT_IDENTIFICATION_EXPLAINED.md)
2. **Implementing Intent Expansion?** Follow the [Implementation Guide](./INTENT_EXPANSION_IMPLEMENTATION_GUIDE.md)
3. **Working on GAP4?** Start with [GAP4 Improvement Summary](./GAP4_IMPROVEMENT_SUMMARY.md)

## Related Documentation

- [Multi-Stage AI Processing](../multi-stage-ai/) - How intent classification fits into the pipeline
- [Architecture Documentation](../../architecture/) - System architecture
- [Development Guides](../../development/) - Development best practices

