# CSAT

Phase 4. This note is a reason to wait. It is not a build spec.

## Why it waits

A score after delivery asks the customer to rate the shop and then shows that score to the owner. The launch does not have a delivery event the product trusts: Create Shipment stays on HTTP 501 (task 4), and packing is manual. A survey tied to `delivered` would fire when the owner taps a status, including on orders that never left the kitchen, and it would open another assistant turn.

The owner can already read the thread and the query list. Task 9 closes the current open queries with the shop. A numeric score does not answer those.

## What must be true first

- Phase 3's exit, so a new shop can finish an order and mark payment without an engineer in the thread.
- A delivery signal that is not the hidden shipment button. Until then, "delivered" is the owner's status tap.
- The wallet price is trusted. A survey turn is a `conversation_turn` debit through `chargeVendor` if the assistant sends it. It waits until that debit is under ₹1 at the shop's markup with platform fee 0.

## What not to build meanwhile

Do not add a rating op, a CSAT table, a dashboard score, or a post-delivery template. Do not append "how did we do?" to `renderOrderStatusReply` or to the task 11 quick replies. Do not store a score on `CustomerInsights` in this launch.
