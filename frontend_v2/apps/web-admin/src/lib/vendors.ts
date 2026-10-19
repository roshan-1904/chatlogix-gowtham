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
  paymentFeeBps: number;
  paymentsManagedByChatlogix: boolean;
  paymentLinkAutoSend: boolean;
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

export const MIN_PAYMENT_FEE_BPS = 0;
export const MAX_PAYMENT_FEE_BPS = 2000;

export async function updateVendorBillingConfig(
  vendorId: string,
  body: { markupPercent?: number; paymentFeeBps?: number }
): Promise<{ markupPercent: number; paymentFeeBps: number }> {
  return apiClient.patch<{ markupPercent: number; paymentFeeBps: number }>(
    `/vendors/${vendorId}/billing-config`,
    body
  );
}

/** @deprecated use updateVendorBillingConfig */
export async function updateVendorMarkup(
  vendorId: string,
  markupPercent: number
): Promise<{ markupPercent: number }> {
  const result = await updateVendorBillingConfig(vendorId, { markupPercent });
  return { markupPercent: result.markupPercent };
}

export interface VendorFeatureFlags {
  conversation_turn_audit: boolean;
}

export async function getVendorFeatureFlags(vendorId: string): Promise<VendorFeatureFlags> {
  return apiClient.get<VendorFeatureFlags>(`/vendors/${vendorId}/feature-flags`);
}

export async function patchVendorFeatureFlags(
  vendorId: string,
  patch: Partial<VendorFeatureFlags>
): Promise<VendorFeatureFlags> {
  return apiClient.patch<VendorFeatureFlags>(`/vendors/${vendorId}/feature-flags`, patch);
}

export interface AdminSettlementView {
  releasesFrozenAt: string | null;
  releasesFrozenReason: string | null;
  rollingReserveBps: number;
  position: {
    heldMilli: string;
    reserveMilli: string;
    releasedMilli: string;
    owedMilli: string;
  };
}

export async function getAdminSettlementView(vendorId: string): Promise<AdminSettlementView> {
  return apiClient.get<AdminSettlementView>(`/vendors/${vendorId}/payments/settlement/admin`);
}

export async function freezeVendorReleases(vendorId: string, reason: string): Promise<void> {
  await apiClient.post(`/vendors/${vendorId}/payments/settlement/freeze`, { reason });
}

export async function unfreezeVendorReleases(vendorId: string): Promise<void> {
  await apiClient.post(`/vendors/${vendorId}/payments/settlement/unfreeze`, {});
}

export async function setVendorRollingReserve(vendorId: string, rollingReserveBps: number): Promise<void> {
  await apiClient.patch(`/vendors/${vendorId}/payments/settlement/reserve`, { rollingReserveBps });
}

export interface VendorPlatformFeeInvoiceRow {
  id: string;
  monthKey: string;
  invoiceDisplay: string | null;
  invoiceNumber: string;
  platformFeePaise: number;
  platformFeeTaxablePaise: number;
  platformFeeGstPaise: number;
  gatewayFeePaise: number;
  gatewayTaxPaise: number;
  gatewayLineMode: string;
  paymentCount: number;
  issuedAt: string;
  platformFeeInr?: string;
  platformFeeTaxableInr?: string;
  platformFeeGstInr?: string;
}

export async function listVendorPlatformFeeInvoices(vendorId: string): Promise<VendorPlatformFeeInvoiceRow[]> {
  const body = await apiClient.get<{ invoices: VendorPlatformFeeInvoiceRow[] }>(
    `/vendors/${vendorId}/payments/platform-fee-invoices`
  );
  return body.invoices;
}

export async function issueVendorPlatformFeeInvoice(
  vendorId: string,
  monthKey: string
): Promise<VendorPlatformFeeInvoiceRow> {
  return apiClient.post<VendorPlatformFeeInvoiceRow>(
    `/vendors/${vendorId}/payments/platform-fee-invoices/issue`,
    { monthKey }
  );
}

/** Settlement ledger money: millirupees (1 rupee = 1000). */
export function formatSettlementMilli(milli: string | number | bigint): string {
  const n = typeof milli === 'bigint' ? Number(milli) : Number(milli);
  if (!Number.isFinite(n)) return '—';
  return `₹${(n / 1000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
