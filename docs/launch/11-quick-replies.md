# 11. Quick replies

> **PO review 2026-11-13** · commit `8f1a0e5` · **Status: Not started** · Competitive role: Parity · Priority: Phase 3, order 11 (unchanged)
> Verified: the inert "Quick Replies (coming soon)" spans (`frontend_v2/apps/web-vendor/src/components/conversations/CustomerDetailsPanel.tsx:345-352`); no quick-reply model in `backend/prisma/schema.prisma`; no quick-replies file under `backend/src/routes`. Missing: all seven steps. Blocked on task 8 for the composer. Changed in this review: nothing but this block.

## 1. Phase and why this task is in it

Phase 3. Ibell can type a reply without canned lines (task 8). A new shop should not retype "Ready for pickup" and "Out for delivery" on every order. This is a short per-vendor list that fills the composer. It is not a Meta template and not a broadcast.

## 2. Problem and user impact

Pickup and delivery replies are retyped, and the owner is slower than the assistant they are correcting. The panel already says the feature is coming soon, so the owner expects it and gets a dead chip.

## 3. Current behavior

`CustomerDetailsPanel.tsx` renders a section "Quick Replies (coming soon)" with two inert spans: "Thanks for your order!" and "Your order is on the way." They are not buttons and they do not touch `MessageInput`.

The composer exists only when `aiPaused` is true (`Conversations.tsx`, task 8). `MessageInput` is controlled by `value` / `onChange` (`newMessage` in `Conversations.tsx`). Send is `handleSendMessage`, which posts only when the owner submits.

There is no quick-reply model on `Vendor` in `backend/prisma/schema.prisma`. Admin `Templates.tsx` and the vendor Templates nav are a different, undecided surface. Leave them.

`pipeline.ts` does not send these lines. A quick reply is a draft in the browser until the owner presses send. The send path is the existing `POST /conversations/:id/messages`.

## 4. Step-by-step implementation

1. Store a short list per vendor. A small table is the straightforward fit, because nothing on `Vendor` holds this list today. Suggested columns: `id`, `vendorId`, `body` (short text), `sortOrder`. Index `vendorId`. Migration in `backend/prisma/migrations`. This is not the `WalletBlockEvent` migration.
2. `GET /api/quick-replies` uses `req.user.vendorId` only (task 2's rule: a vendor cannot pass another shop's id). When the vendor has zero rows, create the two seeds in that request and return them:
   - Ready for pickup
   - Out for delivery
   Seed once per vendor. A later GET returns the stored rows, including edits. Do not re-seed after the owner deletes a line.
3. `PUT` or `PATCH` for the vendor's own list: replace body and order, cap the count (10 is enough) and the length (a chat line, on the order of 200 characters). No admin cross-tenant write in this task.
4. Replace the coming-soon block in `CustomerDetailsPanel` with buttons. One tap sets the composer text through a callback from `Conversations.tsx` (`setNewMessage`). If the thread is not paused, the tap can call the task 8 "I'll reply" path first so the composer mounts, then fill it. The tap does not call `handleSendMessage`.
5. The owner presses send to post. The existing send handler is unchanged.
6. Leave both Templates pages as they are. One sentence on the vendor Templates placeholder, if that page already says coming soon, can say utility templates are a later release (Phase 4). Do not start a template project.
7. Tests: first GET for a vendor with no rows returns the two seeds and a second GET does not duplicate them. A tap test sets the textarea value and does not call the messages POST. Vendor A's token does not receive vendor B's rows.

No change to `prompts.ts`. No update to the conversation flow doc, because the assistant's reply path is unchanged. The human send is the existing messages route.

## 5. What not to change

- Meta template submit, template approval, and broadcasts.
- The Templates product decisions. Leave those pages.
- Click tracking, campaigns, and the 24-hour window. These lines send only as a normal session message when the owner presses send, which already fails outside the window the way any manual reply does.
- Vendor notes. That block stays "coming soon".
- Wallet balances and the UPI body from task 6.
- Seeding every vendor in a data migration. Seed on first read for that vendor.

## 6. Acceptance checks

- On a paused thread at `http://127.0.0.1:3000`, one tap fills the composer with "Ready for pickup" or "Out for delivery". The message is sent only after the owner presses send.
- A second shop sees its own list. Editing shop A's line does not change shop B.
- Negative case: the tap does not POST `/conversations/:id/messages`.
- Negative case: the admin Templates screen is unchanged and no template is submitted to Meta.

## 7. Dependencies

Task 8, because the composer has to be mountable. Task 2's token rule for the new route. Phase 2 exit, because this is a new-shop convenience and Ibell can type without it.
