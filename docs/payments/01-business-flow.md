# Business flow — order payments, refunds, and the AI wallet

**Status:** Final 2026-10-19. Not implemented. Decisions and the confirmations still owed: [05-compliance-and-risk.md](./05-compliance-and-risk.md).  
**Index:** [README](./README.md). Razorpay setup: [03-razorpay-account-setup.md](./03-razorpay-account-setup.md). Build order: [02-implementation-plan.md](./02-implementation-plan.md).

ChatLogix has two kinds of money for every shop that opts in.

| Money | What the shop sees | What it is for |
|---|---|---|
| AI wallet | The balance already on `/wallet` | Replies, catalog AI, trial, manual top-up, auto-recharge |
| Order payments | A separate “Order payments” page | Customer payments held at Razorpay for the shop, until they are released to the shop’s bank |

The AI wallet can be ₹50 while the shop has ₹966.40 on hold, or the other way around. Spending on replies does not touch order payments. A customer refund does not touch the AI wallet.

## Who does what

| Person | Role |
|---|---|
| Shop | Turns on “ChatLogix collects payments” and completes KYC. Chooses whether the bot sends payment links. Issues refunds, and funds any refund its held money cannot cover. Sets auto-recharge on the AI wallet if it wants it. |
| Admin | Sets `paymentFeeBps` and, if needed, a rolling reserve for the shop. Can freeze a shop’s releases. Does not edit balances by hand. |
| Customer | Pays a WhatsApp link, or pays cash on delivery. Asks for a refund in chat. |
| Razorpay | Takes the card or UPI payment and reports the real fee. Holds each shop’s money in its Route linked account. Settles released money to the shop’s bank. Sends refunds back to the same instrument. |

## 1. Shop turns collection on

Collection is off until the shop opts in.

**Off.** The bot can still place the order. The customer pays the shop directly (its own UPI, if saved) or cash on delivery. ChatLogix does not create a Razorpay link, transfers nothing, and charges no platform fee.

**On.** The shop gives its legal name, business type, PAN, GSTIN or an exemption declaration, and a settlement bank account. ChatLogix creates the shop’s Route linked account at Razorpay. Razorpay verifies the details and the bank account. Collection starts only when Razorpay activates the account. That moment is `collectionStartedAt`, which starts the new-shop period (§2, Hold).

If Razorpay reports that the bank account holder’s name does not match the legal name, a person approves before collection starts.

Cash on delivery stays available after opt-in. A COD order transfers nothing, because the cash never reached ChatLogix.

## 2. Customer pays an order

1. The customer confirms the order in chat. `Order.totalAmount` is in paise. The order’s status is `awaiting_payment`.
2. ChatLogix creates one Razorpay Payment Link for that amount. If the shop’s auto-send setting is on (the default), the bot sends it on WhatsApp. If it is off, the shop presses Send on the order.
3. The customer pays by UPI, card, or netbanking. Razorpay notifies ChatLogix with a signed webhook.
4. ChatLogix reads the fee Razorpay actually charged (`fee` and `tax`, both paise) and works out the split:

```text
gatewayCostPaise    = gatewayFeePaise + gatewayTaxPaise
platformFeePaise    = ceil(amountPaise × paymentFeeBps / 10000)     includes its GST
platformFeeGstPaise = round(platformFeePaise × 18 / 118)            for the invoice only
gstTcsPaise         = round(amountPaise × gstTcsBps / 10000)
tdsPaise            = round(amountPaise × tds194oBps / 10000)
netPaise            = amountPaise − gatewayCostPaise − platformFeePaise − gstTcsPaise − tdsPaise
creditMilli         = netPaise × 10
```

`gstTcsBps` and `tds194oBps` come from `PlatformSettings` (defaults 50 and 10). A rate of 0 turns that tax off.

5. ChatLogix transfers the net to the shop’s linked account, **on hold**. ChatLogix keeps the platform fee, the TCS, and the TDS in its own account. Razorpay has already kept its fee.
6. The order moves to `confirmed`. The customer gets a short WhatsApp confirmation. The shop sees the order as paid and the net as on hold.

There is no second deduction later. The shop never sees ₹1,000 land and then lose ₹39.60.

### ₹1,000 order, 1% platform fee, Razorpay list price

| | Default tax rates | TCS and TDS at 0 |
|---|---:|---:|
| Customer pays | ₹1,000.00 | ₹1,000.00 |
| Razorpay fee + GST | ₹23.60 | ₹23.60 |
| ChatLogix platform fee (includes ₹1.53 GST) | ₹10.00 | ₹10.00 |
| GST TCS 0.5% | ₹5.00 | — |
| TDS 194-O 0.1% | ₹1.00 | — |
| Transferred to the shop, on hold | **₹960.40** | **₹966.40** |
| AI wallet | unchanged | unchanged |

If Razorpay’s fee on that payment is different from ₹23.60, the transfer changes by the same difference. The platform fee stays ₹10.00 while `paymentFeeBps` is 100. The shop claims the TCS and TDS in its own returns.

A payment whose fees are greater than or equal to the order amount is captured at Razorpay and **not** transferred. That case is an ops alert, not a negative credit.

If the shop owes ChatLogix money from a lost dispute (§4), the transfer is reduced by up to the amount owed before anything goes on hold.

### Hold and release

| Shop | Hold |
|---|---|
| Standard | **48 hours** of real time from capture, including Saturday and Sunday. A Friday 18:00 capture is released on Sunday 18:00. |
| New: the first 30 days after `collectionStartedAt`, or the first 20 captured orders, whichever ends later | **7 days** |

When the hold ends, ChatLogix releases the transfer and Razorpay settles it to the shop’s bank on its normal linked-account schedule. ChatLogix shows when the money was released. It does not promise a bank arrival time.

A release waits when:

| Reason | Until |
|---|---|
| An admin froze the shop’s releases | The admin lifts the freeze |
| The shop has an open dispute | The dispute is won or lost |
| The shop changed its settlement bank account | 48 hours after the change |
| A refund for the shop is waiting for funds or being sent | It is sent, or the unfunded draft expires after 24 hours |
| A new shop has already had ₹25,000 released today (IST) | The next day. A single order’s transfer above ₹25,000 is released on its own, on a day with no other release. |

If an admin has set a rolling reserve for the shop, that share of each net goes in a separate transfer held for 30 days. Reserves are off by default.

The shop’s “Order payments” page shows: **On hold** (with the next release time), **In reserve**, **Released** (on its way to the bank), and **Owed** (with a Pay button) when the shop owes ChatLogix money.

### Order changes, expiry, and cancellation

| Moment | What happens |
|---|---|
| Before payment | The order is `awaiting_payment`. The shop does not prepare it. It can switch the order to COD. |
| Cart changes before payment | The open link is cancelled at Razorpay. A new link for the new total goes out, from the bot or the shop according to the setting. An order never has two open links. |
| Two hours before expiry | One reminder to the customer. |
| Link expires unpaid | The order stays `awaiting_payment`. The shop is told, and chooses to resend, switch to COD, or cancel. |
| Payment lands on a cancelled or already-paid order | It is refunded through Razorpay, not transferred. ChatLogix bears the gateway fee on it. |
| Last customer message older than 24 hours | The link and the reminder go as an approved WhatsApp utility template. |

## 3. How the shop gets paid

There is no Withdraw button. Money is released automatically when its hold ends (§2), and Razorpay settles it from the shop’s linked account to the shop’s bank. The shop changes its bank account from its settings. That needs a fresh phone OTP, pauses releases for 48 hours, and sends the shop a WhatsApp and email notice. Razorpay verifies the new account.

The AI wallet is never a source of order money, and order money never refills the AI wallet.

## 4. Refunds

The customer receives the refunded rupees on the original UPI or card. ChatLogix asks Razorpay for a **normal** refund (several business days, no extra instant-refund slab).

A refund costs the shop the **gross** amount the customer receives. The ₹10 platform fee is not added back. The gateway fee is not added back; Razorpay keeps it either way.

**The shop funds the refund first.** ChatLogix pays the customer from its own Razorpay account and recovers the same amount from the shop by reversing the shop’s held transfers, this payment’s first. If the shop’s held money cannot cover the refund, the shop sees “Add ₹X to send this refund” and pays the shortfall by Razorpay Checkout. The amount asked is slightly more than the shortfall, to cover Razorpay’s fee on that payment. The refund goes to Razorpay when that payment lands. ChatLogix never fronts a refund.

An unfunded refund is a draft. It expires after 24 hours. While a refund is waiting for funds or being sent, the shop’s releases pause, so the held money it needs is not released underneath it.

The same ₹1,000 order with TCS and TDS at 0, so ₹966.40 was transferred on hold:

| Situation | Shop’s held money before | Shop adds first | Held money after | ChatLogix keeps |
|---|---:|---:|---:|---:|
| Full ₹1,000, still on hold, nothing else held | ₹966.40 | **₹33.60** | ₹0.00 | ₹10.00 |
| Full ₹1,000, still on hold, ₹500 held from other orders | ₹1,466.40 | ₹0.00 | ₹466.40 | ₹10.00 |
| Partial ₹400, still on hold | ₹966.40 | ₹0.00 | ₹566.40 | ₹10.00 |
| Full ₹1,000, already released, nothing held | ₹0.00 | **₹1,000.00** | ₹0.00 | ₹10.00 |

₹33.60 is the gateway fee plus the platform fee. With the default tax rates the shortfall also includes the ₹6.00 TCS and TDS, until the CA rules on how a refund adjusts them (05, D2).

Partial refunds keep the full platform fee, because the fee was for processing the order. A second partial refund costs only the new refund amount. The sum of refunds cannot exceed the captured amount.

COD and shop-collected payments have no Razorpay payment, so there is no gateway refund. The shop handles that cash itself.

A payment that was never transferred, because its fees consumed it (§2) or because it landed on a cancelled or already-paid order, is refunded by ChatLogix from its own account. Nothing is reversed, and ops gets an alert.

Today’s refund helper only allows `pending` or `confirmed` orders inside 7 days and then marks the order `cancelled`. Managed-payment refunds follow the payment instead: any captured payment that is not fully refunded can be refunded, including after delivery. Cancelling the order and refunding the money are separate. A full refund of an undelivered order can still cancel the order. A refund of a delivered order leaves fulfillment history intact and marks the payment refunded.

When a customer asks for a refund in chat, the bot says the shop will confirm. It never tells the customer a refund is approved until the refund has been sent to Razorpay.

### Disputes and chargebacks

The customer’s bank can reverse a card payment after the fact. An open dispute stops all of the shop’s releases until it is won or lost.

When Razorpay deducts the disputed amount from ChatLogix, ChatLogix recovers it from the shop’s held transfers, this payment’s first. Whatever held money cannot cover is **owed** by the shop. Owed money is taken from the shop’s next order payments before anything is transferred, and the shop can pay it at any time from the Order payments page. A dispute the shop wins returns the amount to the shop as a new held transfer.

## 5. Cash on delivery

The customer chooses COD in chat, or the shop marks the order COD. No payment link is created, or the open one is cancelled. Nothing is transferred. The platform fee is ₹0. When the shop marks the cash collected, the order is paid **to the shop**, not to ChatLogix. That action never writes a settlement entry.

## 6. AI wallet top-up

This is the existing wallet, specified in [wallet-top-up-p2g.md](../../documentation/modules/features/vendor-onboarding/guides/wallet-top-up-p2g.md).

The vendor picks ₹500, ₹1,000, ₹2,000, or ₹5,000 (limits already in PlatformSettings: minimum ₹100, maximum ₹50,000). Razorpay Checkout charges them. On `payment.captured`, `creditWalletFromTopUp` adds the **full** selected amount to `walletBalanceMilli`. There is no hold and no `paymentFeeBps`. Razorpay’s fee on a top-up is ChatLogix’s cost of collecting that credit.

The browser success screen polls the wallet. It does not credit the balance.

## 7. Auto-recharge (AI wallet only)

The vendor turns it on and picks ₹500, ₹1,000, or ₹2,000. The threshold is ₹100. They approve a UPI Autopay mandate for that amount once.

When the AI wallet is under ₹100, ChatLogix schedules a debit of the chosen amount. UPI Autopay requires a pre-debit notice about 24 hours before the charge, so the top-up is not instant. ₹100 still covers on the order of a few hundred replies, so the bot keeps running through the wait.

The wallet is credited only when that debit’s `payment.captured` webhook arrives, through the same `creditWalletFromTopUp` path. One debit is in flight at a time. A failure notifies the vendor and stops. It does not retry in a loop. Order money is never used to refill the AI wallet.

The mandate is for one amount. Changing the preset means approving a new mandate. If the vendor or their bank cancels or pauses the mandate, auto-recharge turns off and the vendor is told. If the wallet reaches the zero-balance gate during the 24-hour wait, replies stop until the debit lands. The vendor can still top up by hand.

## 8. What the customer sees in chat

| Moment | Message |
|---|---|
| Order confirmed, collection on | Payment link, amount, order number (from the bot, or when the shop presses Send) |
| Link still unpaid, two hours before expiry | One reminder |
| Payment captured | Paid confirmation |
| Payment failed | The link again, and COD if the shop allows it |
| “Did my payment go through?” | Answer from the payment row, without the shop |
| Customer asks for a refund | The shop will confirm |
| Refund sent | Amount, and that it returns to the original method in a few business days |

“Did my payment go through?” reads the payment record. It does not call Razorpay on the customer’s message.

## 9. What finance sees

Each captured order produces numbers that must add up:

```text
customer paid = gateway fee+GST + platform fee + GST TCS + TDS + net transferred
```

The net transferred includes any reserve, and is reduced by anything the shop owed.

The platform fee includes its GST. ChatLogix invoices each shop monthly for its platform fees, showing the GST part. The gateway fee is Razorpay’s invoice to ChatLogix, already deducted before the money arrives. ChatLogix deposits the TCS (GSTR-8) and the TDS each month from its own account.

The shop’s Order payments history shows, per order, the gross, both fees, the TCS and TDS, the net, the hold end time, and the release. It also lists refunds, funding payments, disputes, and amounts owed. A monthly statement is downloadable.

Staff do not patch a balance from a form. A mistaken payment is fixed by a Razorpay refund, or by a reversing `adjustment` ledger entry with an idempotency key, the same discipline as the AI wallet.

Finance checks two things every day. Each shop’s cached balance must equal the sum of its ledger entries. Each shop’s held transfers at Razorpay must equal the held transfers ChatLogix has on record.

## 10. Shop turns collection off or leaves

Turning collection off stops new links at once, and open links are cancelled. Held money is released on its normal schedule unless a freeze applies. Anything the shop owes is invoiced. Ledger, transfer, and payment rows are kept as tax records. Deleting a shop never deletes them; a shop is deactivated instead.
