# 5. Customer names

> **PO review 2026-11-13** · commit `8f1a0e5` · **Status: Not started** · Competitive role: Parity · Priority: Phase 2, order 5 (unchanged)
> Verified: the `||` display sites (`ConversationHeader.tsx:17`, `ConversationListItem.tsx:145`, `RecentConversationsWidget.tsx:68`, `Queries.tsx:115`, `QueryDetail.tsx:182`); `vendors.ts:645`; `customerInsightsEnrichment.ts:45-46`; `persist.ts:115`, `:123`. Missing: all six steps. Changed in this review: added `RecentOrdersWidget` as a display site, and a read guard in `prefetch.ts`, because the stored string reaches the model as `Name: null`.

## 1. Phase and why this task is in it

Phase 2. Every thread, the dashboard, and the query list are how Ibell tells customers apart. A literal `null` on those surfaces is part of running the shop, so it sits with the other Ibell fixes.

## 2. Problem and user impact

The inbox, the dashboard, and the queries list render the literal `null`. The owner cannot tell customers apart, and a payment or a reply can be aimed at the wrong thread.

## 3. Current behavior

A real `null` or blank already falls through to the phone in several components because they use `||`. The string `"null"` does not, because it is truthy.

Display sites:

- `ConversationListItem.tsx`: `conversation.customerName || formatPhone(...)`.
- `ConversationHeader.tsx`: the same expression.
- `RecentConversationsWidget.tsx`: `conv.customerName || formatPhone(conv.customerPhone)`.
- `Queries.tsx` and `QueryDetail.tsx`: `query.customerName || query.customerPhone`.
- `CustomerDetailsPanel.tsx` prints `customerInsights.customerName` when it is truthy, so the string `"null"` shows in the contact block.
- `RecentOrdersWidget.tsx` prints `order.customerName` exactly as `dashboardStatsService.ts` sends it (`insight || phone`).

Writers and API copies:

- `backend/src/routes/vendors.ts` builds the conversation list with `nameMap.set(row.customerId, row.customerName || null)` and returns that value as `customerName`.
- `dashboardStatsService.ts` copies `customerInsights.customerName` into `recentActivity` and uses `insight || phone` for recent orders. The string `"null"` is kept.
- `toListItem` in `backend/src/routes/customerQueries.ts` returns `customerInsights[0].customerName` unchanged.
- `mapExtractionToUpdates` in `backend/src/conversation/customerInsightsEnrichment.ts` stores `customerInformation.name.trim()` whenever it is a non-empty string.
- `persist.ts` writes `snapshot.customerName` on the `customerInsights` upsert.
- Cart engine `set_field` with `field === 'name'` assigns `customerName = op.value` (`backend/src/conversation/cart/engine.ts`). That value is what `persist.ts` stores.

`prefetch.ts` loads `insights.customerName || undefined` into the hot set. The prompt line is `Name: ${hotSet.insights?.customerName || hotSet.pendingOrder?.customerName || '(unknown)'}` (`prompts.ts`). The string `"null"` is truthy, so the model is told `Name: null` and can greet a customer by that word. The portal bug and the prompt read the same stored value.

No single writer is confirmed as the source of the existing `"null"` rows. The display bug does not depend on finding that writer.

## 4. Step-by-step implementation

1. Add a pure helper, duplicated in the vendor app and the backend (the app does not import the backend). Suggested names: `isUnusableCustomerName` and `displayCustomerName(name, phone)`.
   - Unusable: `null`, `undefined`, a blank string, and the case-insensitive tokens `null` and `undefined` after trim.
   - `displayCustomerName` returns the trimmed name when it is usable, otherwise the phone (formatted on the client, raw on the server when the caller formats later).
2. Use the display helper in `ConversationListItem`, `ConversationHeader`, `RecentConversationsWidget`, `Queries.tsx`, `QueryDetail.tsx`, `CustomerDetailsPanel`, and `RecentOrdersWidget`. Avatar seeds must use the same usable name or the phone, so a seed is not the letters `null`.
3. Use the helper before writing:
   - `mapExtractionToUpdates`: do not set `customerName` when the extracted name is unusable.
   - `persist.ts` upsert: omit `customerName` on create and update when the snapshot name is unusable. Do not overwrite a good stored name with the token.
   - Cart engine `set_field` name: leave the previous `customerName` in place when `op.value` is unusable.
   - `prefetch.ts`: pass the stored name through the helper before it enters the hot set, so a row that already holds `"null"` reaches the prompt as `(unknown)`. The write guards above do not clean rows written before this task. This is the guard for those.
4. Use the helper on the way out of `vendors.ts` conversation list, `dashboardStatsService.ts` recent conversations and recent orders, and `customerQueries.ts` `toListItem`, so a client that forgets the helper still receives a name or null (and the client then shows the phone). Prefer returning null from the API for an unusable token, and let the client apply the phone fallback. Do not return the string `"null"`.
5. Unit-test the helper: `"null"`, `"NULL"`, `" undefined "`, `""`, and a real name. One backend test that `mapExtractionToUpdates` drops `"null"`. One frontend test that `displayCustomerName("null", "+91…")` returns the phone.
6. Read-only count of `CustomerInsights.customerName` values that the helper rejects, for Ibell only. Do not run an `UPDATE` in the same change. If the count is small, blank those Ibell cells in a reviewed one-off after the owner agrees. If the count is large or the source is unclear, ship the helper and leave the data note on the Phase 2 walk. Do not blank other vendors in a blanket update.

A prompt or pipeline behavior change is not required if the only edit in `persist.ts` is skipping an unusable name. Mention the skip in [`docs/INCOMING_RESPONSE_GENERATOR_FLOW.md`](../INCOMING_RESPONSE_GENERATOR_FLOW.md) only if you change what the customer is called inside the reply. The portal display change does not by itself require that doc. The `prefetch.ts` guard changes what the prompt receives for those rows. Record it in the flow doc's prefetch section in the same change.

## 5. What not to change

- Phone numbers, addresses, and other insight fields.
- A real customer whose name is a word other than those two tokens.
- Wallet rows.
- A cross-vendor `UPDATE` of `CustomerInsights`.
- The conversation pipeline's order of steps.

## 6. Acceptance checks

- Ibell's conversation list, a thread header, the dashboard recent list, and the queries list each show a name or a phone. None of them show `null`.
- The helper tests cover `"null"` and a normal name.
- Negative case: a customer named "Nulla" or any other real token outside the two reserved words is still shown. Match the whole trimmed string, not a substring.
- Negative case: vendor A's insights are not rewritten while fixing Ibell's display.
- After the write guard, a new extraction whose name is `"null"` leaves the stored name unchanged.
- A hot-set fixture whose insight name is `"null"` produces `Name: (unknown)` in the `buildSystemPrompt` output.

## 7. Dependencies

Task 2, so the walk is on Ibell's data. This task can proceed beside task 4. It does not block task 3's count.
