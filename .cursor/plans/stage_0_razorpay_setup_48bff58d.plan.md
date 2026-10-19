---
name: Stage 0 Razorpay setup
overview: Open a Razorpay test account, request Route, send the confirmation questions to Razorpay, the CA, and counsel, publish the pages Razorpay will review, and add empty key names. No live payments and no ledger changes.
todos:
  - id: env-names
    content: Add the three empty Razorpay env names; keep the provider on mock
    status: pending
  - id: razorpay-route
    content: Request Route and send the six D1 questions; save Razorpay's written reply in docs/payments/05
    status: pending
  - id: ca-d2-d3
    content: Send the CA the D2 and D3 questions (TCS/TDS applicability, base, refunds; gateway-fee GST); save the answers in 05
    status: pending
  - id: counsel-d4
    content: Send counsel the refund-wait question and the three legal pages; save the answer in 05
    status: pending
  - id: legal-pages
    content: Publish terms, refunds, contact, and a payment section in privacy
    status: pending
  - id: ops-checks
    content: Record HTTPS and database-firewall checks before any live key
    status: pending
isProject: false
---

# Stage 0 — Razorpay account, confirmations, and public pages

The design is final ([docs/payments/README.md](docs/payments/README.md)). This stage gets the outside confirmations moving and makes the site reviewable. Live keys wait until the pages and the checks in [docs/payments/04-security-and-go-live.md](docs/payments/04-security-and-go-live.md) are done.

Stages 2, 3, and 4 (AI wallet) do not wait on the confirmations. Stages 5, 6, and 7 wait on Razorpay’s Route confirmation. Send all three sets of questions on day one.

## Confirmations (manual, start first)

The exact questions are in [docs/payments/05-compliance-and-risk.md](docs/payments/05-compliance-and-risk.md).

- **Razorpay (D1).** Ask Razorpay to enable Route, and send the six D1 questions from the account owner’s email: holds and later release, reversals across payments, disputes, linked-account KYC and bank changes, and TCS/TDS. Paste the written reply into 05 with the date.
- **CA (D2, D3).** Whether ChatLogix is an e-commerce operator for GST TCS and 194-O TDS under Route, the TCS base, how refunds adjust them, and the GST treatment of the gateway fee passed to the shop.
- **Counsel (D4).** Whether “refund sent when the shop approves and funds it” fits the Consumer Protection (E-Commerce) Rules, 2020, plus a review of terms, refunds, and privacy.

## Account (manual)

- Create one ChatLogix Razorpay business and stay in **Test Mode**. Follow [docs/payments/03-razorpay-account-setup.md](docs/payments/03-razorpay-account-setup.md).
- Generate `rzp_test_` key id and secret. Store them in the password manager and in server env, not in git.
- RazorpayX is not used. Do not request live keys yet.

## Code

- Add optional env names in [backend/src/config/env.ts](backend/src/config/env.ts) and empty values in [backend/.env.example](backend/.env.example): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. There are no `RAZORPAYX_*` names.
- Leave `WALLET_PAYMENT_PROVIDER` defaulting to `mock`.

## Public site

Marketing routes today are only `/`, `/privacy`, and `/about` in [frontend_v2/apps/web-marketing/src/App.tsx](frontend_v2/apps/web-marketing/src/App.tsx). Vendor signup already links `https://chatlogix.in/terms`, which 404s.

- Add `/terms`, `/refunds`, and `/contact`. Extend [frontend_v2/apps/web-marketing/src/pages/Privacy.tsx](frontend_v2/apps/web-marketing/src/pages/Privacy.tsx) to name Razorpay (payments, Route settlement, refunds), the shop’s PAN, GSTIN, and masked bank account, and that card numbers are never stored.
- Link Privacy, Terms, Refunds, and Contact from [frontend_v2/apps/web-marketing/src/components/MarketingFooter.tsx](frontend_v2/apps/web-marketing/src/components/MarketingFooter.tsx).
- Refund copy must match the ledger: the customer is refunded on the original instrument once the shop approves and funds the refund, the platform fee is not returned, cash on delivery is between the customer and the shop.
- Terms follow 04 §3.1: Route transfer held 48 hours (7 days for new shops), platform fee including GST, TCS and TDS withheld where required, releases may be held for refunds, disputes, bank changes, and fraud, the shop funds refunds its held money cannot cover, and anything owed is recovered or invoiced.

## Ops checks (not code)

- Confirm HTTPS on `www`, `app`, `admin`, and `api`.
- Close public access to Postgres ports 5432 and 6432 (`docs/LOAD_TESTING.md`).

## Done when

- Route is requested and the three sets of questions are sent, with dates in 05.
- Env names exist with empty values. The provider is still `mock`.
- The four public URLs return 200 over HTTPS.
