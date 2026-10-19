# Razorpay account setup

**Status:** Runbook for the final design in [01-business-flow.md](./01-business-flow.md), 2026-10-19.  
**Build order:** [02-implementation-plan.md](./02-implementation-plan.md) phase 0 uses this document.

Open **one** Razorpay business for ChatLogix. Turn on the Payment Gateway, Payment Links, and Route on that business. Customer order payments, AI-wallet top-ups, shop funding for refunds, refunds, and shop settlements all use it. Each opted-in shop becomes a Route linked account under this business. Shops do not open their own Razorpay merchant accounts and do not get a Razorpay login.

Use **test mode** until KYC is approved and phase 2 verifies a webhook signature. Test and live keys are different. A `rzp_test_` key never moves real rupees.

## Products to activate

| Product | Why | Needed before |
|---|---|---|
| Payment Gateway | UPI, cards, netbanking | Any real or test payment |
| Webhooks | The only credit path | Phase 2 |
| Orders + Checkout | AI wallet top-up, auto-recharge registration, and shop funding for refunds | Phase 3 |
| UPI Autopay | AI wallet auto-recharge. Ask Razorpay to enable it if the dashboard hides it. | Phase 4 |
| Payment Links | The WhatsApp link on an order | Phase 5 |
| Route | Linked account per shop, held transfers, releases, reversals | Phase 5 |
| Refunds, normal speed | Cancellations and returns | Phase 6 |

RazorpayX is not used in v1. Shops are paid by Route settlement, not by payouts.

**Request Route in phase 0, and get it confirmed in writing.** Route is Razorpay’s product for a platform that collects for its sellers, and it keeps ChatLogix out of holding shops’ money itself (RBI’s Payment Aggregator Directions; see D1 in [05-compliance-and-risk.md](./05-compliance-and-risk.md)). Send the six D1 questions from the account owner’s email and paste the reply into 05. Phases 5–7 do not start until it arrives. Do not apply the settlement migration before then.

## 1. Create the business

1. Sign up at [https://dashboard.razorpay.com/signup](https://dashboard.razorpay.com/signup) with a ChatLogix company email, not a personal Gmail that nobody else can recover.
2. Business type must match the legal entity that will receive settlements (private limited, LLP, partnership, or proprietorship).
3. Stay in **Test Mode** (toggle in the dashboard) until the steps below say to switch.

Add a second owner or admin on the account so one person leaving does not lock refunds and settlements.

## 2. KYC for live mode

Razorpay will not enable live keys until this is accepted. Start it in parallel with test-mode development. Typical requirements:

| Item | Notes |
|---|---|
| Business PAN | Entity PAN, not only the founder’s personal PAN, when the entity is a company or LLP |
| GSTIN | If registered. If not registered, Razorpay asks for the declaration they currently publish. |
| Bank proof | Cancelled cheque or statement for the **ChatLogix operating** account. ChatLogix’s own share (platform fees, withheld TCS and TDS, shop funding) settles here. Shops’ shares settle to their own banks through Route. |
| Signatory | PAN and Aadhaar of the authorized signatory, plus board resolution or the equivalent they request |
| Website | `https://chatlogix.in` must be public and must include About, Contact (email and phone), Privacy policy, Terms, and a Refund and cancellation policy |
| What the business does | WhatsApp commerce software for shops. When a shop opts in, ChatLogix collects the customer’s order payment, keeps a platform fee, and transfers the shop’s share to the shop’s Route linked account, held for 48 hours (7 days for new shops). |

The refund policy page should match the product: refunds go back to the original UPI or card, the shop’s platform fee is not returned, a refund is sent once the shop approves and funds it, and cash-on-delivery refunds are handled by the shop.

Activation often fails on a website that is login-only or missing a contact page. The marketing site has to stand on its own.

## 3. Test API keys

In Test Mode: **Account & Settings → API Keys → Generate Key**.

| Env name | Value |
|---|---|
| `RAZORPAY_KEY_ID` | `rzp_test_…` |
| `RAZORPAY_KEY_SECRET` | shown once |

Put them in `backend/.env` on the machine that runs the API. Add the names with empty values to `backend/.env.example` in phase 0. Do not commit the secret. Do not paste it into a GitHub Actions log.

Test instruments Razorpay publishes (confirm on their current test-card page before a demo, the list does change):

| Instrument | Success |
|---|---|
| Card | `4111 1111 1111 1111`, any future expiry, any CVV |
| UPI | `success@razorpay` |
| UPI failure | `failure@razorpay` |

## 4. Webhooks

Create the webhook in Test Mode first, then create it again in Live Mode. They are separate. There is one webhook URL; there is no RazorpayX webhook.

| Field | Value |
|---|---|
| URL | `https://api.chatlogix.in/api/payments/razorpay/webhook` |
| Secret | Generate a long random string. Store as `RAZORPAY_WEBHOOK_SECRET`. This is not the key secret. |
| Alert email | A ChatLogix inbox that a person reads |

Until `api.chatlogix.in` points at this API, use the host that actually serves Express (`chatlogix-backend` on PM2). The path stays `/api/payments/razorpay/webhook`.

Events to enable:

| Event | Why |
|---|---|
| `payment.captured` | Credit the AI wallet, a shop funding payment, or an order payment (by `notes.purpose`) |
| `payment.failed` | Tell the customer, resend the link |
| `order.paid` | Backup for Checkout top-ups and shop funding |
| `payment_link.paid` | Order link completed |
| `payment_link.expired` | Tell the shop the order is still awaiting payment |
| `refund.processed` | Mark the refund done and tell the customer |
| `refund.failed` | Surface the failure to ops |
| `payment.dispute.created` | Freeze the shop’s releases (phase 6) |
| `payment.dispute.lost` | Recover the disputed amount from the shop |
| `payment.dispute.won`, `payment.dispute.closed` | Lift the freeze; return the amount if it was deducted |
| Transfer events (`transfer.processed`, `transfer.failed`) | Confirm a Route transfer was created, or retry it |
| Linked-account events (`account.*`) | Follow each shop’s linked-account status (phase 5) |
| `token.confirmed`, `token.rejected` | Auto-recharge mandate approved or refused (phase 4) |
| `token.paused`, `token.cancelled` | Turn auto-recharge off and tell the vendor |

Check the dispute, transfer, linked-account, and token event names against the dashboard’s webhook event list when you create the webhook. Token events appear only after UPI Autopay is enabled, and transfer and account events only after Route is enabled.

Razorpay can deliver webhooks out of order and more than once. The handler fetches the object from the API and applies its current state. See [02-implementation-plan.md](./02-implementation-plan.md) rule 12.

The route is public. Signature verification is the authentication. Today `paymentsRouter` is mounted with the user JWT middleware in `backend/src/index.ts`. Phase 2 mounts the webhook path **before** that middleware. A webhook that receives 401 will be retried by Razorpay and will never credit anyone.

Local development: a tunnel to the local API, and the test-mode webhook URL pointed at the tunnel. Do not point the live webhook at a laptop.

## 5. AI wallet top-up (phase 3)

No extra Razorpay product beyond Orders and Checkout.

In the dashboard, nothing is split and nothing is held. A ₹500 top-up creates a ₹500 order (50,000 paise). The captured webhook credits ₹500 to the AI wallet. Razorpay’s fee on that payment is ChatLogix’s cost.

After the first successful test payment, set `WALLET_PAYMENT_PROVIDER=razorpay` only on the environment you are testing. Leave local dev on `mock` unless you are deliberately exercising Checkout. Turn off `mockWalletTopUpEnabled` on the admin billing page for any environment that uses live keys.

## 6. UPI Autopay (phase 4)

Ask Razorpay to enable UPI Autopay on the account if **Recurring / UPI Autopay** is not in the dashboard. This is a separate switch from one-time UPI.

The vendor approves a mandate for the amount they picked (₹500, ₹1,000, or ₹2,000). Later debits require Razorpay’s pre-debit notification, sent at least 24 hours before the charge. The implementation plan schedules the debit at 25 hours. Do not configure a Razorpay Subscription on a calendar, because the trigger is “AI wallet under ₹100”, not “bill on the 1st”.

## 7. Route linked accounts (phases 5 and 7)

1. After Razorpay enables Route and confirms the D1 questions, create one test linked account for a founder-owned test shop, with a founder bank account. Use Razorpay’s linked-account API, the same path the opt-in screen will use.
2. Take a test payment on a Payment Link, transfer the net to that linked account with `on_hold: true`, then release it with `PATCH /v1/transfers/:id`. Confirm the transfer state in the dashboard.
3. Reverse part of a held transfer and refund the payment. Confirm the reversal and the refund in the dashboard.
4. A shop’s settlement bank account belongs to its linked account. Changes go through Razorpay’s API, and Razorpay verifies the new account. The shop never gets a Razorpay login.
5. Keep enough balance in the ChatLogix account for refunds in flight. A refund is paid from ChatLogix’s account and recovered from the shop by reversal or funding, so a short balance can make a refund fail.

## 8. Go-live checklist

The legal pages, TLS check, and database firewall are launch blockers. They are listed in [04-security-and-go-live.md](./04-security-and-go-live.md). Do not request live keys until that gate is green.

Switch the dashboard to **Live Mode** and generate a second key pair (`rzp_live_…`). Recreate the webhook in live mode with a new secret. Update production env. Restart the API process so it reads the new values.

| Check | Expected |
|---|---|
| Razorpay’s Route confirmation | Saved in [05-compliance-and-risk.md](./05-compliance-and-risk.md). Route is on in live mode. |
| CA’s answers on D2 and D3 | Saved in 05. Live `gstTcsBps` and `tds194oBps` match them. |
| Counsel on the refund-wait rule | Saved in 05. The refund page and terms match it. |
| Live key id prefix | `rzp_live_` |
| Webhook URL | Production host, HTTPS, path `/api/payments/razorpay/webhook` |
| Test event from the Razorpay dashboard | HTTP 200 from the app, one `PaymentWebhookEvent` row |
| `mockWalletTopUpEnabled` | Off in that environment |
| `WALLET_PAYMENT_PROVIDER` | `razorpay` |
| AI top-up of the minimum (₹100) with a real UPI | `walletBalanceMilli` increases once |
| Replay of that webhook from the dashboard | Balance does not increase again |
| Founder-owned test shop, linked account activated | Collection turns on |
| ₹100 order payment on that shop | Held transfer equals amount minus real `fee+tax`, platform fee, TCS, and TDS. AI wallet unchanged. |
| Refund of that payment | Customer instrument is credited by Razorpay. The held transfer is reversed. Platform fee still not returned. |
| A second ₹100 order left to finish its hold | Released after the new-shop hold, and the money reaches the founder bank |

Keep test keys in local `.env`. Production holds only live keys.

## 9. Who can see the secrets

| Secret | Store |
|---|---|
| Key secret, webhook secret | Server env on the API host, and the password manager |
| Key id | Server env. It is public in Checkout, and it is still not committed. |
| Founder Razorpay login | Password manager, two admins, 2FA on |

Rotate the key secret if it appears in a chat, a ticket, or a shell history. Webhook secrets rotate from the dashboard; update env in the same change and restart the API.
