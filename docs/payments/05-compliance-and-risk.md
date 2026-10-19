# Decisions, outside confirmations, and vendor KYC

**Status:** Decisions D1–D5 final, 2026-10-19. Three outside confirmations are still owed: Razorpay, the CA, and counsel. Not legal or tax advice.  
**Index:** [README](./README.md). **Flows:** [01-business-flow.md](./01-business-flow.md). **Build phases:** [02-implementation-plan.md](./02-implementation-plan.md). **Controls:** [04-security-and-go-live.md](./04-security-and-go-live.md).

This file records why the design is what it is, and what has to come back from outside before live money moves. When a confirmation arrives, paste it under its decision with the date. If it changes anything, update [01-business-flow.md](./01-business-flow.md), [02-implementation-plan.md](./02-implementation-plan.md), and the matching `.cursor/plans/stage_*` file in the same change.

## Stage 0 — sent / pending reply (owner tracking)

Record dates when each email goes out. **Do not** mark a row as replied until the written answer is pasted below. Stage 0 code is done when these sections are ready for the owner to send and paste replies later.

| Recipient | Questions | Email sent (YYYY-MM-DD) | Written reply |
|---|---|---|---|
| Razorpay (account owner email) | D1 — Route enablement + six questions below | _Pending_ | _Pending — paste below under D1 when received_ |
| CA | D2 — TCS/TDS applicability, base, refunds, shop GST | _Pending_ | Dev defaults recorded 2026-10-19 under D2; CA reply still **pending for live** |
| CA | D3 — GST on gateway fee passed to shop | _Pending_ | Dev defaults recorded 2026-10-19 under D3; CA reply still **pending for live** |
| Counsel | D4 — refund-wait rule + review of `/terms`, `/refunds`, `/privacy` | _Pending_ | _Pending — paste below under D4 when received_ |

**Owner checklist (manual):** create Razorpay business in Test Mode; request Route; send the three emails on day one; store `rzp_test_` keys in the password manager and server env (not git).

## Summary

| # | Decision | Answer (2026-10-19) | Still owed | Blocks until it arrives |
|---|---|---|---|---|
| D1 | Who holds the money | Razorpay Route. Released money settles to the shop automatically. | Razorpay’s written confirmation | Applying the settlement migration, phases 5–7 |
| D2 | GST TCS and 194-O TDS | Built in, rates configurable | CA: whether they apply, on what base, how refunds adjust them | Live rates, phase 10 reports |
| D3 | GST on the platform fee | The fee includes its GST | CA: GST treatment of the gateway fee passed to the shop | Phase 10 invoices |
| D4 | Who bears a loss | 7-day hold for new shops, daily cap, admin freeze, auto-freeze on dispute, optional reserve. Refunds wait for the shop’s funds. | Counsel: the refund-wait rule | Live keys |
| D5 | Order lifecycle | `awaiting_payment` status. Each shop chooses whether the bot sends the link. The shop decides what happens on expiry. | — | — |

Phases 0, 2, 3, and 4 (the AI wallet) do not wait on any of these.

## D1 — Who holds the money

**Answer: Razorpay Route.** Each opted-in shop is a Route linked account under ChatLogix’s Razorpay business. ChatLogix collects the customer’s payment, keeps its fees and the withheld taxes, and transfers the shop’s net to the linked account **on hold**. When the hold ends, ChatLogix releases it and Razorpay settles it to the shop’s bank on its normal linked-account schedule. There is no Withdraw button and no RazorpayX account in v1.

**Why.** The earlier design kept every shop’s money in ChatLogix’s own account and paid it out on request. That is collecting and holding funds for third parties, which RBI’s Payment Aggregator Directions (15 September 2025) regulate, and which needs authorisation for a non-bank. With Route, Razorpay is the authorised aggregator and holds the money. ChatLogix is the platform that instructs the transfers.

What the change removes: RazorpayX, the Withdraw button, `VendorPayout`, payout fees, `queue_if_low_balance`, the second webhook URL and its secret, and the ₹100 minimum withdrawal.

| Earlier design | Route design |
|---|---|
| Net credited to a ChatLogix-held balance, pending 48 hours | Net transferred to the shop’s linked account with `on_hold: true` |
| Hold ends, money becomes withdrawable | ChatLogix sets `on_hold: false`; Razorpay settles to the shop’s bank |
| Withdraw button, RazorpayX payout | None |
| Refund debits the balance, which may go negative | Reverse held transfers, then refund. A shortfall is paid by the shop first. |
| Lost dispute debits the balance | Reverse held transfers. The rest is owed and taken from later transfers. |

Razorpay’s API supports changing a transfer’s hold after it is created (`PATCH /v1/transfers/:id`), and a refund can reverse a payment’s transfers first. A reversal needs money in the linked account, so once a transfer has settled to the shop’s bank it usually cannot be pulled back. That is why a refund the shop’s held money cannot cover waits for the shop to fund it (D4).

**Confirm with Razorpay.** Send these from the account owner’s email and paste the reply below.

1. Please enable Route for ChatLogix. ChatLogix is WhatsApp commerce software. When a shop opts in, ChatLogix collects the customer’s order payment through a Payment Link and transfers the shop’s net to the shop’s linked account.
2. Can a transfer from a Payment Link payment be created with `on_hold: true`, stay on hold for up to 30 days, and be released later with `PATCH /v1/transfers/:id` and `on_hold: false`? Is there a maximum hold?
3. Can ChatLogix reverse a held transfer from one payment to fund a refund of another payment for the same linked account? What happens to a reversal after the transfer has settled and the linked account has no balance?
4. When a payment with a transfer is disputed, which account is debited, and when (`amount_deducted`)?
5. What KYC does a linked account need? Can a shop without a GSTIN be one? How does a shop change its settlement bank account, and does Razorpay verify the new one?
6. For linked accounts, does Razorpay deduct or report GST TCS or 194-O TDS, or is that ChatLogix’s duty as the platform?

**Razorpay written reply (paste here):** _Pending — see Stage 0 tracking table above for sent date._

If Razorpay will not enable Route for this use, stop phases 5–7 and reopen D1. The fallback is the earlier held-balance design with RazorpayX withdrawals, and it needs counsel on the RBI rules before anything is built.

## D2 — E-commerce operator tax

**Answer: build it in, with configurable rates.** When ChatLogix collects the payment for a shop’s sale, ChatLogix is likely an e-commerce operator for both GST and income tax. The rules as published at October 2026:

| Tax | Rule | Rate | Base | Duty |
|---|---|---|---|---|
| GST TCS | CGST Act s.52 | 0.5% since 10 July 2024 (0.25% CGST + 0.25% SGST, or 0.5% IGST) | Net value of taxable supplies through the platform | Collect, deposit, and file GSTR-8 by the 10th of the next month. The shop claims it as credit. |
| TDS | Income-tax Act s.194-O | 0.1% of the gross sale; 5% when the shop has given no PAN or Aadhaar | Gross order amount, before ChatLogix’s fees | Deduct and deposit. The shop claims it in its return. |

How it is built:

- `PlatformSettings` holds `gstTcsBps` (default `50`), `tds194oBps` (default `10`), and `tds194oNoPanBps` (default `500`). Admins edit them on the web-admin `/billing` page. They are read through the usual `PlatformSettings` path. Setting a rate to `0` turns that tax off.
- Each captured payment stores `gstTcsPaise` and `tdsPaise`, computed on `amountPaise`, rounded to the nearest paise. The CA may rule that the TCS base excludes the shop’s own GST; if so, the base changes and the rates stay.
- Withheld amounts stay in ChatLogix’s account. They are never transferred to the shop. Finance deposits them monthly from the phase 10 reports.
- PAN is required to opt in, so the no-PAN rate applies only when Razorpay or the tax portal reports a PAN as invalid or inoperative.

```text
netPaise = amountPaise − gatewayCostPaise − platformFeePaise − gstTcsPaise − tdsPaise
```

On a ₹1,000 order at the default rates, TCS is ₹5.00 and TDS is ₹1.00, and the shop’s net is ₹960.40 instead of ₹966.40.

**Confirm with the CA:**

1. Does ChatLogix become an e-commerce operator for GST TCS and for 194-O TDS when a shop opts in, given that Razorpay Route holds and settles the money?
2. Is the TCS base the order amount, or the order amount less the shop’s GST?
3. Must shops selling through ChatLogix register for GST? Which exemptions cover small or unregistered shops?
4. When an order is refunded, in the same month or a later one, how are TCS and TDS adjusted, and is any of it returned to the shop?

**CA written answer — D2 (paste here):** _Pending for live — replace this block when the CA’s written reply arrives._

**Implementation defaults (2026-10-19, until the CA confirms for live keys):**

1. **Applicability.** ChatLogix treats itself as the e-commerce operator for both GST TCS (CGST Act s.52) and 194-O TDS when a shop opts in to Route collection. Razorpay holding the money does not change that duty in the product model.
2. **Rates (`PlatformSettings`).** `gstTcsBps = 50` (0.5% TCS), `tds194oBps = 10` (0.1% TDS with PAN), `tds194oNoPanBps = 500` (5% when PAN is missing, invalid, or inoperative). A rate of `0` turns that tax off.
3. **TCS base.** Full customer order amount (`amountPaise`), not net of the shop’s own GST component, until the CA rules otherwise.
4. **TDS base.** Gross order amount before ChatLogix fees (same as `amountPaise` today).
5. **Refunds.** Refunds do **not** return withheld TCS or TDS to the shop. Same-month refunds still reduce the GSTR-8 supply base in reports; withheld amounts are not credited back on the ledger unless the CA later requires it.
6. **Shop GST registration.** Unchanged from vendor KYC: GSTIN or an exemption declaration at opt-in.

If the CA later says refunds should return TCS or TDS to the shop, phase 10 credits it back as an `adjustment` when the month’s report is closed.

## D3 — GST on ChatLogix’s fees

**Answer: the platform fee includes its GST.** On a 1% fee of ₹10.00, ChatLogix’s revenue is ₹8.47 and GST is ₹1.53. The shop’s net does not change.

```text
platformFeeGstPaise = round(platformFeePaise × 18 / 118)
```

`platformFeeGstPaise` is stored on each payment for the monthly invoice (phase 10). The shop never sees a separate GST deduction.

**Confirm with the CA:** ChatLogix receives Razorpay’s GST invoice for the gateway fee and deducts that fee from the shop’s net. Is passing it on a pure-agent reimbursement, or part of ChatLogix’s taxable service to the shop?

**CA written answer — D3 (paste here):** _Pending for live — replace this block when the CA’s written reply arrives._

**Implementation default (2026-10-19, until the CA confirms for live keys):**

- **Platform fee invoice (phase 10).** ChatLogix invoices each shop monthly for **platform fees only**, showing taxable value and `platformFeeGstPaise` (fee includes 18% GST). Gateway fee and Razorpay’s GST on that fee are **not** lines on that invoice.
- **Pass-through treatment.** Deducting Razorpay’s gateway fee (fee + GST) from the shop’s net before transfer is treated as a **pure-agent reimbursement** of Razorpay’s charge, not as part of ChatLogix’s taxable platform service. The shop still sees gateway fee and tax on the order-payments statement; they are not re-labeled as ChatLogix revenue on the monthly fee invoice.
- **If the CA disagrees.** If counsel/CA classifies the pass-through as taxable to the shop, phase 10 invoice layout and GST reporting must be updated before the first live month closes; do not change capture math until then.

## D4 — Who bears a loss

**Answer:**

| Control | Rule |
|---|---|
| Hold | 48 hours from capture. **7 days** while the shop is new: the first 30 days after `collectionStartedAt`, or the first 20 captured orders, whichever ends later. |
| Daily release cap | While the shop is new, at most ₹25,000 is released per calendar day (IST). The rest waits for the next day. |
| Admin freeze | An admin can stop releases for one shop, with a reason and an audit row. |
| Auto-freeze on dispute | An open dispute stops all of the shop’s releases until it is won or lost. |
| Rolling reserve | Off by default. An admin can set `rollingReserveBps` for one shop. That share of each net goes in a separate transfer held for 30 days. |
| Bank change | Needs a fresh phone OTP. Releases pause for 48 hours afterwards, and the shop is told on WhatsApp and email. |
| Refund the held money cannot cover | **The shop pays the shortfall first.** ChatLogix never fronts a refund. The customer waits until the shop funds it. |
| Lost dispute | Recovered from the shop’s held transfers. Whatever is left is owed, taken from the shop’s next order payments, and payable by the shop at any time. |
| Shop turns collection off or leaves | No new links. Held money is released on schedule unless a freeze applies. Anything owed is invoiced. Ledger rows are kept. |

**The refund-wait rule and consumer law.** India’s Consumer Protection (E-Commerce) Rules, 2020 require an e-commerce entity to pay accepted refund requests within a reasonable time. To keep the shop-funds-first rule inside that, a refund is accepted only when it is funded:

- The shop’s Refund action and the funding are one step. If the held money is short, the shop sees “Add ₹X to send this refund” and pays by Razorpay Checkout on the dashboard. The refund goes to Razorpay when that payment lands.
- An unfunded refund is a draft. It expires after 24 hours, and the shop’s releases resume.
- The bot never tells a customer that a refund is approved until it has been sent to Razorpay. For a customer’s own refund request, it says the shop will confirm.

**Confirm with counsel:** Is “refund sent when the shop approves and funds it” compatible with the E-Commerce Rules, and what must the refund page and the terms say about it?

**Counsel written answer — D4 (paste here):** _Pending — see Stage 0 tracking table above for sent date._

The terms page ([04-security-and-go-live.md](./04-security-and-go-live.md) §3.1) must say that ChatLogix may hold or delay releases for refunds, disputes, bank changes, and suspected fraud; that the shop funds refunds its held money cannot cover; and that anything the shop owes is recovered from later payments or invoiced.

## D5 — Order lifecycle when collection is on

**Answer:**

| Moment | What happens |
|---|---|
| Customer confirms in chat, collection on, not COD | Order status is `awaiting_payment`. If the shop’s `paymentLinkAutoSend` is on (the default), the bot sends the link. If it is off, the shop presses Send. |
| Before payment | The shop sees the order as awaiting payment and does not prepare it. It can switch the order to COD. |
| Payment captured | Order moves to `confirmed`. The customer gets a paid confirmation. |
| Cart changes before payment | The open link is cancelled at Razorpay. A new link for the new total goes out, from the bot or the shop according to the setting. An order never has two open links. |
| Two hours before expiry | One reminder to the customer. |
| Link expires unpaid | The order stays `awaiting_payment`. The shop is told, and chooses to resend, switch to COD, or cancel. |
| Payment lands on a cancelled or already-paid order | It is refunded through Razorpay and not transferred. ChatLogix bears the gateway fee on it. |
| Last customer message older than 24 hours | The link and the reminder go as an approved WhatsApp utility template. |

`awaiting_payment` is a new `OrderStatus` value. Adding it touches the CartEngine, every `switch` and filter on `OrderStatus` in the backend and `frontend_v2`, the order-recovery sweep, and notifications. Update [INCOMING_RESPONSE_GENERATOR_FLOW.md](../INCOMING_RESPONSE_GENERATOR_FLOW.md) in the same change.

## Vendor KYC

A shop gives these when it turns collection on. ChatLogix sends them to Razorpay to create the linked account, and keeps the tax fields for the TCS and TDS reports.

| Field | Why | Kept by ChatLogix |
|---|---|---|
| Legal name and business type | Linked account, bank-name match | Yes |
| PAN | Linked account, 194-O TDS | Yes, encrypted like WhatsApp tokens |
| GSTIN, or a declaration that the shop is exempt | Linked account, GST TCS | Yes |
| Settlement bank account (number, IFSC, holder name) | Route settlement | Masked only |
| Contact name, phone, email | Linked account | Already on `Vendor` |

Razorpay verifies the linked account and its bank account. If Razorpay reports that the account holder’s name does not match the legal name, a person approves before collection turns on.

## Sources

- [RBI, Regulation of Payment Aggregators Directions, 2025](https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=12896)
- [AZB & Partners summary of the 2025 directions](https://www.azbpartners.com/bank/rbi-issues-consolidated-reserve-bank-of-india-regulation-of-payment-aggregators-directions-2025/)
- [Razorpay Route: modify settlement hold](https://razorpay.com/docs/api/payments/route/modify-settlement-hold)
- [Razorpay Route: reversals](https://razorpay.com/docs/payments/route/reversal)
- [Razorpay Route: refund payments and reverse transfers](https://razorpay.com/docs/sg/api/payments/route/refund-payments-and-reverse-transfer)
- [Consumer Protection (E-Commerce) Rules, 2020](https://www.legitquest.com/act/consumer-protection-e-commerce-rules-2020/91C8)
- [GST TCS under section 52](https://www.patronaccounting.com/blog/tcs-section-52-ecommerce-gst-explained)
- [Section 194-O TDS](https://cleartax.in/s/section-194o)

The tax sources are practitioner summaries. Confirm rates and thresholds against the CBIC notifications and the Income-tax Act before relying on them.
