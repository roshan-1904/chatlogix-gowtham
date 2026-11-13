# Reorder nudges

> **PO review 2026-11-13** · commit `8f1a0e5` · **Status: Not started (waiting by design)** · Competitive role: Later
> Verified: the "same as last time" rule is in the prompt (`backend/src/conversation/llm/prompts.ts:280`). Tasks 6 and 9 are not finished, so the preconditions are unmet. Changed in this review: nothing but this block.

Phase 4. This note is a reason to wait. It is not a build spec.

## Why it waits

A nudge is an outbound message the customer did not just ask for. That is a broadcast with a delay, and broadcasts are on the "will not build" list. The assistant already has a rule for a customer who asks to repeat an order: `prompts.ts` tells the model to emit `add` ops from `RECENT ORDERS` ("same as last time"). That is a reply inside a thread the customer opened. It is not a campaign.

Ibell's open work is still a person marking payment and packing the order (Phase 2 exit). A nudge that fires while payment text might name the wrong UPI, or while the pending tile ignores open orders, sends customers back into a shop that cannot see them.

## What must be true first

- Phase 3's exit, including task 6: payment text uses the saved VPA, payee, and `businessName`.
- Task 9's order-status test is green, so a customer who replies "where is my order" is not filed as a query and is not deferred.
- The wallet price is trusted. Each nudge would be a turn or a template send, debited only through `chargeVendor`, and the platform fee on that debit is 0 until a rate card exists ([`docs/BILLING_AND_PRICING.md`](../../BILLING_AND_PRICING.md)).

## What not to build meanwhile

Do not add a scheduler, a "customers who ordered N days ago" query, or an outbound queue for reorder copy. Do not add a nudge op to CartEngine. The existing "same as last time" prompt line stays the whole reorder behavior. Do not turn task 11's "Ready for pickup" line into a drip.
