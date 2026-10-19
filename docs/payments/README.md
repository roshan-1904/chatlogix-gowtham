# Customer payments and shop settlement

**Status:** Design final 2026-10-19. Not implemented. The phase 1 code was written for the earlier RazorpayX design and is reworked for Route before its migration is applied. Three outside confirmations are still owed (below).  
**Gateway:** Razorpay Payment Gateway, Payment Links, and Route. India, INR only. No RazorpayX in v1.

This folder is the spec for taking a customer’s order payment, holding the shop’s net at Razorpay, and releasing it to the shop’s bank. It is **not** the spec for the AI wallet.

| Money | Where it lives | Who writes it | Spec |
|---|---|---|---|
| AI wallet | `Vendor.walletBalanceMilli` | `pricingService.chargeVendor` debits. `creditWalletFromTopUp` credits. | [BILLING_AND_PRICING.md](../BILLING_AND_PRICING.md) |
| Order settlement | The shop’s Route linked account at Razorpay, mirrored by `Vendor.settlementBalanceMilli` in millirupees | `settlementService` only | This folder |

A customer payment never calls `creditWalletFromTopUp` and never changes `walletBalanceMilli`. An AI top-up never changes the settlement balance.

## Documents

| Doc | Use it for |
|---|---|
| [01-business-flow.md](./01-business-flow.md) | What happens for the customer, the shop, and ChatLogix, with the ₹1,000 worked examples |
| [02-implementation-plan.md](./02-implementation-plan.md) | Schema, services, webhook, phases, and what already exists in the repo |
| [03-razorpay-account-setup.md](./03-razorpay-account-setup.md) | Which Razorpay products to open, KYC, keys, webhooks, and linked accounts |
| [04-security-and-go-live.md](./04-security-and-go-live.md) | Legal pages, TLS, and the controls that stop double credits, wrong amounts, and bad releases |
| [05-compliance-and-risk.md](./05-compliance-and-risk.md) | The decisions behind the design, the confirmations still owed, and vendor KYC |

## Decisions (2026-10-19)

| # | Decision | Answer |
|---|---|---|
| D1 | Who holds the money | Razorpay Route. Each shop is a linked account. Released money settles to the shop automatically. No Withdraw button and no RazorpayX. |
| D2 | GST TCS and 194-O TDS | Built in. Rates live in `PlatformSettings`: 0.5% TCS, 0.1% TDS, 5% TDS without PAN. A rate set to 0 turns that tax off. |
| D3 | GST on the platform fee | The fee includes its GST. ₹10.00 is ₹8.47 revenue plus ₹1.53 GST. |
| D4 | Who bears a loss | 48-hour hold, 7 days for new shops. ₹25,000 daily release cap for new shops. Admin freeze, auto-freeze on dispute, optional rolling reserve. A refund the shop’s held money cannot cover waits until the shop pays the shortfall. ChatLogix never fronts it. |
| D5 | Order lifecycle | New `awaiting_payment` order status. Each shop chooses whether the bot sends the link (default on). An expired link leaves the order waiting for the shop to resend, switch to COD, or cancel. |

Reasons and details: [05-compliance-and-risk.md](./05-compliance-and-risk.md).

### Still owed

| From | What | Blocks |
|---|---|---|
| Razorpay | Written confirmation that Route is enabled for this use and supports the holds, releases, and reversals the design relies on (05, D1) | Applying the settlement migration, phases 5–7 |
| CA | Whether TCS and TDS apply, on what base, and how refunds adjust them. The GST treatment of the gateway fee passed to the shop. (D2, D3) | Live tax rates, phase 10 |
| Counsel | Terms and refund page, and whether holding a refund until the shop funds it fits the Consumer Protection (E-Commerce) Rules (D4) | Live keys |

Phases 0, 2, 3, and 4 (the AI wallet) wait on none of these.

## Rules

| # | Rule |
|---|---|
| 1 | India, INR only. |
| 2 | A shop opts in, completes KYC, and has an activated Route linked account before ChatLogix collects for its orders. Otherwise the customer pays the shop directly or cash on delivery. |
| 3 | On capture, deduct the gateway fee (including GST), the platform fee (including its GST), GST TCS, and TDS. Transfer **only the net** to the shop’s linked account, on hold. |
| 4 | The platform fee is kept. A refund does not put it back. |
| 5 | A refund costs the shop the **gross** amount the customer receives. If the shop’s held money cannot cover it, the refund waits until the shop pays the shortfall. ChatLogix never fronts a refund. |
| 6 | The hold is **48 hours** from capture, including weekends, and **7 days** for a new shop. When the hold ends the money is released automatically, unless the shop is frozen, over its daily cap, inside a bank-change pause, or has a refund in progress. |
| 7 | `paymentFeeBps` is admin-set per shop. It is not `Vendor.markupPercent`. |
| 8 | Cash on delivery never enters settlement. |
| 9 | Auto-recharge tops up the **AI wallet** only, when it is under ₹100, for an amount the vendor chose (₹500, ₹1,000, or ₹2,000). |
| 10 | Released money reaches the shop’s bank through Razorpay’s Route settlement. There is no Withdraw button. |
| 11 | Razorpay webhooks are the source of truth. The browser success callback does not credit either balance. |

## Worked capture (Razorpay list price)

Razorpay’s public domestic fee is 2% plus 18% GST on that fee. The live system uses `fee` and `tax` on the captured payment, not this table. Platform fee 1% (`paymentFeeBps = 100`). TCS and TDS at the default rates, on the order amount until the CA rules on the base.

| Line | Rupees | Paise |
|---|---:|---:|
| Customer pays | 1,000.00 | 100,000 |
| Gateway fee + GST (2% + 18% GST) | 23.60 | 2,360 |
| Platform fee (1%, includes ₹1.53 GST) | 10.00 | 1,000 |
| GST TCS (0.5%) | 5.00 | 500 |
| TDS 194-O (0.1%) | 1.00 | 100 |
| Transferred to the shop, on hold | **960.40** | **96,040** |

With TCS and TDS set to 0, the transfer is ₹966.40 (96,640 paise). The refund examples in [01-business-flow.md](./01-business-flow.md) use that figure so the arithmetic stays readable.

In millirupees the ₹960.40 credit is `960400` (`paiseToMilli(96040)`). It is not `96040`, and it is not written to `walletBalanceMilli`.

The shop claims the TCS and TDS as credits in its own returns, so they are not a cost to the shop.

An earlier discussion used a ₹23.01 gateway fee from another gateway’s list price. That number is not Razorpay’s. Do not hardcode either fee.
