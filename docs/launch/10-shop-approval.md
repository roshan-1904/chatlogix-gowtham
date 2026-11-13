# 10. Shop approval

> **PO review 2026-11-13** · commit `8f1a0e5` · **Status: Not started** · Competitive role: none (ChatLogix's own gate) · Priority: Phase 3, order 10 (unchanged)
> Verified: the `?? 'approved'` fallback (`frontend_v2/apps/web-vendor/src/components/auth/ProtectedRoute.tsx:48`); auto-approve (`backend/src/services/vendorOnboardingService.ts:246-249`); no approve or reject route under `backend/src/routes`; the Waiting card copy (`frontend_v2/apps/web-admin/src/pages/Dashboard.tsx:77-95`). Not verifiable from the repo: Lumina's row. Missing: all seven steps. Changed in this review: section 7 links the locked decision this task stays inside.

## 1. Phase and why this task is in it

Phase 3. Ibell is already approved, so this does not block Phase 2. A new shop has to finish signup and land on the dashboard, and a shop that is actually waiting (`pending_approval`) has to be decidable. Lumina Fragrances is the waiting shop.

## 2. Problem and user impact

A new seller cannot tell whether they are in. A waiting shop sits with no approve and no reject. The admin Waiting card says shops auto-approve until review is turned on, and also says "need decision".

## 3. Current behavior

`completeOnboarding` in `backend/src/services/vendorOnboardingService.ts` sets `registrationStatus: 'approved'`, `approvedBy: 'system'`, `approvedAt`, and `subscriptionStatus: 'active'` when business name and email are present. The test file `vendorOnboardingService.completeOnboarding.test.ts` locks that. Signup stays on this path. Do not insert a review step in front of it.

`redirectPathForStatus` in `frontend_v2/apps/web-vendor/src/lib/onboarding.ts` sends `approved` to `/dashboard`, `pending_approval` to `/onboarding/submitted`, `rejected` to `/onboarding/rejected`, and `onboarding` or `default` to the catalog step.

`ProtectedRoute.tsx` does `const status = (user?.registrationStatus ?? 'approved')`. A token with no `registrationStatus` is treated as approved and enters the vendor dashboard when `requireApproved` is set. `redirectPathForStatus(undefined)` would have sent them to onboarding. The `?? 'approved'` is what skips that.

`resolveRolesForPhone` returns `vendor.registrationStatus` from the row. `backend/src/routes/auth.ts` puts that claim on the token. A missing claim means the token was minted without it, not that the row is approved.

`Vendor` already has `registrationStatus`, `rejectionReason`, `approvedAt`, and `approvedBy`. There is no `rejectedAt` column. No admin route approves or rejects. `VendorDetailPanel.tsx` has recharge, markup, and WhatsApp. It does not mention `registrationStatus`.

Admin `Dashboard.tsx` links the Waiting card to `/vendors?status=pending_approval` and the footnote is "New shops are approved automatically until review is turned on." The count is `pendingApproval` from `backend/src/routes/adminDashboard.ts` (`registrationStatus: 'pending_approval'`). `Vendors.tsx` can filter that status and shows a badge. It has no Approve or Reject button.

## 4. Step-by-step implementation

1. In `ProtectedRoute`, stop substituting `'approved'` for a missing status. `isApproved` is true only when `registrationStatus === 'approved'`. When `requireApproved` is set and the status is missing, `pending_approval`, `rejected`, or `onboarding`, navigate with `redirectPathForStatus(status, 1)`. Missing status hits the `default` branch, which is `/onboarding/catalog`. Add a unit test for a user object with no `registrationStatus`.
2. Leave `completeOnboarding` on auto-approve. The test that expects `approvedBy: 'system'` stays. Do not add a feature flag that turns review on for signup.
3. Add two admin routes, for example `POST /api/admin/vendors/:id/approve` and `POST /api/admin/vendors/:id/reject`. Both require the admin role.
   - Load the vendor. If `registrationStatus` is not `pending_approval`, return 409.
   - Approve sets `registrationStatus` to `approved`, `approvedAt` to now, `approvedBy` to the admin id, and clears `rejectionReason`.
   - Reject requires a non-empty reason (max length that fits `rejectionReason`). Set `registrationStatus` to `rejected` and store the reason. Do not add a migration for `rejectedAt`.
   - Do not change `walletBalanceMilli`. Trial grant, if it already ran at signup, stays. Do not grant or claw back money in these handlers.
4. On `VendorDetailPanel` and on the vendors list row, show Approve and Reject only when `registrationStatus === 'pending_approval'`. Reject opens a field and will not submit an empty reason. Approved and onboarding rows do not show the buttons.
5. Relabel the Waiting card. A zero means there is nothing to decide. The footnote that says review can be turned on comes off. A non-zero count still links to `/vendors?status=pending_approval`, where those two actions are on each waiting row. No queue, no assignee, no SLA, no email workflow.
6. Use the buttons on Lumina Fragrances. Store the decision the operator actually makes. Do not approve Lumina from SQL.
7. Tests: reject without a reason is 400. Approve on an `onboarding` row is 409. Approve on `pending_approval` sets `approved`. A token fixture with no `registrationStatus` does not render the dashboard route.

No pricing doc change. No conversation flow change.

## 5. What not to change

- Auto-approve inside `completeOnboarding`. Signup does not land on `pending_approval`.
- A review queue, assignment, or an SLA.
- Ibell's `registrationStatus`. Ibell is already approved.
- Wallet balances, trial grant amounts, and mock top-up.
- Embedded Signup. A new shop's number is not Ibell's number.
- `AUTH_ADMIN_PHONES` and the dual role of `+919790690170`.

## 6. Acceptance checks

- A test phone completes onboarding and opens `/dashboard` with `registrationStatus` `approved` and `approvedBy` `system`. No script and no database edit.
- Lumina is `approved` or `rejected`. A rejection has a reason on the vendor row. The Waiting count matches the remaining `pending_approval` rows.
- A session whose token has no `registrationStatus` does not enter the vendor dashboard. It lands on the onboarding path.
- Negative case: Approve and Reject are absent on an approved shop and on a shop still in `onboarding`.
- Negative case: reject with an empty reason does not change the row.
- Admin inspection of the new test shop shows that shop's product (task 2), not Isha Bakers and not Ibell.

## 7. Dependencies

Phase 2's exit check. Task 2 is what makes the new shop's catalog the one admin sees. Signup does not depend on tasks 11–13. [`docs/admin-portal/DECISIONS.md`](../admin-portal/DECISIONS.md) decision 1 is Locked on auto-approve. This task stays inside it: no review step at signup, and no queue.
