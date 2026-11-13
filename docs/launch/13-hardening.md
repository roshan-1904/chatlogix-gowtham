# 13. Hardening

## 1. Phase and why this task is in it

Phase 3. Four small fixes that are in this launch, in one change. They do not add a shop capability. They remove a message-HTML sink, a test file that cannot fail, a browser `alert`, and an unconfirmed write of the four billing fields from task 1.

## 2. Problem and user impact

Customer message text is assigned to `innerHTML` before it is shown, so a message can carry markup into the inbox. The dashboard pending tests cannot catch a regression from task 3. Choosing a custom date range throws a browser alert. Saving billing settings applies fees, FX, and mock top-up with one click and no statement of those four values.

A new shop's owner hits the date control and the inbox. The operator hits the billing save. Ibell's threads hit the HTML strip as soon as the inbox renders a message.

## 3. Current behavior

`stripHtml` in `frontend_v2/apps/web-vendor/src/components/conversations/bubbles/TextBubble.tsx` does `document.createElement('div')`, assigns `tmp.innerHTML = html`, and reads `textContent`. `TextBubbleComponent` runs that on `message.content` and `message.contentEn`. `stripHtmlTags` in `frontend_v2/apps/web-vendor/src/lib/format.ts` removes tags with a replace and decodes a fixed set of entities. It does not assign `innerHTML`. `truncateMessage` already uses it.

`frontend_v2/apps/web-vendor/src/hooks/dashboard/__tests__/useDashboardStats.test.ts` is six cases, each `expect(true).toBe(true)`. The hook does not compute pending. `dashboardStatsService.ts` does (task 3). The orders page and the tile must keep reading the unscoped open-work count, not `statusBreakdown`.

`DateRangeFilter.tsx` `handlePresetChange` already calls `onDateRangeChange('custom', ...)`. The "Select dates" button then calls `alert('Custom date picker coming soon')`.

`Billing.tsx` `save` mutation calls `updatePlatformSettings(parsed.patch)` from the Save button with no confirm. `parseBillingDraft` in `frontend_v2/apps/web-admin/src/lib/settings.ts` converts the fee fields from rupees to paise. The four fields are per-turn fee, outbound media fee, USD/INR override, and mock wallet top-up.

The access token stays in `localStorage` under `chatlogix_auth_token` (`frontend_v2/packages/auth/src/storage.ts`). Moving it to an httpOnly cookie is an auth change across vendor and admin. It is out of this launch.

## 4. Step-by-step implementation

Do these four steps in one change. Do not split them into four releases.

1. **HTML strip.** `TextBubble` `stripHtml` must not assign untrusted HTML to `innerHTML`. Call `stripHtmlTags` from `lib/format.ts`, or an equivalent replace that never touches `innerHTML`. Keep entity decoding to the fixed list already in `stripHtmlTags`. Add a test that a string containing `<img src=x onerror=alert(1)>` comes back as text and that the implementation source does not reference `innerHTML`. Delete the local `stripHtml` if it becomes a one-line call.
2. **Pending-count tests.** Replace the six `expect(true).toBe(true)` cases in `useDashboardStats.test.ts`. They must assert the pending count is not taken from the date-scoped series. The hook file does not contain that logic, so:
   - Put a pure helper next to the dashboard code, for example `tilePendingCount(stats)` returning `stats.orders.pending`, and `isOpenWorkOrder` matching task 3 (not `cancelled`, not `delivered`, positive `totalAmount` in paise, at least one item). The service's pending query and this helper are the same rule. Say that in a comment on the helper.
   - The six cases, in this file: (1) `statusBreakdown` pending count is 0 and `orders.pending` is 3, and the tile value is 3. (2) A second payload with a different `dateRange.label` and the same `orders.pending` still returns 3. (3) A `cancelled` order is not open work. (4) `totalAmount` 0 is not open work. (5) An empty `items` array is not open work. (6) `revenue.total` may differ between two payloads while `tilePendingCount` stays on `orders.pending`.
   - Add the backend test from task 3 if it is not already in the tree: the Prisma `where` for pending has no `createdAt`, and the revenue aggregate still has `createdAt`. The frontend file alone cannot see SQL. Both are part of this step if task 3's test was not written.
3. **Date alert.** Remove `alert('Custom date picker coming soon')` from `DateRangeFilter.tsx`. A custom range can stay unimplemented. The "Select dates" control must not call `alert`. Replace the button with static text that a custom range is unavailable, or remove the custom option from the `<select>` until a picker exists. Presets `thisWeek` through `thisFinancialYear` keep calling `onDateRangeChange`.
4. **Billing confirm.** In `Billing.tsx`, the Save button asks for a confirm before `save.mutate()`. The confirm names the four fields and the values about to be written: per-turn fee in rupees and the paise `parseBillingDraft` will send, outbound media fee the same way, USD/INR override or blank (blank clears the pin), and mock wallet top-up on or off. Cancel leaves the draft dirty and does not call `updatePlatformSettings`. Other money confirms (settlement freeze, invoice, tax month) stay as they are.

No conversation-pipeline edit. No formula edit. [`docs/BILLING_AND_PRICING.md`](../BILLING_AND_PRICING.md) stays. If the confirm is the only billing change, the flow doc stays.

## 5. What not to change

- JWT storage. `chatlogix_auth_token` stays in `localStorage`.
- Freeze, unfreeze, reserve, invoice, and tax-month confirms.
- A custom date-picker library.
- `WalletBlockEvent`, Route go-live, Embedded Signup, and broadcasts.
- The charge formula and the four live values, except that a human saving the form must now confirm them. This task does not itself set the fees to 0. Task 1 does that, and only on the matching host.
- Rewriting the rest of the frontend test suite.

## 6. Acceptance checks

- A message whose content is `<b>hello</b>` renders as hello, and the bubble path does not set `innerHTML`.
- The six dashboard tests fail if `tilePendingCount` is switched to `statusBreakdown`'s pending count. They pass when it reads `orders.pending`. `isOpenWorkOrder` rejects cancelled, zero-total, and empty-item orders.
- Choosing Custom Range, or the control that replaced it, does not call `alert`.
- Saving billing settings with fee ₹222, media ₹22, override ₹50, and mock on shows those four in the confirm. Dismissing the confirm does not PATCH. The negative case is a confirm that only says "Are you sure?" and omits the four fields. That is a failed check.
- Negative case: an httpOnly-cookie migration is not in the diff. `storage.ts` still uses `chatlogix_auth_token`.

## 7. Dependencies

Task 3 for the pending definition the tests lock. If task 3's helper already exists, this step only replaces the tautologies and points them at it. Task 1 for the meaning of the four billing fields. Tasks 10–12 so the tests describe behavior that is already specified. The HTML strip and the date alert can land as soon as Phase 3 starts. They do not wait on a new shop's signup.
