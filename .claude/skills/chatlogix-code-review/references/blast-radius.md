# What a change can break, and the project's conventions

`CLAUDE.md` is the source for architecture and deployed settings. This file turns it into review questions. If the two disagree, trust `CLAUDE.md` and the code.

## Part 1 — Blast radius

### Code that runs in more than one place

A change tested on one path runs on all of them.

| File | Also runs in |
| --- | --- |
| `backend/src/services/webhookEventProcessor.ts` (`processWebhookEventBatch`) | `chatlogix-webhook-handler` Lambda **and** the Express `/webhook` route. Production traffic uses the Lambda. |
| `backend/src/conversation/*` (`pipeline.ts` and friends) | `chatlogix-incoming-response-generator` Lambda **and** the local `conversationWorker.ts`. |
| `backend/src/services/mediaFetchProcessor.ts` (`processJob`) | `chatlogix-media-fetcher` Lambda **and** `workers/mediaWorker.ts`. |
| `backend/src/workers/responseProcessor.ts` | `chatlogix-whatsapp-response-dispatcher` Lambda. |
| `backend/prisma/schema.prisma` | The Express API and all five Lambdas, deployed separately. |
| `backend/src/services/platformSettingsService.ts` | Every billing read, in every process, through memory → Redis → Postgres → env. |
| `backend/src/services/pricing/pricingService.ts` | Every billable action. |
| `backend/src/config/env.ts` | Everything. A new required env var that is not set on a Lambda breaks that Lambda at cold start. |
| `frontend_v2/packages/*` | Every app that imports the package (`web-vendor`, `web-admin`, `web-marketing`, `vendor-mobile`). |

For each changed export: grep its name across `backend/src`, `backend/scripts` and `frontend_v2`, and read every caller. Include `__tests__` (a test that mocks the old shape will keep passing while production breaks).

### Contracts between parts

- **SQS payloads.** The processor accepts `{type:'TextMessage', …}` from the text, audio and image queues. Changing a payload's shape breaks messages already in the queue when the deploy lands, and the Lambdas do not all deploy at the same instant. New fields must be optional for the reader; removed fields need two releases.
- **API response shapes.** A renamed or removed field breaks the web apps silently wherever the response is typed loosely (`any`) on the frontend. Grep the field name in `frontend_v2`.
- **Enums and status strings.** `OrderStatus`, payment status, conversation state. A new value must be handled by every `switch`, filter, badge map and the prompt text that describes statuses to the model.
- **Redis keys.** Changing a key name or the shape of a cached value means old and new code read each other's entries until the TTL passes (`platform:settings` lives 24 hours).
- **WhatsApp message formats.** A changed interactive payload or template must still be accepted by Meta and still be parsed when the customer taps the reply.

### Lambda behavior the diff will not show

- Handlers can run twice for the same message. The audio and image queues into the processor, and the response queue into the dispatcher, use batch size 10 without `ReportBatchItemFailures`: one thrown error redelivers the whole batch. New code in those paths must be idempotent, and on the dispatcher a retry means a duplicate WhatsApp message to a customer.
- A handler must not swallow an error it cannot handle (the message is lost) and must not throw for an error that will never succeed (it retries until the DLQ).
- Each Lambda container has one database connection (`DATABASE_CONNECTION_LIMIT=1`) through PgBouncer. `Promise.all` over several Prisma calls waits on that one connection and can hit the 3-second pool timeout. Interactive transactions held open across an OpenAI or WhatsApp call hold the connection for the whole call.
- The processor's timeout is 300s and the conversation lock TTL is 300s. Work that can outlast the lock lets a second message for the same conversation start.
- A new Lambda handler file is not deployed until its function name is added to `.github/workflows/deploy.yml`.
- Module-level state survives between invocations on a warm container. Per-request data stored at module level leaks between shops.

### Behavior changes hiding in small diffs

- A changed default, a flipped condition, a widened or narrowed `where`.
- An `await` removed or added inside a loop; a `try/catch` that now hides a failure.
- A date computed in server time where the shop's timezone is meant (`Vendor` has a timezone; dashboards and "today" depend on it).
- A change in the order of operations around money, message sending or order creation: what state is left if step two fails?
- Rows written before the change: does new code handle a null where it now expects a value?
- Cost: an extra LLM call, a bigger prompt or a bigger model moves the per-message cost. The target is under $0.0022 per AI message; say so if the change adds a call or grows the prompt.

## Part 2 — Conventions

### Backend

- **Routes are thin.** Parsing, the access check and the response live in the route; logic lives in a service under `backend/src/services/`. One responsibility per service file.
- **Validation is Zod.** Errors are `CustomError` / the `create…Error` helpers, and async handlers are wrapped with `asyncHandlerWithContext` so failures reach the error handler.
- **Logging is Pino** via `backend/src/logger.ts`. No new `console.log`.
- **ESM.** Relative imports end in `.js` even though the source is `.ts`. A missing extension compiles in some setups and fails at runtime.
- **Money.** Wallet/billing in millirupees (`…Milli`), orders/products/revenue in paise, converted only through `utils/money.ts`. One rounding step, after markup. Only `pricingService.ts` writes `Vendor.walletBalanceMilli`. No flat per-message credit cost and no plan quota: every charge is real cost plus markup.
- **Settings.** Billing knobs come from `PlatformSettings`, not env. Per-vendor behavior comes from the `Vendor` row.
- **Prisma.** Use the shared client from `backend/src/db/prisma.ts`. Select only needed columns on hot paths. Use a transaction when two writes must both happen. No N+1 loops over a list where one query with `in` would do.
- **Languages.** Customer-facing text must work in Tamil, Hindi and English. A hard-coded English reply to a customer is a finding.
- **Order numbers** use the vendor's prefix. Do not print row ids to customers or shop owners.
- **External calls** (OpenAI, WhatsApp, Razorpay, S3) have a timeout and a decided failure behavior. Check what the customer sees when the call fails.
- **No dead code or leftovers.** Commented-out blocks, debug logs, `TODO` without an owner, `.only` on tests, unused exports and files.

### Tests

- Backend tests are Vitest, in `__tests__` folders beside the code. Web apps use `vitest run` per workspace.
- CI on a pull request only builds. Nothing runs the tests or the linter automatically, so a change to money, tenant scoping, auth or the conversation pipeline without a test has no safety net at all.
- A good test for this codebase states the business rule in its name and includes the negative case (the other vendor is refused, the second charge is a no-op).
- Tests must not need the shared database or a real external service.

### Frontend (`frontend_v2`)

- Only `frontend_v2/`. Never `frontend/`.
- Shared code goes in `packages/` when two apps need it; otherwise keep it in the app.
- API calls go through the app's existing API layer and `packages/api-client`, not a new ad-hoc `fetch`.
- Loading, empty and error states exist for anything that fetches. The buyer is a one-owner shop on a phone: check the layout at phone width when a page changes.
- Lint runs with `--max-warnings 0`; `npm run type-check` must pass.
- Screens show rupees, dates in the shop's timezone, and plain words. No raw ids, enum names or milli/paise numbers.

### Docs that move with code

| If the change touches | Update in the same change |
| --- | --- |
| The conversation pipeline flow | `docs/INCOMING_RESPONSE_GENERATOR_FLOW.md` |
| Billing, pricing, wallet | `docs/BILLING_AND_PRICING.md` |
| A launch task's behavior | That task doc under `docs/launch/` and the status in `docs/launch/README.md` |
| Lambda list, triggers, queues, deploy | `backend/src/lambdas/README.md` and `CLAUDE.md` |
| A new env var | `.env.example` and the deployment notes |
| An API route already in the spec | `backend/src/docs/openapi.ts` |

A missing doc update is "Should fix", not a Blocker, except the pipeline flow doc, which `CLAUDE.md` requires.
