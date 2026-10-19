import { tokenStorage } from '@chatlogix/auth';
import { apiClient, API_URL } from './api';
import { openRazorpayCheckout } from './razorpayCheckout';

export interface SettlementPosition {
  balanceMilli: string;
  heldMilli: string;
  reserveMilli: string;
  owedMilli: string;
  releasedMilli: string;
  nextReleaseAt: string | null;
  asOf: string;
}

export interface AwaitingFundingRefund {
  id: string;
  amountPaise: number;
  shortfallMilli: string;
  fundingExpiresAt: string | null;
  customerPaymentId: string;
}

export interface SettlementTransferRow {
  id: string;
  amountPaise: number;
  reversedPaise: number;
  kind: string;
  status: string;
  eligibleAt: string;
  releasedAt: string | null;
  customerPaymentId: string;
}

export interface SettlementOverview {
  position: SettlementPosition;
  awaitingFunding: AwaitingFundingRefund[];
  transfers: SettlementTransferRow[];
}

export function formatSettlementMilli(milli: string | bigint): string {
  const n = typeof milli === 'bigint' ? Number(milli) : Number(milli);
  if (!Number.isFinite(n)) return '—';
  return `₹${(n / 1000).toFixed(2)}`;
}

export async function getSettlementOverview(vendorId: string): Promise<SettlementOverview> {
  return apiClient.get<SettlementOverview>(`/vendors/${vendorId}/payments/settlement`);
}

export interface SettlementMonthlyStatement {
  vendorId: string;
  shopName: string;
  year: number;
  month: number;
  openingBalanceMilli: string;
  closingBalanceMilli: string;
  balances: boolean;
  ledgerMatchesClosing: boolean;
  movements: {
    grossCollectedPaise: number;
    netCollectedMilli: string;
    releasesMilli: string;
    refundsMilli: string;
  };
}

export async function getSettlementStatement(
  vendorId: string,
  year: number,
  month: number
): Promise<SettlementMonthlyStatement> {
  const q = new URLSearchParams({ year: String(year), month: String(month), format: 'json' });
  return apiClient.get<SettlementMonthlyStatement>(
    `/vendors/${vendorId}/payments/settlement/statement?${q.toString()}`
  );
}

export async function downloadSettlementStatementCsv(
  vendorId: string,
  year: number,
  month: number
): Promise<void> {
  const q = new URLSearchParams({ year: String(year), month: String(month), format: 'csv' });
  const token = tokenStorage.getToken();
  const url = `${API_URL}/vendors/${vendorId}/payments/settlement/statement?${q.toString()}`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    throw new Error('Could not download statement');
  }
  const blob = await res.blob();
  const filename =
    res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
    `settlement-statement-${year}-${String(month).padStart(2, '0')}.csv`;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export async function requestBankChangeOtp(vendorId: string): Promise<{ sessionInfo: string }> {
  return apiClient.post(`/vendors/${vendorId}/payments/settlement/bank-change/otp`, {});
}

export async function confirmBankChange(
  vendorId: string,
  body: {
    bankAccountNumber: string;
    bankIfsc: string;
    bankAccountHolderName: string;
    sessionInfo: string;
    otp: string;
  }
): Promise<{ bankAccountMasked: string; bankIfsc: string }> {
  return apiClient.post(`/vendors/${vendorId}/payments/settlement/bank-change`, body);
}

export async function payRefundShortfall(customerRefundId: string): Promise<void> {
  const intent = await apiClient.post<{
    clientAction: { type: 'razorpay_checkout'; orderId: string; amountPaise: number; keyId: string };
  }>('/payments/shop-funding-intent', { customerRefundId });
  if (intent.clientAction?.type !== 'razorpay_checkout') {
    throw new Error('Checkout unavailable');
  }
  await openRazorpayCheckout({
    keyId: intent.clientAction.keyId,
    orderId: intent.clientAction.orderId,
    amountPaise: intent.clientAction.amountPaise,
    description: 'Fund settlement shortfall'
  });
}
