# AI Processing Module

Documentation for AI processing flows, intent handling, and response generation.

> **Status note (2026-09):** The per-intent guides below (`guides/*.md`) document the **old** 14-stage `multiStageOrchestrator.ts` pipeline, which is no longer the live pipeline for WhatsApp messages. Production text messages are now handled by `backend/src/conversation/*` (LLM-1 draft + cart ops → `CartEngine` → optional LLM-2), running as the `chatlogix-incoming-response-generator` Lambda — see `docs/CONVERSATION_PROCESSOR_LAMBDA.md` for the current design and `docs/CONVERSATION_WORKER_GAPS.md` for current known gaps. Each guide file carries its own superseded notice with the same detail. `MULTI_STAGE_WORKER_ANALYSIS.md` in this directory is a dated (2026-04-10) gap analysis of the old pipeline, also now historical.

## 📁 Structure

```
ai-processing/
├── README.md (this file)
└── guides/
    ├── 01_greeting.md
    ├── 02_product_inquiry.md
    ├── 03_order_new.md
    ├── 04_order_update.md
    ├── 05_confirm_order.md
    ├── 06_payment_inquiry.md
    ├── 07_delivery_inquiry.md
    ├── 08_order_status.md
    ├── 09_repeat_order.md
    ├── 10_complaint.md
    ├── 11_refund_request.md
    ├── 12_return_request.md
    ├── 13_cancel_order.md
    ├── 14_account_inquiry.md
    ├── 15_feedback.md
    ├── 16_support.md
    └── 17_other.md
```

## 📚 Documentation

All AI processing flow documentation is in the `guides/` directory. Each file documents how the system handles a specific intent or conversation type.

## 🔗 Related Modules

- **[Multi-Stage AI](../features/multi-stage-ai/)** - Multi-stage AI pipeline system
- **[Intent Classification](../features/intent-classification/)** - Intent detection and classification

