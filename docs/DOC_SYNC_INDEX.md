# Documentation sync index

Tracks which docs were last verified against the codebase. Each synced doc has a `DOC_SYNC` HTML comment at the top with the same commit SHA.

**Current HEAD:** `d16210b3664a8211a9dd31421c8dceadf0ee4def` (2026-09-11)

| Document | Scope | Last verified commit | Last verified at |
|---|---|---|---|
| [INCOMING_RESPONSE_GENERATOR_FLOW.md](./INCOMING_RESPONSE_GENERATOR_FLOW.md) | As-implemented pipeline walkthrough (language, LLM-2, contentEn, voice-note ASR, compact-catalog paise heal, catalog baseQty pack pricing) | `d16210b3664a8211a9dd31421c8dceadf0ee4def` | 2026-09-11 |
| [CONVERSATION_PROCESSOR_LAMBDA.md](./CONVERSATION_PROCESSOR_LAMBDA.md) | Locked design spec + inline implementation drift notes | `547b10e7701dc88fd4f0463a37c009964dfea7f4` | 2026-09-05 |
| [CONVERSATION_PROCESSOR_IMPLEMENTATION_PLAN.md](./CONVERSATION_PROCESSOR_IMPLEMENTATION_PLAN.md) | Build plan, progress, post-ship enhancements (PgBouncer Lambda cutover done 2026-09-11) | `d16210b3664a8211a9dd31421c8dceadf0ee4def` | 2026-09-11 |

## How to update

When you change `backend/src/conversation/` behavior documented in the files above:

1. Update the relevant doc(s) to match the code.
2. Run `git rev-parse HEAD` and set `last_verified_commit` in each touched doc's `DOC_SYNC` block.
3. Set `last_verified_at` to today's date.
4. Update this index table to match.

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
| `CLAUDE.md` / `.cursorrules` | No materially wrong language restrictions (points to flow doc for pipeline details) |
