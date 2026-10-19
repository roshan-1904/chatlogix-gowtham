import { apiClient } from './api';

export interface MonthlyTaxReportTotals {
  paymentCount: number;
  grossCapturedPaise: number;
  gstTcsOnPaymentsPaise: number;
  tdsOnPaymentsPaise: number;
  sameMonthRefundPaise: number;
  gstTcsRefundReductionPaise: number;
  tdsRefundReductionPaise: number;
  netTaxableValuePaise: number;
  netGstTcsPaise: number;
  netTdsPaise: number;
}

export interface Gstr8SupplierRow {
  vendorId: string;
  supplierGstin: string;
  supplierName: string;
  taxableValuePaise: number;
  tcsTotalPaise: number;
  tcsIgstPaise: number;
  tcsCgstPaise: number;
  tcsSgstPaise: number;
}

export interface Tds194oSupplierRow {
  vendorId: string;
  supplierPan: string | null;
  supplierName: string;
  grossSalesPaise: number;
  tdsPaise: number;
}

export interface MonthlyTaxReportsResponse {
  yearMonth: string;
  gstr8: { table3: Gstr8SupplierRow[]; totals: MonthlyTaxReportTotals };
  tds194o: { suppliers: Tds194oSupplierRow[]; totals: MonthlyTaxReportTotals };
  close: {
    yearMonth: string;
    closed: boolean;
    closedAt: string | null;
    adjustmentCount: number;
  };
}

export async function getMonthlyTaxReports(yearMonth: string): Promise<MonthlyTaxReportsResponse> {
  return apiClient.get<MonthlyTaxReportsResponse>(`/admin/tax-reports/${yearMonth}`);
}

export async function closeTaxReportMonth(yearMonth: string): Promise<{
  yearMonth: string;
  alreadyClosed: boolean;
  closedAt: string;
  adjustmentCount: number;
}> {
  return apiClient.post(`/admin/tax-reports/${yearMonth}/close`, {});
}
