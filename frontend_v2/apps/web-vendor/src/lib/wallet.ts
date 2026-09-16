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

export interface WalletSummary {
  balanceMilli: number;
  registrationStatus: string;
  provider: 'mock' | 'razorpay';
  mockTopUpEnabled: boolean;
  presetsMilli: number[];
  recentTransactions: WalletTransactionRow[];
}

export interface TopUpIntentResponse {
  intentId: string;
  provider: 'mock' | 'razorpay';
  amountMilli: number;
  clientAction: { type: 'mock_confirm'; intentId: string } | { type: 'razorpay_checkout'; orderId: string; amountMilli: number };
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
