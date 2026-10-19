import { tokenStorage } from '@chatlogix/auth';
import { apiClient, API_URL } from './api';

export interface PlatformFeeInvoiceRow {
  id: string;
  monthKey: string;
  invoiceDisplay: string | null;
  invoiceNumber: string;
  platformFeePaise: number;
  platformFeeTaxablePaise: number;
  platformFeeGstPaise: number;
  paymentCount: number;
  issuedAt: string;
  platformFeeInr?: string;
}

export async function listPlatformFeeInvoices(vendorId: string): Promise<PlatformFeeInvoiceRow[]> {
  const body = await apiClient.get<{ invoices: PlatformFeeInvoiceRow[] }>(
    `/vendors/${vendorId}/payments/platform-fee-invoices`
  );
  return body.invoices;
}

export async function downloadPlatformFeeInvoicePdf(vendorId: string, invoiceId: string): Promise<void> {
  const token = tokenStorage.getToken();
  const url = `${API_URL}/vendors/${vendorId}/payments/platform-fee-invoices/${invoiceId}/pdf`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error('Could not download invoice');
  }
  const blob = await res.blob();
  const filename =
    res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `platform-fee-invoice-${invoiceId}.pdf`;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}
