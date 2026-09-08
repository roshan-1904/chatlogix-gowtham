# Vendor approval ops runbook (P2f)

Manual approval remains the v1 path until an admin portal queue ships.

## Approve a vendor

```sql
UPDATE "Vendor"
SET
  "registrationStatus" = 'approved',
  "approvedAt" = NOW(),
  "approvedBy" = 'ops@chatlogix.in',
  "subscriptionStatus" = 'active',
  "walletBalance" = 0
WHERE phone = '+919876543210';
```

After approval:

1. Trial balance is **not** carried over (`walletBalance = 0`).
2. Call `notifyVendorApproved()` (stub logs the WhatsApp/SMS copy today).
3. Vendor re-login should land on `/dashboard`, not onboarding.

## Reject a vendor (optional)

```sql
UPDATE "Vendor"
SET
  "registrationStatus" = 'rejected',
  "rejectionReason" = 'We could not verify your shop details. Please contact support.'
WHERE phone = '+919876543210';
```

## Notification stub

`backend/src/services/vendorApprovalNotificationService.ts` logs the post-approval message to login phone. Wire to `whatsappTemplateService` when production templates are ready.

## Daily ops digest (manual v1)

```sql
SELECT COUNT(*) AS pending_count
FROM "Vendor"
WHERE "registrationStatus" = 'pending_approval';
```

## Funnel logs

Search application logs for `onboarding_funnel` events:

- `signup_started`, `otp_verified`, `step_N_completed`
- `sandbox_message_sent`, `sandbox_voice_sent`, `submitted`

Alert thresholds (log warnings today):

- Sandbox error rate > 2% over 1h window
- Sandbox p95 latency > 20s (`sandbox_latency_alert`)
