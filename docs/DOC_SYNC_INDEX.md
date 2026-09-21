# Documentation sync index

Tracks which docs were last verified against the codebase. Each synced doc has a `DOC_SYNC` HTML comment at the top with the same commit SHA.

**Current HEAD:** `c947e6580ce5f7ecc502147f0aeb06a92e6479e1` (2026-09-22)

| Document | Scope | Last verified commit | Last verified at |
|---|---|---|---|
| [CONVERSATION_CATALOG_CONTEXT_SLICING.md](./CONVERSATION_CATALOG_CONTEXT_SLICING.md) | **Implemented** catalog slice + **gpt-5.6-luna** (slicing flag off until rollout) | `b54bbdcc56cda764213d334c9e39dfb5f410ae69` | 2026-09-20 |
| [INCOMING_RESPONSE_GENERATOR_FLOW.md](./INCOMING_RESPONSE_GENERATOR_FLOW.md) | As-implemented pipeline; live-cart cancel outcome; already-cancelled reply; set_field place-vs-update close | `c947e6580ce5f7ecc502147f0aeb06a92e6479e1` | 2026-09-22 |
| [BILLING_AND_PRICING.md](./BILLING_AND_PRICING.md) | Wallet unit, charge formula, markup, charge sources, trial grant, **OpenAI model rates** (`gpt-5.6-luna` code default) | `b54bbdcc56cda764213d334c9e39dfb5f410ae69` | 2026-09-20 |
| [CONVERSATION_PROCESSOR_LAMBDA.md](./CONVERSATION_PROCESSOR_LAMBDA.md) | Locked design spec + drift notes (Q10 luna default in code; billing → `BILLING_AND_PRICING.md` §2) | `547b10e7701dc88fd4f0463a37c009964dfea7f4` | 2026-09-20 |
| [CONVERSATION_PROCESSOR_IMPLEMENTATION_PLAN.md](./CONVERSATION_PROCESSOR_IMPLEMENTATION_PLAN.md) | Build plan, progress (§15 catalog slicing done; flag off until rollout) | `b54bbdcc56cda764213d334c9e39dfb5f410ae69` | 2026-09-20 |

## How to update

When you change `backend/src/conversation/` behavior documented in the files above:

1. Update the relevant doc(s) to match the code.
2. Run `git rev-parse HEAD` and set `last_verified_commit` in each touched doc's `DOC_SYNC` block.
3. Set `last_verified_at` to today's date.
4. Update this index table to match.

The same applies to `BILLING_AND_PRICING.md` when you change `backend/src/services/pricing/`, `backend/src/utils/money.ts`, the wallet schema, or a `ChargeSource`. Other docs should **link** to it rather than restate the formula — if you find a restated formula elsewhere, replace it with a link.

## Not synced (intentionally)

| Document | Why |
|---|---|
| `docs/CONVERSATION_WORKER_GAPS.md` | Migration/gap writeup; no language/LLM-2/contentEn claims to reconcile |
| `docs/LAMBDA_MIGRATION_PLAN.md` | Infrastructure plan, not pipeline logic |
| `docs/API_LAMBDA_CLOUDFRONT_MIGRATION_PLAN.md` | Dashboard API + SPA hosting plan; not pipeline logic |
| `docs/API_LAMBDA_CLOUDFRONT_IMPLEMENTATION.md` | Step-by-step runbook for the plan above |
| `docs/DEPLOYMENT.md` | Deploy topology only |
| `docs/LOAD_TESTING.md` | Test methodology and harness; cites pipeline facts but does not document pipeline behavior |
| `docs/troubleshooting/*` | Case studies; not pipeline reference docs |
| `docs/VENDOR_CATALOG_ENHANCER.md` | Vendor portal “Enhance with AI” design spec; implementation tracked in spec §22. Daily spend cap repointed at `PlatformSettings` 2026-09-16 |
| `docs/CUSTOMER_QUERIES.md` | Customer Queries v1 spec (implemented); see feature README for status |
| `docs/CUSTOMER_QUERY_QUOTED_REPLIES.md` | v1.1 implemented: WhatsApp quoted vendor replies + fallback prefix |
| `docs/VENDOR_PORTAL_ROADMAP.md` | Vendor portal P0–P3 completion plan; frontend/API scope, not pipeline logic. P0.1/P3 reconciled against the shipped `/wallet` page 2026-09-16; top-up limits repointed at `PlatformSettings` the same day |
| `docs/PRODUCT_MEDIA.md` | Product media spec (`vendor/{id}/conversations/` + `vendor/{id}/catalog/` keys, WhatsApp send). Vendor upload UI not implemented; the **outbound send + billing path is** (§14 reconciled 2026-09-16, platform fees repointed at `PlatformSettings`) |
| `CLAUDE.md` / `.cursorrules` | No materially wrong language restrictions (points to flow doc for pipeline details). Billing conventions corrected 2026-09-16; both now point at `BILLING_AND_PRICING.md`. `CLAUDE.md` also carries the "all migrations applied" + `PlatformSettings` read-path notes (2026-09-16 evening) |
