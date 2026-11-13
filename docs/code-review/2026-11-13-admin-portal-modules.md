# Code review — admin portal modules (commit `8f1a0e5`)

**Reviewed:** 2026-11-13 · **Verdict: Not ready** · **Status of findings:** all open

This is a review of commit `8f1a0e5` ("feat(admin-portal): implement vendors, usage, reliability, support, and controls modules", 2 Nov 2026, 54 files), together with the `StaffCase`, `StaffCaseNote` and `StaffAuditLog` schema and migration added later in commit `b26fd17`. The code was read at `7c0606b`; no backend or frontend file has changed since `8f1a0e5`, so the line numbers below match both.

The requirement it was checked against is [admin-portal/DECISIONS.md](../admin-portal/DECISIONS.md) decision 3 (Locked) and the instruction docs for each module under [admin-portal/](../admin-portal/).

Nothing was changed by this review. No migration was run.

## Summary

The commit's own tests pass and every new admin route is behind login and the admin role. Two things stop it from being ready:

1. Support cases and their notes are kept in the API process's memory and are never written to the database. A deploy restarts that process, so every case is lost.
2. The audit log screen reads the same kind of in-memory list. Audit rows are written to the database, but the screen never reads them back.

Both pass their tests because the tests exercise the in-memory stores.

| Question | Result |
| --- | --- |
| 1. Follows the security rules | Issues (2): findings 5, 6 |
| 2. Breaks other functionality | No |
| 3. Meets the requirement | Partly: see [Requirement checks](#requirement-checks) |
| 4. Fields, migration, index, frontend | Issues (3): findings 1, 8, 12 |
| 5. Data leak or data damage | Issues (3): findings 1, 3, 7 |
| 6. Project conventions | Issues (2): findings 11 and the list under [Consider](#consider) |

Severity used below:

| Level | Meaning |
| --- | --- |
| **Blocker** | Loses data, or a core requirement check is not met. Fix before staff rely on the feature. |
| **Should fix** | A real bug or risk with a narrower effect. |
| **Consider** | Cleanup. No user-visible fault today. |

## Blockers

### 1. Support cases and notes are never saved to the database

- **Where:** [adminSupport.ts:17-18](../../backend/src/routes/adminSupport.ts#L17-L18) (the two `Map` stores), [adminSupport.ts:167](../../backend/src/routes/adminSupport.ts#L167) (create), and every other case route in the file.
- **What happens:** `POST /api/admin/support/cases` puts the case in `inMemoryCases`. Notes and status changes update the same maps. [deploy-ec2.sh:50](../../scripts/deployment/deploy-ec2.sh#L50) runs `pm2 restart chatlogix-backend` on every deploy, which empties them. A crash does the same.
- **Why it is worse after the migration:** before the `StaffCase` table exists, `POST /cases` returns 503 `pending_migration` ([adminSupport.ts:142](../../backend/src/routes/adminSupport.ts#L142)). Once migration `20261110200000_staff_case_persistence` is applied, that check passes and the route starts accepting cases that will be lost. Do not apply the migration and tell staff Support works until this is fixed.
- **Requirement:** decision 3 says Phase 1 ships `StaffCase` + notes, kept one year after a case is resolved.
- **Fix:** read and write through `prisma.staffCase` and `prisma.staffCaseNote`. Set `resolvedAt` when status becomes `resolved` and clear it on reopen (the migration has a check constraint that requires this). Remove the in-memory maps; tests can mock Prisma as the other route tests do.
- **Done when:** create a case, add a note, restart the API, and `GET /api/admin/support/cases/:id` still returns the case with its note.

### 2. The audit log screen never reads the audit table

- **Where:** [adminControlsService.ts:286](../../backend/src/services/adminControlsService.ts#L286) (`listAuditLogs`).
- **What happens:** `GET /api/admin/audit` filters `inMemoryAuditLogs` only. `recordStaffAuditLog` does insert rows into `StaffAuditLog` when the table exists, but nothing selects from it. After a restart the Controls audit screen is empty while the table holds the history.
- **Requirement:** decision 3, Controls: "Audit log UI backed by `StaffAuditLog`".
- **Fix:** query `prisma.staffAuditLog` with the existing `vendorId`, `action`, `search`, `page` and `limit` filters, newest first. The three indexes in the migration already cover those filters. Drop the in-memory list.
- **Done when:** credit a wallet, restart the API, and the `wallet_credited` row is still on the audit screen.

## Should fix

### 3. Audit writes for staff actions can fail without anyone knowing

- **Where:** [vendors.ts:312](../../backend/src/routes/vendors.ts#L312) (wallet credit), [:437](../../backend/src/routes/vendors.ts#L437) (feature flags), [:483](../../backend/src/routes/vendors.ts#L483) (markup), [:889](../../backend/src/routes/vendors.ts#L889) (WhatsApp number mapping).
- **What happens:** each call is `void recordStaffAuditLog(...)`. If the insert fails or the table is missing, the route still returns success. A wallet credit keeps its reason and the admin's id in the wallet transaction metadata, so the money trail survives. A markup, feature-flag or number-mapping change has no other durable record.
- **Requirement:** decision 3: these actions "must emit before or with the mutating/read response".
- **Fix:** `await` the write. On `false`, log at error level and, for markup and mapping changes, decide with the owner whether the action should be refused.

### 4. Platform settings changes are not audited

- **Where:** [adminSettings.ts](../../backend/src/routes/adminSettings.ts) has no audit call.
- **Requirement:** decision 3 lists `settings_changed` for `PATCH /api/admin/settings` in the Phase 1 scope. These are the live billing knobs.
- **Fix:** call the shared audit writer from the PATCH handler with the old and new values.

### 5. `POST /api/admin/audit/record` accepts anything

- **Where:** [adminControls.ts:41-68](../../backend/src/routes/adminControls.ts#L41-L68).
- **What happens:** the body's `action`, `summary` and `metadata` are stored without validation (`action as any`). An admin can write an entry that looks like a `wallet_credited` or `markup_changed` record. A summary over 500 characters fails the table's check constraint silently but stays in the in-memory list.
- **Fix:** a Zod schema. Allow only the actions the browser legitimately reports (today that is `shop_viewed`), require `vendorId` to be a string, and cap `summary` and `metadata` size.

### 6. Spreadsheet formula injection in the usage export

- **Where:** [adminUsage.ts:41-48](../../backend/src/routes/adminUsage.ts#L41-L48) and the copy in [usage.ts:153](../../frontend_v2/apps/web-admin/src/lib/usage.ts#L153).
- **What happens:** the export writes each shop's `businessName`, which the shop chooses. `escapeCsvCell` handles quotes and commas but not cells that start with `=`, `+`, `-` or `@`. A shop named `=HYPERLINK("http://…","Refund")` becomes a live formula when staff open the file in Excel.
- **Fix:** prefix such cells with a single quote in both functions, and add a test case for each leading character.

### 7. "Look inside" shows the wrong shop's catalog, and its audit depends on the browser

- **Where:** [ShopInspection.tsx:68](../../frontend_v2/apps/web-admin/src/pages/ShopInspection.tsx#L68), [products.ts:48](../../backend/src/routes/products.ts#L48), [ShopInspection.tsx:51](../../frontend_v2/apps/web-admin/src/pages/ShopInspection.tsx#L51).
- **What happens (catalog):** the page calls `/products?vendorId=<inspected shop>`. The products route uses the caller's own shop first, so an admin whose login also owns a shop sees their own products under another shop's name. Already tracked in [launch/02-catalog-tenant-isolation.md](../launch/02-catalog-tenant-isolation.md); fix it there.
- **What happens (audit):** `shop_viewed` is sent from the browser and not awaited. If that request fails or is skipped, the orders tab has still shown customer names and phone numbers with no server-side record.
- **Fix (audit):** record `shop_viewed` on the server, in the admin branch of the read routes or in a dedicated admin inspection route.

### 8. Cross-shop queries scan whole tables and load every row

- **Usage report:** [adminUsage.ts:207-250](../../backend/src/routes/adminUsage.ts#L207-L250) loads every `CreditUsage` row and every `WalletTransaction` row in the date range (up to 31 days), with the vendor joined, and sums them in JavaScript. The API runs as one process, so a large range blocks other requests while it runs. The indexes on both tables start with `vendorId`, so a date-only filter cannot use them. Fix: `groupBy` on `vendorId` and `source`, or a SQL aggregate.
- **Failed messages:** [adminReliability.ts:42](../../backend/src/routes/adminReliability.ts#L42) and [adminControlsService.ts:90](../../backend/src/services/adminControlsService.ts#L90) filter `Message` by `status` and `timestamp`. Every index on `Message` starts with `conversationId`, so these scan the largest table each time the Reliability page or the alert badge loads. Fix: an index on failed messages by time. `Message` takes writes from the live pipeline, so apply that migration at a quiet hour.

### 9. Alerts hide errors and undercount

- **Where:** [adminControlsService.ts:179](../../backend/src/services/adminControlsService.ts#L179), [:104](../../backend/src/services/adminControlsService.ts#L104), [:64](../../backend/src/services/adminControlsService.ts#L64).
- **What happens:** the `catch` logs and returns whatever was collected, so a database error looks like "no alerts". Failed messages are capped at 500 with no ordering, so on a bad day the per-shop counts are short and a shop can fall under the threshold of 3. The ₹20 threshold is a second copy of `LOW_BALANCE_THRESHOLD_MILLI` in `dashboardStatsService.ts`.
- **Fix:** let the error reach the route (or return an `error` flag the screen shows), count with `groupBy`, and import the constant.

### 10. Conversation view returns the oldest 200 messages

- **Where:** [adminSupport.ts:364-367](../../backend/src/routes/adminSupport.ts#L364-L367).
- **What happens:** `orderBy: timestamp asc, take: 200`. On a thread longer than 200 messages, staff see the start of the conversation and not the recent failure they opened it for.
- **Fix:** take the newest 200 (`desc`), then reverse so the screen still reads oldest to newest as [support/02-instructions.md](../admin-portal/support/02-instructions.md) §4 specifies.

### 11. The admin app fails lint

- **Where:** 68 errors and 19 warnings, all in files from this commit: `support.test.ts` (21), `controls.test.ts` (12), `ShopInspection.tsx` (10), `SupportCaseDetail.tsx` (9), `SupportNewCase.tsx` (9), `SupportConversation.tsx` (3), `controls.ts` (2), `Controls.tsx` (1), `Support.tsx` (1).
- **What it includes:** unhandled promises, unsafe `any` access on error objects, and form labels not tied to a control.
- **Why nobody saw it:** CI builds only. It does not run lint or tests.
- **Fix:** `npm run lint` in `frontend_v2/apps/web-admin` until it is clean.

### 12. Migration and schema disagree on `StaffCase.updatedAt`

- **Where:** [migration.sql:14](../../backend/prisma/migrations/20261110200000_staff_case_persistence/migration.sql#L14) has `DEFAULT CURRENT_TIMESTAMP`; [schema.prisma:1216](../../backend/prisma/schema.prisma#L1216) has `@updatedAt` with no default.
- **What happens:** the next `prisma migrate dev` will generate a migration that drops the default.
- **Fix:** add `@default(now())` to the schema field, or remove the default from the migration if it has not been applied anywhere yet.

## Consider

- Moving a WhatsApp number from one shop to another does not put the previous shop in the audit entry ([vendors.ts:886](../../backend/src/routes/vendors.ts#L886)). Only the log line has it.
- [adminSupportService.ts:105](../../backend/src/services/adminSupportService.ts#L105) and [:151](../../backend/src/services/adminSupportService.ts#L151) use `(prisma as any).$queryRawUnsafe?.` and check that the table exists on every call. The SQL text is constant and the values are passed as parameters, so this is not an injection risk. Now that the Prisma models exist, use them and drop the per-call check.
- Remove the `NODE_ENV !== 'test'` branch ([adminSupport.ts:142](../../backend/src/routes/adminSupport.ts#L142)) and the `…ForTest` seed helpers from production modules.
- [adminUsage.ts](../../backend/src/routes/adminUsage.ts) is 674 lines of date, aggregation and CSV logic in a route file. The project rule is thin routes over services.
- Alert links point at `/vendors` and `/reliability?vendorId=`. [controls/02-instructions.md](../admin-portal/controls/02-instructions.md) specifies `/vendors/:vendorId` and `/reliability?queue=failed&vendorId=`.
- The failed-message preview is 120 characters; [reliability/02-instructions.md](../admin-portal/reliability/02-instructions.md) says 80.
- A request from an origin that is not allowed now throws inside the CORS callback ([index.ts:85](../../backend/src/index.ts#L85)) and is handled as a server error. Before this commit it received a normal response without CORS headers.

## Field trace

No existing column changed. The three tables are new.

| Table or field | Schema | Migration | Index | Backend | API response | Frontend |
| --- | --- | --- | --- | --- | --- | --- |
| `StaffCase` | ok | ok, except the `updatedAt` default (finding 12) | ok: status, vendor, conversation, resolved date | not read or written (finding 1) | served from memory | used by the Support pages |
| `StaffCase.resolvedAt` | ok | ok, with a check tying it to `status` | ok | never set | absent | absent |
| `StaffCaseNote` | ok | ok, cascades from the case | ok | not read or written (finding 1) | served from memory | used |
| `StaffAuditLog` | ok | ok, vendor set to null on delete | ok: date, vendor, action | insert only, never read (finding 2) | served from memory | used by the Controls page |

`StaffCase.vendorId` uses `ON DELETE RESTRICT`, so a shop with a case cannot be deleted. No code deletes `Vendor` rows today.

## Requirement checks

Against [DECISIONS.md](../admin-portal/DECISIONS.md) decisions 2 and 3.

| Check | Result | Evidence |
| --- | --- | --- |
| Cases and notes persisted | Not met | Finding 1 |
| Audit UI backed by `StaffAuditLog` | Not met | Finding 2 |
| `conversation_read` is recorded before messages load, and the read is refused if the insert fails | Met | [adminSupport.ts:348-361](../../backend/src/routes/adminSupport.ts#L348-L361) |
| Wallet credit, markup, feature flag and number mapping are audited with the response | Partly | Called but not awaited (finding 3) |
| `settings_changed` audited | Not met | Finding 4 |
| `case_opened` and `case_status_changed` audited | Partly | Called but not awaited, [adminSupport.ts:171](../../backend/src/routes/adminSupport.ts#L171), [:256](../../backend/src/routes/adminSupport.ts#L256) |
| No message bodies in audit summaries | Met | Summaries carry ids and shop names only |
| A case's conversation must belong to the case's shop | Met | [adminSupport.ts:124-136](../../backend/src/routes/adminSupport.ts#L124-L136) |
| Alerts computed on load, no stored alert table | Met | [adminControlsService.ts:55](../../backend/src/services/adminControlsService.ts#L55) |
| Usage shows platform cost and the amount charged to shops (decision 4) | Met | [adminUsage.ts:427-448](../../backend/src/routes/adminUsage.ts#L427-L448) |
| Wallet-blocked queue backed by stored events (decision 2) | Not built | [adminReliability.ts:154-170](../../backend/src/routes/adminReliability.ts#L154-L170) returns `pending_migration`. Open decision 1 in the [2026-11-13 PO review](../product-review/2026-11-13-po-review.md) |
| Retention purge (audit 1 year, cases 1 year after resolve) | Deferred by the decision | No job exists |

## What was checked and found sound

- All five new routers are mounted with `authenticate` and `requireRole('admin')` ([index.ts:160-164](../../backend/src/index.ts#L160-L164)). The new routes in `vendors.ts` each carry `requireRole('admin')`.
- The WhatsApp number endpoints now return a fixed list of columns ([vendors.ts:797](../../backend/src/routes/vendors.ts#L797)); the old mapping route returned the whole row.
- Moving a number that belongs to another shop needs an explicit `confirmMove` ([vendors.ts:853](../../backend/src/routes/vendors.ts#L853)).
- The wallet credit goes through `creditWalletFromTopUp` with an idempotency key the admin page holds in component state and sends with the request ([VendorDetailPanel.tsx:87](../../frontend_v2/apps/web-admin/src/components/vendors/VendorDetailPanel.tsx#L87)), so the API client's retry on a 5xx or network error cannot credit twice. A reason of 3 to 200 characters is now required; the admin page is the only caller and sends it.
- Money stays in its units: wallet values are read and returned as milli, order revenue as paise, and the admin pages convert to rupees for display.
- The usage report reads `aiCostMilli`, `externalId` and `source: 'trial_grant'` from wallet transaction metadata; `pricingService.ts` and `vendorSignupService.ts` write those exact keys.
- No admin page renders data as HTML.
- `ApiError` in the shared API client extends `Error` and keeps the same message, so callers in the other apps that catch an `Error` and read `.message` behave as before.

## Checks run

| Check | Result |
| --- | --- |
| Backend `npx tsc --noEmit` | Passed |
| Backend tests: `adminControls`, `adminDashboard`, `adminReliability`, `adminSupport`, `adminUsage`, `vendorRecharge`, `vendorWhatsAppAdmin` | 7 files, 90 tests passed |
| `npx prisma validate` | Schema valid |
| `web-admin` `npm run type-check` | Passed |
| `web-admin` `npm run test` | 6 files, 74 tests passed |
| `web-admin` `npm run lint` | Failed: 68 errors, 19 warnings (finding 11) |

Not covered: the admin pages were read for data flow, HTML rendering and money conversion, not line by line for layout or copy. Nothing was tested in a browser.

## Could not verify from the repo

- Whether migration `20261110200000_staff_case_persistence` has been applied to the production database. This decides how urgent finding 1 is.
- Whether the production Postgres version provides `gen_random_uuid()` without an extension. The migration and the audit insert both use it.
- Whether production `CORS_ALLOWED_ORIGINS` lists the vendor, admin and marketing origins.

## Suggested order of work

1. Findings 1 and 2 together: both replace an in-memory store with the Prisma models, and finding 12 should be settled in the same change before the migration is applied anywhere.
2. Findings 3 and 4: make the audit writes reliable and complete, now that the screen will show them.
3. Findings 5 and 6: the two input-handling fixes. Both are small.
4. Finding 8: the usage aggregate first (no migration), then the `Message` index.
5. Findings 9, 10, 11.
6. Finding 7's catalog part ships with launch task 2.
