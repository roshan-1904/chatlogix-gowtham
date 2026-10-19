# Security and go-live — payments

**Status:** Final 2026-10-19. Not a legal opinion. The design decisions are final ([README](./README.md)). Before live keys, three outside confirmations must be saved in [05-compliance-and-risk.md](./05-compliance-and-risk.md): Razorpay’s Route confirmation, the CA’s tax answers, and counsel’s view of the refund-wait rule.  
**Product rules:** [README](./README.md). **Build phases:** [02-implementation-plan.md](./02-implementation-plan.md). **Razorpay setup:** [03-razorpay-account-setup.md](./03-razorpay-account-setup.md).

Razorpay will not turn on live keys for a site that is missing HTTPS, a privacy policy, terms, a refund policy, and a way to contact the business. Those pages are the visible half. The other half is how the API treats a webhook, an amount, a transfer, and a bank account. In the repo (phases 2–6), `POST /api/payments/razorpay/webhook` verifies HMAC on the raw body before `authenticate`, and settlement paths are idempotent. **Live keys** still need the ops checklist in this doc, D1 Route confirmation, and counsel on the refund-wait rule (`05`). Dev may use `RAZORPAY_USE_FAKE_ROUTE` until then.

Card numbers, CVV, and UPI PIN are entered on Razorpay’s page (Checkout or a Payment Link). ChatLogix never builds a card form. That keeps the card-data scope on Razorpay. Route keeps the shops’ money at Razorpay rather than in ChatLogix’s account. The risks that remain are ours: crediting the wrong balance, crediting twice, releasing money that should have stayed on hold, sending a refund the shop has not funded, and leaking secrets.

## Stage 0 ops checks (before any live key)

Complete this checklist manually. Stage 0 records the expected hosts from the repo; it does **not** probe certificates or firewalls from CI. Do **not** request live Razorpay keys or set `WALLET_PAYMENT_PROVIDER=razorpay` in production until every row you care about is ticked and dated by a human.

| Check | Expected (from repo / docs) | Verified (owner: date + initials) |
|---|---|---|
| Marketing HTTPS | `https://www.chatlogix.in` and `https://chatlogix.in` serve `/`, `/privacy`, `/terms`, `/refunds`, `/contact`, `/about` over HTTPS with HTTP→HTTPS redirect | _Pending_ |
| Vendor app HTTPS | `https://app.chatlogix.in` loads over HTTPS | _Pending_ |
| Admin HTTPS | `https://admin.chatlogix.in` loads over HTTPS | _Pending_ |
| API HTTPS | `https://api.chatlogix.in` (webhook path will be `/api/payments/razorpay/webhook`) loads over HTTPS | _Pending_ |
| TLS certificate | Valid chain, matching hostname, not expiring within 30 days on each host above | _Pending — not probed in Stage 0_ |
| Postgres firewall | Ports **5432** and **6432** on the database host are **not** reachable from the public internet ([LOAD_TESTING.md](../LOAD_TESTING.md) §0 security note) | _Pending_ |
| Outside confirmations | Razorpay D1, CA D2/D3, and counsel D4 sent and replies pasted in [05-compliance-and-risk.md](./05-compliance-and-risk.md) | _Pending_ |
| Live keys | Still **test mode only** (`rzp_test_…` in env). `WALLET_PAYMENT_PROVIDER=mock` unless deliberately testing Checkout in a non-prod environment | _Pending_ |

Optional notes (paste evidence paths or ticket links):

```
HTTPS / TLS notes:
Postgres firewall notes:
```

### Where the repo specifies HTTPS (2026-10-19)

Recorded from the repository only. This does not prove a live certificate. `docs/API_LAMBDA_CLOUDFRONT_MIGRATION_PLAN.md` is still marked not started — do not treat its HTTP→HTTPS redirect as a completed cutover.

| Host | Where the repo specifies HTTPS |
|---|---|
| `www.chatlogix.in` | This doc; `frontend_v2/apps/web-marketing/src/lib/site.ts`; CI `VITE_SITE_ORIGIN` |
| `app.chatlogix.in` | Same `site.ts` fallback; CI `VITE_VENDOR_APP_ORIGIN`; CloudFront redirect in `docs/API_LAMBDA_CLOUDFRONT_IMPLEMENTATION.md` |
| `admin.chatlogix.in` | Production CORS in `backend/.env.example` |
| `api.chatlogix.in` | [03-razorpay-account-setup.md](./03-razorpay-account-setup.md); `backend/src/docs/openapi.ts` |

**Launch blocker:** Postgres ports **5432** and **6432** on the database host still answer from the public internet ([LOAD_TESTING.md](../LOAD_TESTING.md) §0, §13). Restrict them before live payments.

## 1. What a reviewer expects to open in a browser

All of these must load over HTTPS on the public site, with no login wall, and the company name must match the Razorpay KYC entity.

| Page | URL we will publish | Why it exists |
|---|---|---|
| Privacy policy | `https://www.chatlogix.in/privacy` | What we collect, why, who we share it with (Razorpay, Meta, the shop), how long we keep it |
| Terms | `https://www.chatlogix.in/terms` | Contract for using ChatLogix, including who collects an order payment and how the shop is paid through Route |
| Refund and cancellation | `https://www.chatlogix.in/refunds` | How a customer gets money back, how long it takes, that the shop approves and funds a refund, that the platform fee is not returned, that cash on delivery is between the customer and the shop |
| Contact | `https://www.chatlogix.in/contact` | A monitored email and a way to reach a human. Razorpay KYC expects phone and a postal address on this page before live keys |
| About | `https://www.chatlogix.in/about` | What the business is. Already routed |

The marketing footer links Privacy, Terms, Refunds, and Contact. Vendor signup and payment-link messages should use the same `https://www.chatlogix.in/…` URLs.

The refund page must say the same thing as the ledger: the customer is refunded on the original UPI or card once the shop approves and funds the refund; ChatLogix keeps the platform fee; the shop bears the gateway fee; cash on delivery is not refunded by ChatLogix. Counsel confirms the wording (05, D4).

## 2. What we have now

| Control | State |
|---|---|
| Privacy page | Live at `/privacy` (`Privacy.tsx`, updated October 2026). Covers WhatsApp and business data, Razorpay and Route settlement, shop PAN/GSTIN/masked bank, and that card numbers are not stored. |
| Terms | Live at `/terms` (`Terms.tsx`). Vendor signup links `https://www.chatlogix.in/terms`. |
| Refund policy | Live at `/refunds` (`Refunds.tsx`). Matches ledger: shop approves and funds, original instrument, platform fee not returned, COD excluded. |
| Contact | Live at `/contact` (`Contact.tsx`). Repo copy is email-only (`legalContact.privacyEmail` in `copy.ts`) plus a note that the registered office will be published before live payments. Add phone and postal address in `copy.ts` and `Contact.tsx` to match Razorpay KYC before submitting the site. |
| About | One short page at `/about`. |
| Footer | Privacy, Terms, Refunds, Contact (`MarketingFooter.tsx`). |
| HTTPS | Production hosts are specified as `https://chatlogix.in`, `https://www.chatlogix.in`, `https://app.chatlogix.in`, `https://admin.chatlogix.in`, `https://api.chatlogix.in`, with HTTP redirected to HTTPS in the CloudFront plan. Confirm the live certificate and the redirect before submitting the site to Razorpay. Do not assume the plan has been fully cut over. |
| API hardening | `helmet` and an origin allow-list for CORS are on in `backend/src/index.ts`. |
| WhatsApp webhooks | Signature checked with HMAC and `timingSafeEqual`, on the raw body, and that route is mounted **before** `express.json`. This is the pattern the Razorpay webhook must copy. |
| Payment webhooks | `POST /api/payments/razorpay/webhook` before `authenticate` (raw body + HMAC). Credits AI wallet top-up / auto-recharge; `order_payment` runs settlement capture + post-commit Route transfers. Live Route HTTP needs D1 in `05`; dev may use `RAZORPAY_USE_FAKE_ROUTE`. |
| Login abuse | Phone OTP send is limited to 5 per hour and 60 seconds between sends (`sendCodeRateLimit.ts`). Dev OTP `123456` is disabled when `NODE_ENV` is production. |
| Secrets at rest | WhatsApp tokens use AES-256-GCM (`whatsappTokenCrypto.ts`). PAN will use the same. Razorpay secrets are not in the repo. There is no Razorpay key yet. |
| Money idempotency | AI-wallet charges and top-ups are idempotent. The phase 1 settlement code is idempotent per payment. Transfers, releases, and refunds are added in the Route rework. |
| Concurrent balance writes | Not safe. `chargeVendor`, `creditWalletFromTopUp`, and the phase 1 settlement writes read the balance and write the result without locking the vendor row. Idempotency stops a replay. It does not stop two different writes for the same shop at once. Fixed by rule 8 in the implementation plan (phase 1 F1, phase 3). |
| Ledger deletes | The phase 1 money tables cascade-delete from `Order` and `Vendor`. Changed to `Restrict` in F4. |
| BigInt in responses | `POST /api/vendors/register` returns a full `Vendor` row and will throw once `settlementBalanceMilli` exists. Fixed in F5. |
| Order amount | `Order.totalAmount` is paise on the server. The unimplemented payment-link route also reads `amount` from the request body. The body amount must be ignored. |
| Database exposure | `docs/LOAD_TESTING.md` records that Postgres ports 5432 and 6432 on the database host answer from the public internet. That has to be closed before live payments. |
| Dashboard login | Vendor and admin sessions are bearer tokens, not a cookie that a payment form posts. CSRF on Checkout is Razorpay’s problem. Our refund and bank-change actions still need the normal authenticated API. |

## 3. What to build before any live rupee

Do these in this order. Test-mode Razorpay keys can exist while the pages are being written. Live keys wait until the gate at the bottom of this section is green.

### 3.1 Public pages

**In the repo (October 2026):** `/terms`, `/refunds`, and `/contact` ship in `web-marketing` with the same layout as `/privacy`. `Privacy.tsx` names Razorpay, Route settlement, shop PAN/GSTIN/masked bank, and that card numbers and UPI PINs are not stored. `Terms.tsx`, `Refunds.tsx`, and the footer match the locked ledger and Route hold rules. Vendor signup uses `https://www.chatlogix.in/terms` and `/privacy`. `public/sitemap.xml` lists the legal URLs.

**Still before Razorpay site review or live keys:**

1. Deploy marketing so `/privacy`, `/terms`, `/refunds`, and `/contact` return 200 over HTTPS on `www` (and apex if it serves the same app).
2. Contact: add legal name, monitored email (already `privacy@chatlogix.in`), phone, and city/postal address on `/contact` when KYC details are fixed — do not invent a street address.
3. Have counsel read `/terms`, `/refunds`, and `/privacy` (D4 in `05-compliance-and-risk.md`). Do not invent a retention period. Put counsel’s number into the privacy page when it arrives.

### 3.2 TLS

On each public host (`www`, apex, `app`, `admin`, `api`):

| Check | Pass |
|---|---|
| Certificate | Valid, name matches the host, chain complete, not expiring inside 30 days |
| HTTP | Redirects to HTTPS, including `/privacy` and `/terms` |
| Protocol | TLS 1.2 or newer. TLS 1.0 and 1.1 off |
| HSTS | Present on the marketing site and the API after you have confirmed HTTPS works, so a first visit cannot be stripped |

Razorpay Checkout is loaded from `checkout.razorpay.com`. When phase 3 adds that script to the vendor app, the content security policy must allow that host and no other payment script. Customers pay through Payment Links, which need no script. The vendor app uses Checkout for its own AI-wallet top-up and for funding a refund.

### 3.3 Close the database

Restrict 5432 and 6432 to the API host, the Lambda egress path, and the people who run migrations. A public Postgres port with a live Razorpay key in the API env is a direct path from an internet scanner to the settlement ledger. `docs/LOAD_TESTING.md` already calls this out. It becomes a launch blocker for payments, not a note.

### 3.4 Secret handling

| Secret | Rule |
|---|---|
| `RAZORPAY_KEY_SECRET`, webhook secret | Env on the API host and the password manager. Absent from git, CI logs, and the frontend bundle |
| Key id | Public in Checkout. Still not committed, so test and live stay obvious |
| Razorpay dashboard | Two people, 2FA, no shared password in chat |
| Logs | Pino redact list includes `key_secret`, `webhook_secret`, `account_number`, `pan`, `vpa`, `card`, `cvv`. A payment log line may contain payment id, transfer id, order id, amount paise, and vendor id |

`GET /health` currently returns `env.NODE_ENV`. Leave it as a liveness check. Do not add key prefixes, Razorpay mode, or balances to it.

### Gate before live keys

- Razorpay’s written Route confirmation is saved in 05, and Route is on in live mode.
- The CA’s answers on D2 and D3 are saved, and the live tax rates match them.
- Counsel’s answer on the refund-wait rule is saved, and the refund page and terms match it.
- The four public URLs return 200 over HTTPS without a login.
- Footer and signup links hit those URLs.
- Counsel has signed off on privacy, terms, and refunds.
- Database ports are not open to the internet.
- A test webhook with a bad signature is rejected, and a good one is accepted, on the production host.
- Postgres backup and restore has been tried once on a copy.

## 4. Controls inside the payment build

These are part of phases 1–10 in the implementation plan. They are listed here so a security review can tick them without rereading that plan.

### 4.1 Webhook

Copy the WhatsApp pattern.

1. Mount `POST /api/payments/razorpay/webhook` **before** `authenticate`, with `express.raw`, so the HMAC covers the exact bytes. It is the only payment webhook.
2. Compare the signature with `crypto.timingSafeEqual`. Mismatch returns 400 and credits nothing.
3. Persist `PaymentWebhookEvent` on Razorpay’s event id inside the same database transaction as the money change. Duplicate event id returns 200 and does not move money. Never insert the event row in a transaction of its own before the handler runs: a handler failure would then turn Razorpay’s retry into a “duplicate” and lose the credit. The settlement service exposes its transaction-taking functions for this (F2).
4. Return 200 only after that transaction commits. A crash before commit must return 5xx so Razorpay retries. Fetch from Razorpay’s API before the transaction opens, not inside it.
5. If `refund.processed` arrives before the refund row exists, keep the event and retry. Do not acknowledge it and drop it.
6. Dispatch on `notes.purpose` (`wallet_topup`, `wallet_autorecharge`, `order_payment`, `shop_funding`). A captured payment with an unknown purpose does not credit anything. It raises an alert.
7. For order payments, re-fetch the payment from Razorpay’s API and use that `amount`, `fee`, `tax`, `currency`, and `status`. The webhook is the trigger. The API response is the amount.
8. For transfers, refunds, and disputes, re-fetch the object and apply its current state. Razorpay can deliver webhooks out of order and more than once. An event older than the stored state is a no-op that returns 200, not a 409 that Razorpay retries forever.

### 4.2 Amounts and identity

| Attack | Control |
|---|---|
| Client posts a ₹1 link for a ₹1,000 order | Ignore `req.body.amount`. Use `Order.totalAmount`. |
| Client posts another customer’s phone | Use the order’s customer phone. |
| Vendor A requests a link for vendor B’s order | The existing `ensureOrderAccess` check stays, and the link’s `vendorId` is taken from the order row. |
| Notes on the webhook name a different order than the link we stored | Transfer only when `razorpayPaymentLinkId` matches the order’s open `PaymentLink`. |
| Transfer to the wrong shop | The linked account id comes from the order’s `Vendor` row, never from the webhook or the request. |
| Paise stored in a milli column | Convert only through `paiseToMilli`. Phase 1 tests cover `960400` and `966400` milli. |
| `Int` overflow | `Vendor.walletBalanceMilli` is a 32-bit integer and overflows near ₹21.5 lakh. Store `settlementBalanceMilli` and ledger amounts as `BigInt`. Do not “fix” an overflow by truncating. |
| Currency | Reject anything other than `INR`. |
| Second payment on an order that is already captured | Do not create another link. A capture on an already-paid order is not transferred and is refunded. |
| Cancelled order | No new link. A capture that races a cancellation is refunded, not transferred. |

### 4.3 Ledger and transfers

- One writer for settlement, one writer for the AI wallet. A code review that adds a direct `update` of either balance fails.
- Every write that reads a balance first locks the vendor row (`SELECT … FOR UPDATE` or a per-vendor advisory lock). Postgres runs these transactions as read-committed, so without the lock two concurrent credits lose one and two concurrent refunds both spend the same held money. Idempotency keys do not cover this, because the two writes have different keys.
- Money tables use `onDelete: Restrict`. Deleting an order or a shop never deletes payment, transfer, refund, or ledger rows.
- Every Razorpay write ChatLogix starts follows intent, call, confirm (rule 13). Transfers and reversals are created only after fetching the existing ones and matching on `notes`, because Razorpay has no idempotency key for them.
- The hold is measured with the database clock from `capturedAt` on the crediting transaction, not with the browser clock or the app server’s clock. The phase 1 code still takes `capturedAt` from the app or the caller (F8).
- A transfer is released only by the release job, and only when none of the blocks apply: admin freeze, open dispute, bank-change pause, refund in progress, daily cap.
- A refund is sent to Razorpay only after its cost is covered by held money or a captured `shop_funding` payment. The refund debit is written when it is funded, under the lock.
- Refunds cost the shop the gross refund, and cannot exceed the captured amount in total.

### 4.4 Bank accounts and releases

Changing the bank account is the usual takeover step: the attacker changes the account, then waits for the next release.

| Rule | Detail |
|---|---|
| Verification | Razorpay verifies the linked account and its settlement bank account. Collection starts only when the account is activated. |
| Name match | If Razorpay reports that the holder’s name does not match the shop’s legal name, a person approves before collection starts. |
| Show a mask | Last four digits and bank name. Do not return the full account number to the vendor app after save. |
| Step-up | A bank change needs a fresh phone OTP, not only a valid session. |
| Pause | After a bank change, releases pause for 48 hours from `settlementBankChangedAt`. Tell the shop on WhatsApp and email that the account changed. |
| Freeze | Admin can freeze one shop’s releases, with a reason and an audit row. An open dispute freezes automatically. |
| New shops | 7-day hold and a ₹25,000 daily release cap for the new-shop period. |
| Rate limit | About 5 bank changes per shop per day. |
| Audit | Bank change, release freeze and unfreeze, reserve change, refund, and `paymentFeeBps` edits append an audit row (who, when, old, new). Admin portal already plans `StaffAuditLog` for wallet edits. Use the same trail for these. |

### 4.5 AI-wallet top-up and auto-recharge

- Credit the intent amount only when Razorpay’s captured paise equal that intent. A mismatch credits nothing.
- Auto-recharge debits only a mandate the vendor approved, only for ₹500, ₹1,000, or ₹2,000, only when the AI wallet is under ₹100, and only one attempt is in flight.
- Record the mandate approval (who, when, amount). A failed debit notifies the vendor and does not retry in a loop.
- Auto-recharge never reads the settlement balance.

### 4.6 What the API must not do

- Accept a card number, CVV, or UPI PIN in any ChatLogix field.
- Credit from the Checkout success handler.
- Send a refund the shop has not funded, or front one from ChatLogix’s own money.
- Tell a customer a refund is approved before it has been sent to Razorpay.
- Log the webhook secret, key secret, full account number, full PAN, or full VPA.
- Put the key secret in the vendor or admin JavaScript bundle.
- Let a vendor set their own `paymentFeeBps` or reserve.
- Let staff type a new settlement balance into a form. Corrections are a reversing `adjustment` with an idempotency key, or a Razorpay refund.
- Follow a `callback_url` that is not on `chatlogix.in` or `app.chatlogix.in`.

### 4.7 Rate limits and abuse

Add limits, separate from the OTP limiter, on:

| Route | Why |
|---|---|
| Create payment link | Stops a vendor or a stolen token from minting thousands of links |
| Create top-up intent, create funding order | Same, against Checkout |
| Refund | Stops a script from firing refunds |
| Bank change | Covered above |
| Webhook | Still verify the signature. A limit only stops a flood of bad signatures from tying up the process. Valid events must not be dropped by the limit. |

## 5. After go-live

### 5.1 Every day

A job compares Razorpay’s payments, transfers, refunds, and disputes to `CustomerPayment`, `SettlementTransfer`, `CustomerRefund`, and `SettlementEntry`.

| Finding | Action |
|---|---|
| Captured at Razorpay, missing locally | Run the same credit handler. Idempotency makes a double run safe. |
| Credited locally, not captured at Razorpay | Alert. Do not delete the row by hand until someone has looked. |
| Transfer stuck in `to_create` or `releasing` | Fetch from Razorpay and finish it (rule 13). |
| Refund stuck in `submitting` | Fetch reversals and the refund by notes and finish it. |
| Refunded or disputed at Razorpay, no ledger row | Run the refund or dispute handler. |
| Sum of an order’s gross, fees, taxes, and net does not match | Alert. Do not auto-adjust. |
| A shop’s cached `settlementBalanceMilli` differs from the sum of its ledger entries | Alert. Do not auto-adjust. A lost update or a hand edit happened. |
| A shop’s held transfers at Razorpay differ from the local `on_hold` transfers | Alert. Do not auto-adjust. |

### 5.2 Alerts

| Alert | Meaning |
|---|---|
| Webhook signature failures spike | Wrong secret, or someone posting at the URL |
| Payment captured with unknown `purpose` | A Razorpay order we did not create, or notes were stripped |
| Amount mismatch on top-up or funding | Do not credit |
| Shop owes money | A lost dispute was larger than the held money. Recovered from later payments; a human looks if it stays owed. |
| Release within 48 hours of a bank change | The pause was bypassed. Page someone. |
| Refund failed at Razorpay | The reversed money is in ChatLogix’s account. Retry the refund. |
| Reversal failed for insufficient linked-account balance | The refund stays unsent. Look before retrying. |
| `paymentFeeBps` or reserve changed | Audit row, visible on the admin vendor page |
| Razorpay dispute or chargeback | The shop’s releases are frozen until the dispute is won or lost |

Turn on Razorpay’s dispute webhooks (listed in [03-razorpay-account-setup.md](./03-razorpay-account-setup.md) §4). A deducted dispute writes a `dispute_debit` and reverses held transfers. Phase 6 builds this.

### 5.3 Access and keys

- Review who can log into Razorpay every quarter. Remove people who have left.
- Rotate the key secret and webhook secret if they appear in a log, a ticket, or a chat.
- Production uses `rzp_live_` only. A boot check that refuses to start when `NODE_ENV=production` and the key id starts with `rzp_test_` is added in phase 3.
- `mockWalletTopUpEnabled` stays off wherever live keys are set.

### 5.4 Backups

The settlement ledger mirrors the shops’ money. Backups of Postgres must include the new tables, and a restore drill must show a known payment still balancing. Test the restore before the first live order, and again after the first schema change to those tables.

### 5.5 Support

People will message the shop, and the shop will message ChatLogix, asking for a card number, OTP, or UPI PIN to “finish the refund”. Staff and the bot refuse that. Refunds go to the original instrument. The only identifiers support needs are the order number and the Razorpay payment id.

## 6. Common failures and the control that stops them

| What goes wrong | What stops it |
|---|---|
| Browser says “paid”, webhook never arrives, shop thinks it was paid | UI polls our row. The row changes only from the webhook or the daily fetch. |
| Razorpay retries the webhook and the shop is credited twice | Unique event id and unique `razorpayPaymentId` on the credit. |
| JSON parser runs first, signature never matches, someone disables the check to make it work | Raw body mounted like the WhatsApp webhook, and a test that flips one byte. |
| Webhook URL sits behind login, every event is 401, then someone removes auth and also removes the signature check | Public route plus a required valid signature. A missing signature is a 400. |
| Attacker replays a captured body days later | Event id already stored. Second call is a no-op. |
| Refund webhook arrives before the refund row is saved | Event stays unacknowledged and is retried. |
| Event row stored, handler crashes, Razorpay’s retry is dropped as a duplicate | Event row and money change commit in one transaction. |
| Customer pays, order was cancelled a second earlier | Capture is refunded, not transferred. |
| Two links, customer pays both | Only one link is ever open. A second capture is refunded, not transferred. |
| Vendor edits the link amount in the browser | Server uses `Order.totalAmount`. |
| Paise treated as millirupees, shop is underpaid 10× | Conversion only in `paiseToMilli`, with unit tests on the ₹1,000 example. |
| Balance wraps past 32-bit | `BigInt` for settlement. |
| Transfer created twice after a retry | Fetch the payment’s transfers and match `notes.settlementTransferId` before creating. |
| Release job runs twice, or two jobs overlap | Transfer moves to `releasing` under the lock; the second run skips it. |
| Two refunds at once spend the same held money | Vendor lock; the coverage check runs after it. |
| Held money released while a refund needs it | Releases pause while a refund is awaiting funding or sending. |
| Shop presses Refund with no money held, customer is told it is coming | The refund is a draft until funded; the bot says nothing until it is sent. |
| Reversal fails because the transfer already settled | The refund stays unsent and is planned only from held transfers; the shortfall is funded first. |
| Stolen vendor session changes bank and waits for the next release | Phone OTP on bank change, 48-hour release pause, WhatsApp and email notice. |
| Refund larger than what was captured | Sum of refunds capped at `amountPaise`. |
| Platform fee quietly returned, or taken twice | Fee stored once on the payment row. The refund costs the gross only. No code path adds the fee back. |
| Order net dropped into the AI wallet and a refund shuts the bot off | Separate money and a test that `walletBalanceMilli` is unchanged. |
| COD marked collected and also credited as if Razorpay received it | COD writes no settlement entry and no transfer. |
| Order or shop deleted, ledger history goes with it | `onDelete: Restrict` on money tables. |
| A new `BigInt` column crashes a route that returns a whole row | Routes `select` fields. Settlement amounts go out as strings. |
| Shop collects, is paid, never delivers; chargebacks arrive later | 7-day hold and daily cap for new shops, freeze on dispute, recovery from later payments, terms that allow it. |
| Test key in production, or live key in a laptop `.env` that gets committed | Boot check on key prefix. `.env` stays gitignored. `.env.example` has empty values. |
| Secret printed in an error log | Redact list, and a test that a logger call containing a fake secret does not write it. |
| Customer asked to type their card into WhatsApp | Bot and templates send a Razorpay link only. No card fields in our UI. |
| Shop owner told to share an OTP with support | Support script refuses. |

## 7. Order of work

| Step | Done when |
|---|---|
| 0. Route requested; questions sent to Razorpay, the CA, and counsel | Sent and dated in [05-compliance-and-risk.md](./05-compliance-and-risk.md) |
| 1. Public pages and footer | `/privacy`, `/terms`, `/refunds`, `/contact` are HTTPS and linked |
| 2. Counsel pass on those pages | Written ok to publish |
| 3. TLS check and database ports closed | Certificate and firewall evidence saved with the go-live notes |
| 4. Phases 0–2 of the implementation plan | Signed webhook works on the production host in test mode |
| 5. Phase 3 AI-wallet top-up in test mode | One test payment, one replay, balance moves once |
| 6. Razorpay live KYC, using the real URLs | Live keys issued |
| 7. Razorpay’s Route confirmation in; phases 5–7 in test; then the live checks in the Razorpay setup doc on a founder-owned shop | Go-live checklist in the Razorpay setup doc |
| 8. First real shop | Opt-in, linked account activated, one small order, refund drill on that payment, daily reconciliation has run once |

Steps 1–3 are not payment features. They are the reason Razorpay, and a later dispute, will treat ChatLogix as a real business. Do them before asking Razorpay for live keys. Tick the **Stage 0 ops checks** table at the top of this doc when each row is verified.
