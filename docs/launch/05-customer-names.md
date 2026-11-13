# 5. Customer names

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

Writers and API copies:

- `backend/src/routes/vendors.ts` builds the conversation list with `nameMap.set(row.customerId, row.customerName || null)` and returns that value as `customerName`.
- `dashboardStatsService.ts` copies `customerInsights.customerName` into `recentActivity` and uses `insight || phone` for recent orders. The string `"null"` is kept.
- `toListItem` in `backend/src/routes/customerQueries.ts` returns `customerInsights[0].customerName` unchanged.
- `mapExtractionToUpdates` in `backend/src/conversation/customerInsightsEnrichment.ts` stores `customerInformation.name.trim()` whenever it is a non-empty string.
- `persist.ts` writes `snapshot.customerName` on the `customerInsights` upsert.
- Cart engine `set_field` with `field === 'name'` assigns `customerName = op.value` (`backend/src/conversation/cart/engine.ts`). That value is what `persist.ts` stores.

`prefetch.ts` loads `insights.customerName` into the hot set. The prompt prints `(unknown)` when both insight and pending-order names are missing (`prompts.ts`). That path is separate from the portal string `"null"`.

No single writer is confirmed as the source of the existing `"null"` rows. The display bug does not depend on finding that writer.

## 4. Step-by-step implementation

1. Add a pure helper, duplicated in the vendor app and the backend (the app does not import the backend). Suggested names: `isUnusableCustomerName` and `displayCustomerName(name, phone)`.
   - Unusable: `null`, `undefined`, a blank string, and the case-insensitive tokens `null` and `undefined` after trim.
   - `displayCustomerName` returns the trimmed name when it is usable, otherwise the phone (formatted on the client, raw on the server when the caller formats later).
2. Use the display helper in `ConversationListItem`, `ConversationHeader`, `RecentConversationsWidget`, `Queries.tsx`, `QueryDetail.tsx`, and `CustomerDetailsPanel`. Avatar seeds must use the same usable name or the phone, so a seed is not the letters `null`.
3. Use the helper before writing:
   - `mapExtractionToUpdates`: do not set `customerName` when the extracted name is unusable.
   - `persist.ts` upsert: omit `customerName` on create and update when the snapshot name is unusable. Do not overwrite a good stored name with the token.
   - Cart engine `set_field` name: leave the previous `customerName` in place when `op.value` is unusable.
4. Use the helper on the way out of `vendors.ts` conversation list, `dashboardStatsService.ts` recent conversations and recent orders, and `customerQueries.ts` `toListItem`, so a client that forgets the helper still receives a name or null (and the client then shows the phone). Prefer returning null from the API for an unusable token, and let the client apply the phone fallback. Do not return the string `"null"`.
5. Unit-test the helper: `"null"`, `"NULL"`, `" undefined "`, `""`, and a real name. One backend test that `mapExtractionToUpdates` drops `"null"`. One frontend test that `displayCustomerName("null", "+91…")` returns the phone.
6. Read-only count of `CustomerInsights.customerName` values that the helper rejects, for Ibell only. Do not run an `UPDATE` in the same change. If the count is small, blank those Ibell cells in a reviewed one-off after the owner agrees. If the count is large or the source is unclear, ship the helper and leave the data note on the Phase 2 walk. Do not blank other vendors in a blanket update.

A prompt or pipeline behavior change is not required if the only edit in `persist.ts` is skipping an unusable name. Mention the skip in [`docs/INCOMING_RESPONSE_GENERATOR_FLOW.md`](../INCOMING_RESPONSE_GENERATOR_FLOW.md) only if you change what the customer is called inside the reply. The portal display change does not by itself require that doc.

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

## 7. Dependencies

Task 2, so the walk is on Ibell's data. This task can proceed beside task 4. It does not block task 3's count.
