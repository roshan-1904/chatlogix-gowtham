import { env } from '../../config/env.js';

/**
 * D3 (docs/payments/05): how the gateway fee appears on the shop's platform-fee invoice.
 * Default `pure_agent` while the CA answer is pending — Razorpay bills ChatLogix; the shop
 * sees a reimbursement line, not ChatLogix taxable service on that amount.
 */
export type GatewayFeeInvoiceLineMode = 'pure_agent' | 'inclusive_service';

export function resolveGatewayFeeInvoiceLineMode(): GatewayFeeInvoiceLineMode {
  const raw = env.PLATFORM_FEE_INVOICE_GATEWAY_LINE?.trim().toLowerCase();
  if (raw === 'inclusive_service') return 'inclusive_service';
  return 'pure_agent';
}

export function gatewayFeeLineLabel(mode: GatewayFeeInvoiceLineMode): string {
  if (mode === 'inclusive_service') {
    return 'Payment gateway fee (part of ChatLogix service — confirm with CA D3)';
  }
  return 'Payment gateway fee (reimbursement on behalf of Razorpay — pure agent)';
}
