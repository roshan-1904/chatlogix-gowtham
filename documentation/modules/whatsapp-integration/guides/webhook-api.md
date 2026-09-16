# Cursor AI Input: WhatsApp Webhook API with Vendor Billing

> **Historical note:** this is the original design brief/prompt used to scaffold the webhook API early in the project — not documentation of what was actually built. Several choices below were never adopted (RabbitMQ, LLaMA/Mistral, Tesseract OCR, FastAPI). The real implementation uses OpenAI (GPT-4.1/4.1-mini + Whisper for audio), AWS SQS, and Prisma/PostgreSQL. In production today, incoming WhatsApp messages hit API Gateway → the `chatlogix-webhook-handler` Lambda (not a long-running Express/Fastify webhook process) → SQS → `chatlogix-incoming-response-generator` Lambda → SQS → `chatlogix-whatsapp-response-dispatcher` Lambda. See `backend/src/lambdas/README.md` and `docs/CONVERSATION_WORKER_GAPS.md` for the current architecture and known gaps (the live webhook Lambda currently only handles `text` messages — audio/image/document are not processed as this brief originally intended).

## Objective
Build a **WhatsApp automation webhook API** for small vendors/entrepreneurs in India. The API should:
- Handle **text, audio, image, and document messages**.
- Parse messages using AI (text/audio/image).
- Query the database and reply within **5 seconds** per message, even during peak load (~70 messages/sec).
- Support **vendor subscriptions with preloaded credits**.
- Track **per-message costs and credits** for billing.

---

## Requirements

### 1. Webhook Endpoint
- Expose `/webhook` endpoint to receive messages from **WhatsApp Business API**.
- Immediately respond with **HTTP 200** to prevent retries.
- Log all incoming messages for monitoring.
- Validate **WhatsApp API signatures** for security.

---

### 2. Async Message Processing
- Use **Redis Streams / RabbitMQ** for queuing messages.
- Worker Pools:
  - **Text Workers**: NLP/LLM parsing, DB lookup, AI response.
  - **Audio Workers**: Convert audio → text using Whisper Tiny/Small → process as text.
  - **Image Workers**: OCR (Tesseract or lightweight AI) → extract text/data.
- Responses enqueued in **Response Queue** for sending via WhatsApp API.

---

### 3. Vendor Wallet & Billing

> **Updated 2026-09-16 (millirupee rework).** The monthly-plan-with-preloaded-credits model described in earlier revisions of this doc no longer exists. Authority: [docs/BILLING_AND_PRICING.md](../../../../docs/BILLING_AND_PRICING.md).

- Each vendor has:
  - Vendor ID, Name, Contact Info
  - A single prepaid wallet: `Vendor.walletBalanceMilli`, in **millirupees** (1 rupee = 1000)
  - `Vendor.markupPercent` (default 50), admin-editable
  - `Vendor.subscriptionPlan` — bookkeeping only; it grants no quota
- **Charge logic** — there are no flat per-message-type credits. Every debit goes through `pricingService.chargeVendor`:
  - `ceil((aiCostMilli + whatsappCostMilli + platformFeeMilli) × (1 + markupPercent/100))`
  - `aiCostMilli` is real token cost (plus Whisper, priced per second, for voice notes), so an audio turn is naturally dearer than a text turn without any multiplier
  - `whatsappCostMilli` is **0** today — ChatLogix absorbs Meta conversation fees until the P2h rate card
- Real-time check before processing (`billingService.canProcessMessage`): the wallet must cover a worst-case turn estimate, otherwise the vendor is gated and a template reply is sent.
- Detailed logging per charge on `CreditUsage`: vendor, `source` (e.g. `conversation_turn`, `outbound_media`), AI tokens, cost components, `chargedMilli`, and `externalId` as the idempotency key.

---

### 4. Database & Cache
- **Database**: PostgreSQL/MySQL for vendor, customer, conversation, message, billing data.
- **Cache**: Redis for real-time credit availability and frequent queries (loan balance, EMI dates).
- Index commonly used search fields (vendor ID, customer ID, loan type).

---

### 5. AI Integration
- **Text Parsing & Intent Extraction**: Small LLM (LLaMA/Mistral) for bulk messages.
- **Text Response Generation**: GPT API for complex queries only.
- **Audio STT**: Whisper Tiny/Small (CPU-friendly)
- **Image OCR**: Tesseract / lightweight AI OCR
- Predefined FAQ responses → skip AI for cost savings.

---

### 6. Performance & Scaling
- Handle **70 msg/sec peak** (49 text, 14 audio, 7 image).
- End-to-end SLA: <5 sec per message.
- Horizontal scaling of worker pools per message type.
- Autoscale based on queue length.
- Batch media processing every 2–3 sec to reduce cost.

---

### 7. Billing & Reporting
- Deduct credits in real-time per vendor.
- Track usage per conversation: total messages, credits consumed, SLA metrics.
- Generate **monthly invoices**: subscription fee + extra credits.
- Vendor dashboard with:
  - Remaining credits
  - Messages processed by type
  - Monthly usage summary
  - Billing info & invoices

---

### 8. Security & Best Practices
- Validate WhatsApp request signatures.
- Encrypt sensitive data in transit and at rest.
- Implement rate-limiting to prevent abuse.
- Retry failed messages (exponential backoff).
- Logging and monitoring of message flow, errors, processing time.

---

### 9. Tech Stack Recommendations
- Webhook: Node.js (Express/Fastify) or Python (FastAPI)
- Queue: Redis Streams (primary), RabbitMQ optional
- Database: PostgreSQL/MySQL
- Cache: Redis
- AI Models: LLaMA/Mistral (text), Whisper Tiny (audio), Tesseract (image)
- Cloud Hosting: AWS/GCP/Azure with autoscaling instances
- Containerization: Docker (optional Kubernetes)
- Monitoring: Prometheus + Grafana, Sentry

---

### 10. Output Requirements
- REST API with webhook endpoint handling all message types.
- Modular worker architecture for text/audio/image processing.
- Vendor subscription, preloaded credits, per-message cost tracking integrated.
- Configurable DB, cache, and AI connections via environment variables.
- Automated retry & failure handling.
- Unit & integration tests covering webhook, AI parsing, DB queries, and WhatsApp API responses.

---

### 11. Instructions to Cursor AI
Generate a **production-ready, scalable WhatsApp webhook API** including:
- Vendor subscription and credit system
- Real-time credit deduction per message
- Cost tracking per vendor & conversation
- Async message queue & worker architecture
- AI integration for text, audio, and image
- Database & Redis caching
- Response handling and sending via WhatsApp API
- Scalable for **peak 70 msg/sec** with <5 sec SLA
- Include logging, monitoring, retries, and best practices
