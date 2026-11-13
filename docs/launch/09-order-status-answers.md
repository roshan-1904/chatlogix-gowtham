# 9. Order status the assistant can quote

> **PO review 2026-11-13** · commit `8f1a0e5` · **Status: Partial** · Competitive role: Parity · Priority: Phase 2, order 9 (unchanged)
> Verified: the guard and its tests exist. `npx vitest run src/conversation/__tests__/pipeline.test.ts src/conversation/__tests__/customerQuery.test.ts -t "D6|skips sandbox|knowledge_gap: persists"` passed 8 tests on 2026-11-13. Missing: step 1's `finalText` assertions on the test at `pipeline.test.ts:970`, which today asserts only the `orderStatusTurn: true` call and the `CustomerQueryBlockedOrder` count. Not verifiable from the repo: the five open queries. Changed in this review: nothing but this block.

## 1. Phase and why this task is in it

Phase 2. "Where is my order" is a normal Ibell message. The prompt and the guard already intend an answer from the order on file. This task locks that with a regression test. It does not add a status product. Closing the five open queries is the product owner with the shop, the same day the test is green.

## 2. Problem and user impact

On 6 Oct the assistant told a customer it could not see an order that was already in the thread. The customer asks where the order is and gets a deferral. Separately, five queries have been open for weeks. Three are order intents ("place the order", "repeat the cancelled order", "I need them tomorrow"). Those are an order or a human reply, not an FAQ under Other. The query page looks like homework.

Catalog stock strings such as "9999.999 box" and a birthday-cake FAQ are owner data cleanup. They are a manual step in this phase. They are not an engineering project.

## 3. Current behavior

`isOrderStatusTurn` and `shouldRewriteOrderStatusReply` live in `backend/src/conversation/orderStatusGuard.ts`. `looksLikeDeferral` matches "I'll check", "get back", "still checking", and similar lines. `renderOrderStatusReply` quotes the latest history row: order number, `ORDER_STATUS_LABELS` status, and item names with quantities. When history is empty it says it does not see an order on file. The renderer does not include `totalAmount`. That gap is not a new feature. The locked check for this task is the deferral and the query write.

`processMessage` in `backend/src/conversation/pipeline.ts`:

- Computes `orderStatusTurn`.
- Strips `knowledge_gap` and `send_product_media` from `replyOps` on that turn.
- If the draft is a deferral or does not cite an order number, sets `finalText` to `renderOrderStatusReply` and logs `CustomerQueryBlockedOrder`. LLM-2 does not run.
- Handoff still wins (`triggerHandoff` runs first).

`persistKnowledgeGapIfNeeded` in `backend/src/conversation/customerQuery.ts` returns null when `orderStatusTurn` is true, before any `customerQuery` write.

`prompts.ts` already contains: never emit `knowledge_gap` for order status, and never say "I'll check / get back" on those turns.

Tests that already exist:

- `pipeline.test.ts` "D6: 9790690170-style order deferral is rewritten…" asserts `finalText` contains `ORD-IBELL-0042` and `Premium Baking Tin` and does not match `/get back/i`.
- `pipeline.test.ts` "D6: order-status turn does not open a CustomerQuery even when draft is a deferral" mocks `persistKnowledgeGapIfNeeded` and asserts it was called with `orderStatusTurn: true`. It does not assert `finalText`, and the mock does not prove the real function skips the insert.
- `customerQuery.test.ts` "skips sandbox, handoff, and order-status turns" calls the real `persistKnowledgeGapIfNeeded` with `orderStatusTurn: true` and asserts `customerQueryCreate` was not called.

The 6 Oct miss is not treated as fixed until the regression below is the one that runs in CI.

## 4. Step-by-step implementation

1. Extend the pipeline test "D6: order-status turn does not open a CustomerQuery even when draft is a deferral" (history `pendingOrderHistory`, draft "I will check the current status and get back to you", op `knowledge_gap`):
   - `persistTurn` `finalText` contains `ORD-IBELL-0042` and does not match the deferral (`/get back/i` or `/will check/i`).
   - The published reply text is that `finalText`, not the draft.
   - Keep the assertion that `persistKnowledgeGapIfNeeded` is invoked with `orderStatusTurn: true`.
2. Keep the `customerQuery.test.ts` case that `customerQueryCreate` is not called when `orderStatusTurn` is true and the draft is a deferral. That is the "does not persist" half. The pipeline mock cannot prove it alone.
3. If either test fails, fix the guard or the branch in `processMessage`. Do not add an order-status service, a new op, or a new API. `renderOrderStatusReply` is the quote. Adding `totalAmount` (paise, formatted at this call site, not through millirupee helpers) is in scope only as a line inside that existing function when you want the quote to include the total. It is not a separate project. The acceptance below does not require the total.
4. If the fix changes reply text or the branch order, update [`docs/INCOMING_RESPONSE_GENERATOR_FLOW.md`](../INCOMING_RESPONSE_GENERATOR_FLOW.md) (the D6 section and the `DOC_SYNC` comment) and `docs/DOC_SYNC_INDEX.md` in the same change. If the tests pass with no behavior change, leave the flow doc.
5. Product owner, with the shop, in the existing queries UI: close the five open items. Answer, promote a real FAQ, or dismiss. The three order intents become an order action or a human reply (task 8), not a new FAQ. Engineering joins only if a new order-intent still opens a `CustomerQuery` after the test is green.
6. Manual, same week, owner in the product form: correct stock strings such as "9999.999 box", and remove or rewrite the birthday-cake FAQ if the sellable list is brownies, cookies, and a tin. Engineering does not write a stock-display project.

## 5. What not to change

- A new status page, a tracking integration, or a second reply generator.
- Handoff precedence. A complaint still goes to `triggerHandoff` and does not get the order-status rewrite (`pipeline.test.ts` already covers "handoff still wins").
- Hypothetical prep questions with empty history (`HYPOTHETICAL_PREP_PHRASES`). Those stay off the D6 path.
- The five query rows, except the product owner closing them in the UI. No SQL delete.
- Wallet balances and platform fees.
- Catalog stock and FAQ text. Owner data only.

## 6. Acceptance checks

- The extended pipeline test and the `customerQuery` unit test pass. An order-status turn with `pendingOrderHistory` does not insert a `CustomerQuery` and the sent text is not the deferral.
- A fixture "where is my order" reply names the order number and the item names from the row.
- The five queries are no longer open after the product-owner session.
- Negative case: a product question that is a real knowledge gap ("does the tin include dividers") still persists a `CustomerQuery`. The existing pipeline test "knowledge_gap: persists a CustomerQuery" must stay green.
- Negative case: empty order history still answers that nothing is on file and still does not persist a query (the existing "empty order history" pipeline test).

## 7. Dependencies

The test has none. Closing an order-intent query with a human reply uses task 8 if the owner types it. Task 1 applies if anyone sends a live reply while checking the fixture on a production thread. Prefer the unit test over a live send.
