import { platformFeeGstFromInclusive, platformFeePaise } from './settlementMath.js';

export interface PlatformFeeInvoiceTotals {
  paymentCount: number;
  platformFeePaise: number;
  platformFeeTaxablePaise: number;
  platformFeeGstPaise: number;
  gatewayFeePaise: number;
  gatewayTaxPaise: number;
}

export function aggregatePlatformFeeInvoice(input: {
  payments: Array<{
    platformFeePaise: number;
    platformFeeGstPaise: number;
    gatewayFeePaise: number;
    gatewayTaxPaise: number;
  }>;
}): PlatformFeeInvoiceTotals {
  let platformFeePaiseTotal = 0;
  let platformFeeGstPaiseTotal = 0;
  let gatewayFeePaiseTotal = 0;
  let gatewayTaxPaiseTotal = 0;
  for (const row of input.payments) {
    platformFeePaiseTotal += Math.max(0, row.platformFeePaise);
    platformFeeGstPaiseTotal += Math.max(0, row.platformFeeGstPaise);
    gatewayFeePaiseTotal += Math.max(0, row.gatewayFeePaise);
    gatewayTaxPaiseTotal += Math.max(0, row.gatewayTaxPaise);
  }
  return {
    paymentCount: input.payments.length,
    platformFeePaise: platformFeePaiseTotal,
    platformFeeTaxablePaise: platformFeePaiseTotal - platformFeeGstPaiseTotal,
    platformFeeGstPaise: platformFeeGstPaiseTotal,
    gatewayFeePaise: gatewayFeePaiseTotal,
    gatewayTaxPaise: gatewayTaxPaiseTotal
  };
}

/** Done-when fixture: one ₹1,000 order at 1% platform fee. */
export function fixtureSingleOrderPlatformFeeAtOnePercent(): PlatformFeeInvoiceTotals {
  const amountPaise = 100_000;
  const feePaise = platformFeePaise(amountPaise, 100);
  const gstPaise = platformFeeGstFromInclusive(feePaise);
  return aggregatePlatformFeeInvoice({
    payments: [
      {
        platformFeePaise: feePaise,
        platformFeeGstPaise: gstPaise,
        gatewayFeePaise: 0,
        gatewayTaxPaise: 0
      }
    ]
  });
}

export function formatInrFromPaise(paise: number): string {
  return (paise / 100).toFixed(2);
}

export function formatInvoiceDisplay(invoiceNumber: number, issuedAt: Date): string {
  const year = issuedAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' });
  return `CLX-${year}-${String(invoiceNumber).padStart(6, '0')}`;
}
