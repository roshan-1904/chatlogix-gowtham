import { apiClient } from './api';

/** Every `*Milli` amount below is wallet money: 1 rupee = 1000 millirupees. */
export interface AdminVendorListRow {
  id: string;
  businessName: string;
  phone: string | null;
  email: string | null;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  walletBalanceMilli: number;
  markupPercent: number;
  createdAt: string;
}

export interface AdminVendorConfig {
  id: string;
  businessName: string;
  plan: string | null;
  status: string | null;
  walletBalanceMilli: number;
  markupPercent: number;
  category: string | null;
  catalogImportEnabled: boolean;
  ai: Record<string, unknown>;
}

export type WalletTransactionType = 'recharge' | 'deduction' | 'refund';

export interface AdminWalletTransaction {
  id: string;
  transactionType: WalletTransactionType;
  amountMilli: number;
  balanceAfterMilli: number;
  transactionDate: string;
  metadata?: Record<string, unknown>;
}

export const MIN_MARKUP_PERCENT = 0;
export const MAX_MARKUP_PERCENT = 500;

export async function listVendors(): Promise<AdminVendorListRow[]> {
  return apiClient.get<AdminVendorListRow[]>('/vendors');
}

export async function getVendorConfig(vendorId: string): Promise<AdminVendorConfig> {
  return apiClient.get<AdminVendorConfig>(`/vendors/${vendorId}/config`);
}

export async function getVendorWalletTransactions(
  vendorId: string,
  limit = 50
): Promise<AdminWalletTransaction[]> {
  const body = await apiClient.get<{ transactions: AdminWalletTransaction[] }>(
    `/vendors/${vendorId}/wallet-transactions?limit=${limit}`
  );
  return body.transactions;
}

export async function updateVendorMarkup(
  vendorId: string,
  markupPercent: number
): Promise<{ markupPercent: number }> {
  return apiClient.patch<{ markupPercent: number }>(`/vendors/${vendorId}/billing-config`, {
    markupPercent,
  });
}
