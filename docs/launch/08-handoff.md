# 8. I'll reply

## 1. Phase and why this task is in it

Phase 2. Ibell's owner has to correct a wrong or stuck answer in the thread they already have. The pause control exists. The composer does not appear until the owner finds it. Quick replies are Phase 3 (task 11). This task is the handoff only.

## 2. Problem and user impact

A bad answer stays up until the owner discovers Pause AI. For Ibell that is a blocked human reply. The thread does not say the composer is hidden.

## 3. Current behavior

`frontend_v2/apps/web-vendor/src/pages/Conversations.tsx` mounts `MessageInput` only inside `{aiPaused && (...)}`. `handleToggleAIPause` flips `aiPaused`, updates the selected conversation, and `PUT /conversations/:id/ai-pause` with `{ paused }`. On failure it rolls the optimistic state back.

`ConversationHeader.tsx` shows `header.aiOff` / `header.aiOn` and the buttons `header.stopAutoReply` / `header.startAutoReply`. That toggle is the existing control. It does not focus a textarea. `MessageInput` renders a `<textarea>` with no ref.

`pipeline.ts` `processMessage`, after the inbound message is stored: if `conversation.aiPaused`, it logs and returns. No LLM, no debit, no reply. `templates.ts` documents that `aiPaused` has no customer-facing template. The customer waits until the owner sends from the dashboard.

`ConversationView.tsx` duplicates the pause toggle and is mounted from `CustomerConversationModal.tsx` on the order page. The inbox page does not use `ConversationView`. Both surfaces need the same handoff or the order-page modal stays on the old pattern.

`CustomerDetailsPanel.tsx` still says "Quick Replies (coming soon)". Leave that block for task 11.

## 4. Step-by-step implementation

1. Add one control on the thread, labeled "I'll reply". It calls the existing pause API (`handleToggleAIPause` when `aiPaused` is false) and then focuses the composer. Add "Back to assistant" that calls the same function when `aiPaused` is true and resumes. You can keep the header toggle as the same two actions with these labels, or place the new labels on the thread and wire them to `handleToggleAIPause`. One code path. Do not add a second pause flag.
2. Give `MessageInput`'s textarea a ref (`useImperativeHandle` or `forwardRef`). After pause succeeds and the input is mounted, focus it. Focus in a `useEffect` that runs when `aiPaused` becomes true, because the textarea is not in the DOM until then.
3. When `aiPaused` is false, render one line where the composer would be: the assistant is answering; I'll reply to type. That line is the only extra copy. It contains the "I'll reply" control.
4. When `aiPaused` is true, the composer is visible and "Back to assistant" resumes. Resume hides the composer again.
5. Apply the same pair of actions in `ConversationView` if that modal can still pause, so the order-page thread matches the inbox.
6. Tests: a component test that the composer is absent when `aiPaused` is false and present after the control's click handler sets it true. A test that the pause request body is `{ paused: true }` and the resume body is `{ paused: false }`. The pipeline test that an `aiPaused` conversation does not call the LLM already exists in spirit in `processMessage`. Add or extend one if the suite does not assert "no debit and no reply" for a paused turn.
7. Do not change `pipeline.ts` if the early return already matches this behavior. In that case leave [`docs/INCOMING_RESPONSE_GENERATOR_FLOW.md`](../INCOMING_RESPONSE_GENERATOR_FLOW.md) as it is. If you change the pause branch, update that doc in the same change.

Quick replies stay out. Vendor notes stay "coming soon".

## 5. What not to change

- A shared inbox, assignment, or a second staff user.
- Quick replies, templates, and broadcasts (task 11 and Phase 4).
- The `aiPaused` meaning: inbound is stored, the model does not run, the wallet is not debited.
- Embedded Signup and the WhatsApp banner from task 7. If both edits touch `Conversations.tsx`, they do not. Task 7 touches `Dashboard.tsx`. Keep the pause API payload unchanged.
- Wallet balances.

## 6. Acceptance checks

- On an Ibell thread the owner chooses, or a fixture thread if they do not want a live pause that day: one click shows the composer and focuses it. The next inbound is stored and the assistant does not answer until resume.
- Resume hides the composer and the assistant answers the following inbound.
- While the composer is hidden, the thread shows the one line.
- Negative case: clicking "I'll reply" does not send a message. Send still requires the send button (`handleSendMessage`).
- Negative case: a failed `PUT` restores the previous `aiPaused` value and does not leave the composer open on a thread the server still considers running.

## 7. Dependencies

None on the payment tasks. If task 7 and this task are in progress together, they touch different files. Task 11 depends on this one because the quick-reply tap fills a composer that must be on screen.
