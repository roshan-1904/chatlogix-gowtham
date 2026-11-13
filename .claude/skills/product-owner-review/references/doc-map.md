# Where ChatLogix requirements live

Paths are relative to the repo root. Re-list the folders at run time (`ls docs docs/*/`); new folders appear often and are usually the newest requirements.

## Requirement docs (review and re-plan these)

| Path | Kind | Notes |
| --- | --- | --- |
| `docs/launch/README.md` | Phase plan (index) | Source of truth for launch order. Phases 1–4, "Will not build", "Later cleanup". No calendar. |
| `docs/launch/NN-*.md` | Task specs | One task each, 7-section template (below). |
| `docs/launch/phase-4/*.md` | Phase notes | Deliberately short "reasons to wait". Not build specs. Keep them short unless the plan promotes one into a task. |
| `docs/LAUNCH_IMPLEMENTATION_PLAN.md` | Older date-based plan | Superseded in ordering by `docs/launch/`. Check for items the launch folder dropped. |
| `docs/PORTAL_IMPROVEMENT_AND_COMPETITIVE_REVIEW.md` | Product decisions + competitor baseline | P0–P3 lists, feature inventory, "what to add / what to leave". |
| `docs/VENDOR_PORTAL_ROADMAP.md` | Roadmap P0–P3 | Has an audit baseline commit; compare against git log since then. |
| `docs/admin-portal/README.md`, `<module>/01-overview.md`, `02-instructions.md`, `03-ui-plan.md` | Module briefs | Modules: vendors, usage-and-billing, reliability, support, controls. |
| `docs/admin-portal/DECISIONS.md` | Decision log | **Locked / Open / Deferred.** Locked wins over module docs. Do not reopen Locked items yourself. |
| `docs/payments/01..05` | Payments spec + implementation plan | D1/D2/D3 compliance decisions in `05-compliance-and-risk.md`; live Razorpay Route waits on D1. |
| `docs/shipping/README.md`, `02-implementation-plan.md` | Shipping spec + 10-phase plan | Not implemented as of 2026-10-21. |
| `docs/CUSTOMER_QUERIES.md`, `CUSTOMER_QUERY_QUOTED_REPLIES.md`, `PRODUCT_MEDIA.md`, `VENDOR_CATALOG_ENHANCER.md` | Feature specs | Partly implemented; each says which parts. |
| `docs/LAMBDA_MIGRATION_PLAN.md`, `API_LAMBDA_CLOUDFRONT_MIGRATION_PLAN.md` | Infra plans | Review for status; competitive role is usually n/a. |
| `docs/onboarding/` | (may be empty) | Check at run time. |

## Reference docs (correct facts only, do not re-plan)

`docs/INCOMING_RESPONSE_GENERATOR_FLOW.md`, `BILLING_AND_PRICING.md`, `CONVERSATION_PROCESSOR_LAMBDA.md`, `CONVERSATION_PROCESSOR_IMPLEMENTATION_PLAN.md`, `CONVERSATION_CATALOG_CONTEXT_SLICING.md`, `CONVERSATION_WORKER_GAPS.md`, `DEPLOYMENT.md`, `LOAD_TESTING.md`, `TURN_AUDIT_LOGGING.md`, `docs/troubleshooting/*`.

Use them as evidence about how the system works. If one is wrong, note it in the plan's change log; leave `DOC_SYNC` blocks alone.

Ignore `documentation/` (a separate stale tree) and anything under `frontend/` (deprecated).

## Task spec template (docs/launch)

Every launch task doc uses these sections. New task docs copy it.

1. **Phase and why this task is in it** — which phase, and the shop-level reason it sits there.
2. **Problem and user impact** — what the owner or customer experiences today. Concrete (named shop, order number, amount).
3. **Current behavior** — what the code does now, with file paths, components, functions, endpoints.
4. **Step-by-step implementation** — numbered steps an engineer can follow; includes tests to add.
5. **What not to change** — scope fences and neighbouring tasks.
6. **Acceptance checks** — click paths, queries, numbers, negative cases.
7. **Dependencies** — other tasks, decisions, files shared with parallel tasks.

## Phase-note template (docs/launch/phase-4)

`# Title` · "Phase 4. This note is a reason to wait. It is not a build spec." · **Why it waits** · **What must be true first** · **What not to build meanwhile**.

## Project facts that constrain every plan

- Money: wallet amounts are millirupees; order/product amounts are paise. `backend/src/services/pricing/pricingService.ts` `chargeVendor` is the only writer of `Vendor.walletBalanceMilli`. Plans never edit balances, `CreditUsage` or `WalletTransaction` rows.
- Production message path is the five Lambdas, not PM2 workers (see `CLAUDE.md`).
- Vendor portal runs at `http://127.0.0.1:3000`; admin at `localhost:3001`.
- Admin access comes from `AUTH_ADMIN_PHONES` (`backend/src/services/roleService.ts`), not the `Admin` table.
