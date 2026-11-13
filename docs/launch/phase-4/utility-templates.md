# Utility templates

> **PO review 2026-11-13** · commit `8f1a0e5` · **Status: Not started (waiting by design)** · Competitive role: Later
> Verified: task 11 has no code yet (`CustomerDetailsPanel.tsx:345-352` is still the inert block), so the first precondition is unmet. Changed in this review: nothing but this block.

Phase 4. This note is a reason to wait. It is not a build spec.

## Why it waits

"Ready for pickup" and "Out for delivery" are task 11: a per-vendor line that fills the composer, sent only when the owner presses send, inside the WhatsApp session window. A Meta utility template is a different object. It needs a submitted template, Meta approval, a template name, and a send path that works after the 24-hour customer-care window. None of that is required for Ibell to tell a customer the order is ready while the chat is open.

Admin `Templates.tsx` still treats the meaning of templates as undecided. The vendor Templates entry is a later placeholder. Building the Meta submit flow now would reopen that decision inside the launch.

## What must be true first

- Task 11 is in use: one tap fills the composer and does not send by itself.
- Phase 3's exit, including an honest WhatsApp status (task 7). A template send uses `pickVendorSendingNumber`. Ibell's legacy row must stay the send path. A template project must not start Embedded Signup on that number to "unlock" templates.
- The wallet price is trusted (task 1). Template sends would be another `ChargeSource` if they are billed, and `chargeVendor` would be the only debit. That pricing decision is not made.

## What not to build meanwhile

Do not submit "Ready for pickup" or "Out for delivery" to Meta. Do not add template CRUD, language variants, or a broadcast of those templates. Do not change the task 11 seeds into template names. Leave both Templates pages as they are.
