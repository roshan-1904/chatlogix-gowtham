---
name: Stage 10 tax statements offboarding
overview: Produce the GST TCS and 194-O TDS reports from the withheld amounts, a monthly statement and platform-fee GST invoice per shop, and a clean exit for a shop that stops collecting or leaves. The CA's answers set the live rates and the refund adjustment rule.
todos:
  - id: ca-answers
    content: Confirm the CA's D2 and D3 answers are saved in docs/payments/05; set live gstTcsBps and tds194oBps to match
    status: pending
  - id: tax-reports
    content: Monthly GST TCS report (GSTR-8 layout) and 194-O TDS report from CustomerPayment
    status: pending
  - id: refund-adjustment
    content: If the CA says refunds return TCS or TDS to the shop, credit it back as an adjustment at month close
    status: pending
  - id: statement
    content: Monthly per-shop statement, downloadable from the Order payments page
    status: pending
  - id: invoice
    content: Monthly GST invoice for the platform fee, per shop, before the first live month closes
    status: pending
  - id: offboarding
    content: Collection off or leaving — no new links, held money on schedule, owed invoiced, linked account kept until clear, rows kept
    status: pending
isProject: false
---

# Stage 10 — Tax, statements, invoices, offboarding

The tax deductions themselves are built in stage 1 (rates in `PlatformSettings`, amounts on each `CustomerPayment`). This stage reports them, invoices the platform fee, and handles a shop leaving. The CA’s answers in [docs/payments/05-compliance-and-risk.md](docs/payments/05-compliance-and-risk.md) (D2, D3) set the live rates and the refund rule. The invoice must exist before the first live month is closed.

Depends on stages 5 and 6. Full spec: phase 10 in [docs/payments/02-implementation-plan.md](docs/payments/02-implementation-plan.md).

## Tax reports

- GST TCS: monthly, per shop GSTIN, the value of supplies through ChatLogix and the TCS withheld, in the GSTR-8 layout. Same-month refunds reduce the base. Use the CA’s base (order amount, or order amount less the shop’s GST).
- 194-O TDS: monthly, per shop PAN, the gross and the TDS withheld. The no-PAN rate applies only to a PAN reported invalid or inoperative.
- Withheld amounts sit in ChatLogix’s account; they were never transferred. Depositing and filing are finance tasks. The system produces the numbers.
- If the CA says a refund returns TCS or TDS to the shop, credit it back as an `adjustment` when the month is closed.

## Statement

- Per shop, per month: opening balance, gross collected, gateway fee, platform fee and its GST, TCS, TDS, net, reserve, releases, refunds, funding payments, disputes, adjustments, closing balance.
- Opening plus movements equals closing, and closing equals the stage 9 ledger check.
- Downloadable from the Order payments page.

## Invoice

- Monthly GST invoice from ChatLogix to each shop for its platform fees. The fee includes GST, so the invoice shows the taxable value and `platformFeeGstPaise` (₹8.47 + ₹1.53 on a ₹10.00 fee).
- Invoice numbers run in sequence. Store the issued PDF. Never regenerate an issued invoice; correct it with a credit note.
- The gateway-fee line follows the CA’s D3 answer (pure-agent reimbursement or part of ChatLogix’s service).

## Offboarding

- Collection off (stage 8) and a shop leaving share one path: no new links, open links cancelled.
- Held money is released on its normal schedule unless a freeze applies.
- Anything owed is invoiced.
- The linked account stays until no transfer is held and no dispute is open.
- Payment, transfer, refund, ledger, and invoice rows are kept (`onDelete: Restrict`). A shop is deactivated, not deleted.

## Done when

- A fixture month’s TCS and TDS reports add up to the sum of its payments.
- A fixture statement balances, opening plus movements equals closing.
- A fixture invoice shows ₹8.47 + ₹1.53 for a single ₹1,000 order at 1%.
- A shop that owes money and turns collection off keeps its ledger and shows the amount owed.
