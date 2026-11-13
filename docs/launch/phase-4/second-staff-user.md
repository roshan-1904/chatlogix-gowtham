# A second staff user

Phase 4. This note is a reason to wait. It is not a build spec.

## Why it waits

The launch shop is one owner. `ProtectedRoute` already accepts a `vendor_staff` role string, and the inbox is one composer with one `aiPaused` flag on the conversation (task 8). A second person needs an invite, a login, a scope that cannot read another vendor (task 2), and a rule for who paused the assistant. Seat pricing is on the "will not build" list in the phase index. Adding a user without a price pulls seat pricing into the launch.

Ibell runs with the owner on `http://127.0.0.1:3000`. A second login does not unblock catalog, payment, or the pending count.

## What must be true first

- Phase 3's exit: signup, the shop's own catalog, pause and reply, and a recorded test payment all work for one owner.
- Task 2's token rule is the pattern any staff token must follow. A staff user of shop A uses shop A's id and cannot pass shop B.
- The business has said how a second person is billed. Until then, `chargeVendor` stays per shop, not per seat. Do not add a seat fee to `PlatformSettings`.

## What not to build meanwhile

Do not add an invite flow, a staff table UI, assignment, or a shared inbox. Do not wire `vendor_staff` through signup. Do not add per-seat markup or a second wallet. The owner remains the only user who can pause the assistant and mark payment received.
