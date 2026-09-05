# Documentation sync index

Tracks which docs were last verified against the codebase. Each synced doc has a `DOC_SYNC` HTML comment at the top with the same commit SHA.

**Current HEAD:** `3367ddaf3bd3f41ef8a613ba04f1bfaec2e061e2` (2026-09-05)

| Document | Scope | Last verified commit | Last verified at |
|---|---|---|---|
| [INCOMING_RESPONSE_GENERATOR_FLOW.md](./INCOMING_RESPONSE_GENERATOR_FLOW.md) | As-implemented pipeline walkthrough (language, LLM-2, contentEn, voice-note ASR) | `3367ddaf3bd3f41ef8a613ba04f1bfaec2e061e2` | 2026-09-05 |
| [CONVERSATION_PROCESSOR_LAMBDA.md](./CONVERSATION_PROCESSOR_LAMBDA.md) | Locked design spec + inline implementation drift notes | `547b10e7701dc88fd4f0463a37c009964dfea7f4` | 2026-09-05 |
| [CONVERSATION_PROCESSOR_IMPLEMENTATION_PLAN.md](./CONVERSATION_PROCESSOR_IMPLEMENTATION_PLAN.md) | Build plan, progress, post-ship enhancements | `547b10e7701dc88fd4f0463a37c009964dfea7f4` | 2026-09-05 |

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
| `docs/troubleshooting/*` | Case studies; not pipeline reference docs |
| `CLAUDE.md` / `.cursorrules` | No materially wrong language restrictions (points to flow doc for pipeline details) |
