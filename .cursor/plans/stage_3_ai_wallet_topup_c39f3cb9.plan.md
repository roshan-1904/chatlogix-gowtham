---
name: Stage 3 AI wallet topup
overview: Replace the Razorpay top-up stub so a vendor can add AI-wallet credit. Credit the full selected amount only from payment.captured, never from the browser callback. Fix the AI wallet's concurrent-write race before the first real credit.
todos:
  - id: vendor-lock-ai-wallet
    content: Lock the vendor row in creditWalletFromTopUp and chargeVendor before reading walletBalanceMilli
    status: completed
  - id: create-order
    content: Implement razorpayProvider.createIntent with wallet_topup notes
    status: completed
  - id: capture-credit
    content: Credit creditWalletFromTopUp only when captured paise match the intent
    status: completed
  - id: checkout-ui
    content: Add Checkout on the wallet page and poll balance; no client-side credit
    status: completed
  - id: guards
    content: Boot check against rzp_test_ in production, CSP for checkout.razorpay.com, rate limit on intent creation
    status: completed
isProject: false
---

# Stage 3 — AI wallet top-up

This is P2g v2 in [documentation/modules/features/vendor-onboarding/guides/wallet-top-up-p2g.md](documentation/modules/features/vendor-onboarding/guides/wallet-top-up-p2g.md). It credits `walletBalanceMilli` only. It does not call `creditCapturedPayment`.

Does not wait on any confirmation in [docs/payments/05-compliance-and-risk.md](docs/payments/05-compliance-and-risk.md). ChatLogix is selling its own service here. Stage 6 reuses the Checkout integration built here for shops funding a refund (`purpose: 'shop_funding'`), so keep the Checkout component generic.

## AI wallet lock (first)

- [backend/src/services/pricing/pricingService.ts](backend/src/services/pricing/pricingService.ts) `chargeVendor` and [backend/src/services/wallet/walletTopUpService.ts](backend/src/services/wallet/walletTopUpService.ts) `creditWalletFromTopUp` both read `walletBalanceMilli`, compute, and write the result in a read-committed transaction with no lock. A top-up landing during a conversation charge, or two charges for one vendor, can lose one write.
- Lock the vendor row before the read, using the same helper as stage 1 F1.
- Remove the “Concurrent writes (known issue)” note in [docs/BILLING_AND_PRICING.md](docs/BILLING_AND_PRICING.md) §4 in the same change.

## Backend

- Implement `createIntent` in [backend/src/services/wallet/paymentProviders/razorpayProvider.ts](backend/src/services/wallet/paymentProviders/razorpayProvider.ts). It throws 501 today.
- Create a Razorpay Order for `milliToPaise(amountMilli)`. Notes: `{ purpose: 'wallet_topup', intentId }`.
- On `payment.captured` with that purpose, call `creditWalletFromTopUp` with `idempotencyKey = payment.id`, inside the stage 2 webhook transaction.
- Credit the intent’s `amountMilli` only when Razorpay’s captured paise equal `milliToPaise(intent.amountMilli)`. Otherwise credit nothing and log an alert.
- Do not subtract Razorpay’s fee and do not apply `paymentFeeBps`.
- Refuse to boot when `NODE_ENV=production` and `RAZORPAY_KEY_ID` starts with `rzp_test_`.
- Rate-limit top-up intent creation per vendor.

## Vendor app

- On `/wallet`, load Razorpay Checkout. On the success handler, poll `GET /api/vendors/me/wallet`. Do not add a confirm-credit endpoint.
- The content security policy allows `checkout.razorpay.com` and no other payment script.
- Keep the mock provider behind `mockWalletTopUpEnabled`.

## Done when

- A test-mode payment increases the AI wallet once.
- Replaying the webhook does not increase it again.
- Closing the browser after Checkout, with no webhook, leaves the balance unchanged.
- A top-up and a charge for the same vendor, run at the same time, both land in the balance.
