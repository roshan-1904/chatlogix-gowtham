# Architecture Diagram — WhatsApp Commerce SaaS (Tool‑mapped)

This document is a compact, implementation‑ready architecture diagram with tools mapped to each component. Use this for design reviews, sprint planning, and handing off to engineers.

---

## 1) High‑level ASCII Diagram (read top → bottom)

```
[Customer on WhatsApp]
      │
      ▼  (1) Meta Webhook
[WhatsApp Cloud API]
      │  POST /webhook/whatsapp (X-Hub-Signature-256)
      ▼
[API Gateway / Webhook Receiver - Express/NestJS]
      │  verify sig, idempotency, write message
      ▼
[Ingress Queue] (BullMQ / Redis Streams) <--- dead-letter queue
      │
      ▼ (jobs)
[Perception Workers] -- ASR(Whisper) / OCR(Google Vision or PaddleOCR) / Image CLIP
      │
      ▼
[NLU Service] (LangChain + local intent model/Rasa) -> intent/entities
      │
      ├─> [Deterministic Skills]
      │       - catalog.search (Postgres + pgvector/Pinecone)
      │       - order.lookup (Postgres)
      │       - payment.create (Razorpay/Cashfree)
      │       - shipment.track (Shiprocket/Delhivery)
      │
      └─> [LLM Fallback / RAG] (OpenAI/Claude + Pinecone/pgvector)
                │
                ▼
[Reply Composer] -> choose message type (text, list, product card, button)
      │
      ▼
[Outbound Queue] -> [WhatsApp Cloud API send message]
      ▼
[Message Status Webhook] -> update DB (delivered, read, failed)

Admin & Merchants:
[Next.js Dashboard] <--> [API Gateway] <--> [Services]

Observability: [OpenTelemetry -> Prometheus/Grafana], [Sentry]
Security: KMS / Vault, RLS (Postgres), TLS
```

---

## 2) Component-by-component (tools recommended)

### A. Webhook Receiver / API Gateway

- **Purpose:** Validate signature, dedupe, persist raw event, enqueue for processing.
- **Tools:** Node.js + TypeScript + NestJS/Express. Hosted on Render / Railway (MVP) → EKS/ECS later.
- **Key features:** HMAC verification, idempotency key store (Redis), basic rate limiting, structured logging.

### B. Queue / Job System

- **Purpose:** Decouple ingest from heavy AI tasks; guarantee retries + DLQ.
- **Tools:** Redis + BullMQ (start) → Kafka when scale requires.
- **Pattern:** Outbox pattern for side effects; dead‑letter queue for failed jobs.

### C. Perception Workers

- **ASR (audio):** OpenAI Whisper API (cloud) or self-host whisper.cpp for cost control. Use language detection before choosing model.
- **OCR (images):** Google Vision API (accuracy) or PaddleOCR self-hosted (cost-savvy). Use structured parsers for price/pincode extraction.
- **Image understanding:** CLIP or hosted multimodal embeddings (Cohere Multimodal or OpenAI Vision) for product matching.

### D. NLU Router & Intent Engine

- **Purpose:** Detect intent, extract entities, route to skills.
- **Tools:** Rasa (open-source) or a small fine-tuned classifier + LangChain orchestration for tool calls.
- **Confidence thresholds:** ≥0.80 auto, 0.5–0.8 clarify, <0.5 handoff.

### E. Retrieval (Catalog + KB)

- **Primary storage:** PostgreSQL (product + order tables) with `pgvector` extension for embeddings.
- **Vector DB option:** Pinecone / Qdrant for scalable nearest-neighbour search (good for multi-tenant embedding index).
- **Full‑text:** Postgres full-text + optional OpenSearch for complex catalog filters.

### F. Orchestrator & Deterministic Skills

- **Purpose:** Execute transactional operations (order create, payment link, shipment label, inventory check).
- **Tools:** Microservices in Node or Go, workflow with Temporal.io for long‑running flows (order → payment → shipping).
- **Connectors:** Razorpay / Cashfree for payments; Shiprocket / Delhivery for shipping.

### G. LLM + RAG Layer

- **Purpose:** Handle open-ended queries and generate localized conversational replies using retrieval augmented generation.
- **Tools:** OpenAI GPT (or Anthropic Claude) + LangChain / LlamaIndex; embeddings via OpenAI or BGE/E5; store in pgvector/Pinecone.
- **Guardrails:** Tool use only via orchestrator, PII redaction, prompt templates, and response validators (JSON schema + profanity filter).

### H. Reply Composer & Outbound Sender

- **Purpose:** Build WhatsApp interactive messages (lists, buttons, product templates) and call Meta send API.
- **Tools:** Internal service that maps reply types to WA payloads, respects templates registry.
- **Retry:** Use outbound queue with exponential backoff for transient errors.

### I. Inbox & Human Handoff

- **Tools:** Next.js + React (shadcn/ui + Tailwind). Realtime via WebSockets. Agents can view context, claim conversation, send messages.
- **Features:** Quick replies, canned responses, SLA timers, audit logs.

### J. Observability, Monitoring & Security

- **Tracing & Metrics:** OpenTelemetry → Prometheus + Grafana.
- **Error tracking:** Sentry.
- **Secrets:** AWS KMS + Secrets Manager or Vault.
- **Compliance:** RLS in Postgres, field‑level encryption for PII, data residency in ap‑south‑1.

---

## 3) Webhook API Specification (OpenAPI style, minimal)

**POST /webhook/whatsapp**

- **Headers:** `X-Hub-Signature-256: sha256=...`
- **Body:** Raw Meta payload
- **Responses:** `200 OK` (ack) / `401` (invalid signature) / `202` (accepted if async)

**POST /webhook/status** (WhatsApp message status updates)

- **Body:** WA status payload
- **Action:** Update message status, emit events for billing/analytics

**Security:** Validate `X-Hub-Signature-256`; require IP allowlist for critical endpoints (admin webhooks)

---

## 4) Data Flow Notes & Edge Cases

- **Media retrieval:** Meta provides media URL which expires—worker should download immediately to S3 (MinIO) and persist reference.
- **Dedup:** Use WA `message.id` as idempotency key across systems.
- **Sessioning:** Build conversation sessions with sliding 24‑hour window; reopen on new inbound after 24h.
- **Costs:** ASR/OCR/LLM calls are expensive—use cache (Redis) for recent queries and tiered processing (cheap deterministic first).
- **Privacy:** Mask PII in LLM prompts; store sensitive fields encrypted.

---

## 5) Implementation Roadmap (first 8 weeks) — engineering tickets

1. Week 0–1: Webhook receiver, signature verification, idempotency, message persistence, local docker stack.
2. Week 2: Queue + worker scaffold, simple text reply (keyword rules), dashboard message viewer.
3. Week 3–4: Perception workers (ASR minimal + image download + OCR), NLU classifier stub (intent table), catalog search CRUD.
4. Week 5–6: Order flow + payment link integration (Razorpay sandbox), reply composer for product card.
5. Week 7–8: LLM RAG stub (embed FAQs & catalog), basic handoff inbox, monitoring + SLOs.

---

## 6) Quick Implementation Tips

- Start with **single-tenant dev mindset**, then add RLS for multi‑tenant.
- Prefer existing managed services for LLM/ASR in MVP to reduce ops.
- Build observability from Day 1—trace from webhook → reply to debug mismatches.

---

If you want, I can now:

- Generate **OpenAPI spec** for `/webhook/whatsapp` and `/webhook/status` endpoints, or
- Break Week 0–1 into **detailed developer tickets** (PR templates, tests, acceptance criteria).

Which next step do you want me to do?

