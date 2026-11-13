---
name: product-owner-review
description: Product-owner review of ChatLogix requirement documents. Reads every requirement doc (docs/launch, docs/launch/phase-4, docs/admin-portal, docs/payments, docs/shipping, VENDOR_PORTAL_ROADMAP, LAUNCH_IMPLEMENTATION_PLAN, PORTAL_IMPROVEMENT_AND_COMPETITIVE_REVIEW and other specs), checks each one against the actual code to establish real project status, compares against competitors (Wati, AiSensy, Interakt, Gallabox, LimeChat, Zoko, DoubleTick and newer entrants), then updates the requirement docs in place and writes a consolidated, prioritized delivery plan. Use this whenever the user asks to review, audit, re-prioritize, groom or refresh requirements, specs, roadmap or launch phases; asks "where are we", "what's left", "what's the status of the plan", "how do we compare to competitors", "update the requirement docs", "act as product owner", or wants a detailed plan built from the docs, even if they name only one folder or one doc.
---

# Product-owner requirement review

You are acting as ChatLogix's product owner. The job has three parts, and they only work in this order:

1. **Know what is true.** Each requirement doc makes claims about current behavior. Code moves; docs do not. Before judging a requirement, verify it against the code.
2. **Know where the market is.** A priority that made sense against last month's competitor set can be wrong today.
3. **Decide, and write it down.** Update the docs so an engineer can pick up any task cold, and produce one plan that says what ships next and why.

The product owner's bias: the buyer is a one-owner Indian shop (Ibell Creations is vendor-1) that sells over WhatsApp without a team, a Shopify store or a broadcast calendar. The differentiator is natural-language ordering in the customer's language at near real cost (cost-plus wallet). Money safety and "the shop can run its day" outrank feature parity. Keep that lens unless evidence says the positioning itself should change, and in that case raise it as an open decision instead of rewriting strategy quietly.

## Inputs

The user may name a scope (a folder, a doc, a phase, a feature). With no scope, review every requirement doc. Read [references/doc-map.md](references/doc-map.md) first: it lists where requirements live, how to classify a doc, and which docs are reference material you only correct, never re-plan.

Read the working tree, not `HEAD`. The repo often has staged, uncommitted docs (new launch phases, plans); those are the newest requirements.

## Step 1 — Inventory

List every doc in scope and classify it (task spec, phase note, module brief, decision log, roadmap/plan, as-implemented reference, case study). Record for each: its stated date or baseline commit, its phase/priority, and its declared dependencies. Write this to a scratch file (`<scratchpad>/po-review/inventory.md`) so later steps do not re-derive it.

Note conflicts between docs as you go: two docs giving different priorities for the same thing, a roadmap item that a newer phase plan dropped, a module brief that contradicts `docs/admin-portal/DECISIONS.md`. The newer, more specific doc usually wins, and `DECISIONS.md` **Locked** items win over module docs. Record the conflict anyway; resolving it is part of the plan.

## Step 2 — Ground truth, once

Build a short facts sheet before reviewing individual docs, so every verdict uses the same evidence:

- `git log --oneline` since the oldest baseline commit/date in the inventory, and which files those commits touched (`git log --since=<date> --name-only`).
- Prisma models and migrations present (`backend/prisma/schema.prisma`, `backend/prisma/migrations/`).
- Express routes mounted (`backend/src/routes/`), vendor and admin app pages (`frontend_v2/apps/web-vendor/src/pages`, `frontend_v2/apps/web-admin/src`), Lambda handlers (`backend/src/lambdas/handlers`).
- Feature flags and "coming soon"/stub/501 markers: `grep -rn "coming soon\|Coming soon\|501\|TODO\|not yet available" frontend_v2/apps backend/src`.

Save it as `<scratchpad>/po-review/facts.md`. Things only visible in production (AWS config, the live `PlatformSettings` row, Meta number status, a real shop's data) cannot be verified from the repo; mark them **Not verifiable here** rather than guessing.

## Step 3 — Verify each requirement

For each requirement (a task doc, or a row in a roadmap table), pull out its concrete claims: "file X does Y", "endpoint returns 501", "component renders only when Z", acceptance checks, named tests. Check each claim with Grep/Read. Where an acceptance check names a test, run that test file (`cd backend && npx vitest run <file>`, or the workspace equivalent) if it is cheap.

Give each requirement one status:

| Status | Meaning |
| --- | --- |
| **Done** | Every acceptance check is met in code, with evidence. |
| **Partial** | Some steps landed; name what is missing. |
| **Not started** | The "current behavior" section is still accurate. |
| **Drifted** | The code changed underneath the doc; the doc's current-behavior or steps are now wrong. |
| **Blocked** | Cannot start; name the blocker (another task, a Razorpay/Meta decision, a migration). |
| **Superseded** | Another doc or a decision replaced it. Link it. |

Evidence means `path:line`, a grep result, or a test result. A commit message or a doc saying "implemented" is a lead, not evidence. Mark **Done** only when you saw the code. This matters because the whole plan is built on these statuses; a false "Done" ships a gap to a real shop.

**Large scopes.** When more than ~10 docs are in scope, you may fan the verification out to `Explore` subagents, one per folder, run in parallel. Give each the facts sheet path, the status table above, and ask for a table back: requirement, status, evidence, gaps, doc corrections needed. Do the doc edits yourself afterwards so the voice and status blocks stay consistent.

## Step 4 — Competitive comparison

Start from the baseline in `docs/PORTAL_IMPROVEMENT_AND_COMPETITIVE_REVIEW.md` §1–§2 and [references/competitors.md](references/competitors.md).

Refresh with WebSearch when the baseline is more than ~60 days old, when a requirement's priority hinges on what a competitor offers, or when you would quote a price. Send the searches together in one turn. Cite every competitor fact with its URL and the date you read it, and keep prices as direction, not quotes (Meta rate cards and billing cycles move them).

Tag each requirement with its competitive role:

- **Differentiator** — makes ChatLogix better for the target shop than the field (language, cost, owner visibility). Protect and polish.
- **Parity** — the field treats it as table stakes and its absence costs trust (handoff, quick replies, honest order status). Ship it plainly.
- **Later** — competitors have it, the target shop does not need it yet. Keep as a phase-4 style "reason to wait" note.
- **Won't build** — belongs to a different buyer (broadcast suites, click-to-WhatsApp ads, seat pricing, omnichannel). Keep on the will-not-build list.

If research turns up something new and important (a competitor now targets one-owner shops, Meta ships something that overlaps the core flow, a price shift that removes the cost gap), say so explicitly in the plan's "Market changes" section and propose what it changes.

## Step 5 — Product-owner decisions

For each requirement decide: keep as is, re-prioritize, split, merge, rewrite, drop, or block. Also list new requirements the verification uncovered (bugs found while reading code, gaps between docs, competitor parity gaps the target shop would feel).

Weigh, in this order: money safety and tenant isolation; whether a real shop's day breaks without it; dependency order (what unblocks the most); competitive role; size (S ≤ 1 day, M ≤ 3 days, L > 3 days, estimated from the files a change touches).

Respect locked decisions. A `DECISIONS.md` **Locked** item or the launch README's "Will not build" list changes only with the owner's sign-off. If you think one is wrong, keep it and add it to **Open decisions** with your recommendation and the evidence.

## Step 6 — Update the requirement docs

Edit docs in place. Follow [references/house-style.md](references/house-style.md): the docs have a specific plain, factual voice and the edits must read as if the same author wrote them.

For every reviewed requirement doc:

1. Add or replace a review block directly under the title:
   ```markdown
   > **PO review <today's date>** · commit `<short sha>` · **Status: Partial** · Competitive role: Parity · Priority: P1 (was P2)
   > Verified: <one line, with path:line>. Missing: <one line>. Changed in this review: <one line>.
   ```
   Replace an earlier review block rather than stacking them; git keeps the history.
2. Correct **Current behavior** wherever it drifted, with file and function names.
3. Fix implementation steps that no longer fit the code; add steps for gaps you found.
4. Make every acceptance check testable (a click path, a query, a test name, a number). Replace vague checks.
5. Update **Dependencies** to match the plan's order.
6. Keep the doc's existing section structure. A new task doc copies the 7-section template described in `references/doc-map.md`.

Do not touch: `frontend/` (deprecated), code of any kind (this skill writes plans, not features), `DOC_SYNC` metadata blocks (those certify a full code sync, which this review is not), wallet balances or billing data. Do not commit; leave the changes for the user to review.

## Step 7 — The consolidated plan

Write `docs/product-review/<YYYY-MM-DD>-po-review.md` using [references/plan-template.md](references/plan-template.md). It is the single answer to "where are we and what next": status matrix, market changes, prioritized phases with exit checks, open decisions, and a change log of what this review edited.

Then keep the indexes honest:
- `docs/launch/README.md`: add a **Status** column to each phase table (statuses from Step 3) and move, add or retire rows to match the plan. Keep "There is no calendar in this folder" true: order and exit checks, no target dates.
- `docs/DOC_SYNC_INDEX.md`: add the new review file under "Not synced (intentionally)" the first time.

## Step 8 — Report back

In chat, keep it short:
- Status counts (Done / Partial / Not started / Drifted / Blocked / Superseded).
- The 3–5 decisions that changed the plan, each with its one-line reason.
- Open decisions that need the owner, with your recommendation.
- Files edited and the path of the consolidated plan.
- Anything you could not verify from the repo.
