import { apiClient } from './api';

export type WalletTransactionType = 'recharge' | 'deduction' | 'refund';

export interface WalletTransactionRow {
  id: string;
  transactionType: WalletTransactionType;
  amountMilli: number;
  balanceAfterMilli: number;
  transactionDate: string;
  metadata?: Record<string, unknown>;
}

export interface AutoRechargeSummary {
  enabled: boolean;
  amountMilli: number | null;
  hasMandate: boolean;
  presetAmountsMilli: number[];
  pendingRegistration: {
    registrationId: string;
    amountMilli: number;
    startedAt: string;
  } | null;
  scheduledDebit: {
    attemptId: string;
    scheduledDebitAt: string;
    status: string;
    amountMilli: number;
  } | null;
}

export interface WalletSummary {
  balanceMilli: number;
  registrationStatus: string;
  provider: 'mock' | 'razorpay';
  mockTopUpEnabled: boolean;
  razorpayKeyId?: string;
  presetsMilli: number[];
  autoRecharge: AutoRechargeSummary;
  recentTransactions: WalletTransactionRow[];
}

export interface TopUpIntentResponse {
  intentId: string;
  provider: 'mock' | 'razorpay';
  amountMilli: number;
  clientAction:
    | { type: 'mock_confirm'; intentId: string }
    | { type: 'razorpay_checkout'; orderId: string; amountMilli: number; keyId: string };
}

/** Millirupees → paise (matches backend milliToPaise). */
export function milliToPaise(milli: number): number {
  return Math.round(milli / 10);
}

export interface ConfirmMockTopUpResponse {
  balanceMilli: number;
  transactionId: string;
  alreadyCompleted?: boolean;
}

export async function getWallet(): Promise<WalletSummary> {
  return apiClient.get<WalletSummary>('/vendors/me/wallet');
}

export async function createTopUpIntent(amountMilli: number): Promise<TopUpIntentResponse> {
  return apiClient.post<TopUpIntentResponse>('/vendors/me/wallet/top-up-intent', { amountMilli });
}

export async function confirmMockTopUp(intentId: string): Promise<ConfirmMockTopUpResponse> {
  return apiClient.post<ConfirmMockTopUpResponse>('/vendors/me/wallet/confirm-mock', { intentId });
}

export interface AutoRechargeSetupResponse {
  registrationId: string;
  clientAction: {
    type: 'razorpay_mandate_checkout';
    orderId: string;
    customerId: string;
    keyId: string;
    amountMilli: number;
    registrationId: string;
  } | null;
}

export async function setupAutoRecharge(amountMilli: number): Promise<AutoRechargeSetupResponse> {
  return apiClient.post<AutoRechargeSetupResponse>('/vendors/me/wallet/auto-recharge/setup', { amountMilli });
}

export async function disableAutoRecharge(): Promise<{ ok: boolean }> {
  return apiClient.patch<{ ok: boolean }>('/vendors/me/wallet/auto-recharge', { enabled: false });
}
