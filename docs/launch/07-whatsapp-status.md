# 7. Honest WhatsApp status

## 1. Phase and why this task is in it

Phase 2. Ibell already has chats. The home screen still offers Connect WhatsApp unless `connectStatus === 'live'`. Sending that shop through Embedded Signup can disturb the number customers already message. The fix is copy and a guard. It is not a new connect.

## 2. Problem and user impact

The owner follows Connect WhatsApp and starts Embedded Signup on a number that already receives orders. Or they ignore a real outage because the screen has said the number is missing. Admin shows a second mapped id that looks like a sample as if it were healthy, and labels a missing status Unknown.

## 3. Current behavior

`Dashboard` in `frontend_v2/apps/web-vendor/src/pages/Dashboard.tsx` sets `whatsappLive` to `whatsappQuery.data?.connectStatus === 'live'`. When that is false it renders `ConnectWhatsAppPromo`, whose button links to `/settings/whatsapp` with the label "Connect WhatsApp". `QuickActionsPanel` and `CatalogImportGoLive.tsx` use the same `=== 'live'` check.

`getWhatsAppConnectStatus` in `backend/src/services/whatsapp/whatsappConnectService.ts` loads a row only when `connectStatus` is in `ACTIVE_CONNECT_STATUSES` (`meta_in_progress`, `credit_attached`, `live`), or `error`, or `disconnected` (`loadPrimaryRow`). A legacy row with `connectStatus` null is not loaded. `toStatusResponse` then returns `connectStatus: 'not_started'` when there is no row, and uses `row.connectStatus ?? 'not_started'` when a row exists. The vendor client therefore does not receive `null` for an Ibell-shaped row. `ConnectStatusPanel.statusLabel` still maps `null` to "Unknown", and maps `not_started` to "Not started".

`pickVendorSendingNumber` in `backend/src/services/whatsapp/vendorSendingNumber.ts` can send on that legacy shape. `tierOf` returns `TIER_LEGACY` when `connectStatus` is null and `accessTokenEncrypted` is null. That row uses the global token. The comment in that file names the pre-P2h Ibell shape. `resolveVendorSendingPhoneNumberId` is what `sendUpiQrForOrder` and other sends call. This task does not change the tier order.

Admin `WhatsAppCard.formatStatusBadge` returns label `Unknown` for a null or unrecognized status and prints `phoneNumberId` as healthy text. The sample-looking id is not named in code. It has to be read from Ibell's `WhatsAppNumber` rows.

`pipeline.ts` does not consult `connectStatus` before a reply. Send authority stays `pickVendorSendingNumber`.

## 4. Step-by-step implementation

1. Read-only: list Ibell's `WhatsAppNumber` rows (`phoneNumberId`, `connectStatus`, whether `accessTokenEncrypted` is set, `displayPhone`, `createdAt`). Do not call the Meta API. Note which id matches recent outbound sends and which id looks like a sample. Record the sample in the PR only as "sample-looking", not as a second live number.
2. Teach `getWhatsAppConnectStatus` about legacy. When `loadPrimaryRow` returns nothing, call `resolveVendorSendingNumber`. If `tierOf` would be `TIER_LEGACY`, report a distinct mode the client can trust. Add a field such as `sendingMode: 'legacy' | 'connect' | 'none'` on `WhatsAppStatusResponse` and on `WhatsAppStatus` in `frontend_v2/apps/web-vendor/src/lib/whatsappConnect.ts`. Do not coerce that row to `live`. `live` means Embedded Signup finished (`maybePromoteToLive`). Set `connectStatus` for a legacy row to a value the panel can label, or leave it null and let `sendingMode` carry the meaning. Today null is coerced to `not_started`. That coercion is why the banner appears. Stop coercing a legacy row to `not_started`.
3. Legacy-with-traffic means: the picked row is `TIER_LEGACY`, and the vendor has at least one customer `Message` (or one `Conversation`). Ibell qualifies. A legacy row with no customer traffic is not "connected". It can still see the connect wizard.
4. Dashboard banner:
   - `connectStatus === 'live'` or `'credit_attached'`: no `ConnectWhatsAppPromo`.
   - Legacy-with-traffic: do not mount `ConnectWhatsAppPromo`. Mount a separate line: the number customers already message, status "Connected (existing number)", with no link and no button to `/settings/whatsapp`.
   - Unknown only when the shop is neither legacy-with-traffic nor a known `connectStatus` (`not_started`, `meta_in_progress`, `credit_attached`, `live`, `disconnected`, `error`). A shop with no number and no chats keeps the connect wizard.
5. `ConnectStatusPanel`: same labels. The Embedded Signup button stays off for legacy-with-traffic. `WhatsAppConnect.tsx` refuses to start the wizard when a legacy-with-traffic row or a `live` row already exists. Do not run the wizard against Ibell.
6. `QuickActionsPanel` and `CatalogImportGoLive.tsx`: a legacy-with-traffic shop is not sent to the connect page as if the number were missing. Read `sendingMode` the same way as the dashboard.
7. Admin `WhatsAppCard`: for a legacy row that `pickVendorSendingNumber` would select, label "Connected (existing number)". For a phone-number id that is sample-looking (non-numeric, implausibly short, or the id you recorded in step 1 that does not match recent outbound sends), show a warning on that row. Do not offer it as the active sending number. Do not delete the row in this task.
8. Tests: `vendorSendingNumber` tier stays legacy for null status and null token. A status-service test: vendor with only that row plus one customer message returns `sendingMode: 'legacy'` and does not return `not_started`. A vendor with no rows returns the connect-wizard state. A frontend test: `ConnectWhatsAppPromo` is not rendered when `sendingMode` is `legacy`.

No change to `pickVendorSendingNumber`'s ranking. No Meta call. No pricing change. The flow doc stays as it is unless you change send behavior. This task is display and a wizard guard.

## 5. What not to change

- Embedded Signup on Ibell's number, WABA, or token. Do not click through the wizard on that shop.
- `pickVendorSendingNumber` tier order and the global-token send path.
- `WhatsAppNumber` rows. No delete, no status rewrite to `live`.
- A market-launch connect test. That uses a fresh number in Phase 3, after this phase, and it does not use Ibell's number.
- Wallet balances and platform fees.

## 6. Acceptance checks

- Ibell's home on `http://127.0.0.1:3000` does not show Connect WhatsApp and does not link to Embedded Signup. It shows the existing-number line.
- Admin shows the sending number as existing and in use, and flags the sample-looking id.
- A shop with no number and no customer messages still sees the connect wizard.
- Negative case: a `disconnected` or `error` row is not labeled "Connected (existing number)". Unknown is reserved for a row that is neither legacy-with-traffic nor one of the known statuses.
- Negative case: completing the wizard is not required for Ibell to keep receiving replies. Send a fixture or read `resolveVendorSendingPhoneNumberId` and confirm it still returns the legacy id.

## 7. Dependencies

Task 2 so the admin shop you inspect is Ibell. Independent of tasks 3–6 except that the same dashboard file is also edited in tasks 3 and 12. Land the `whatsappLive` condition in one place so those tasks do not overwrite it. No dependency on task 1 for the copy change. Do not generate a live assistant reply as the proof.
