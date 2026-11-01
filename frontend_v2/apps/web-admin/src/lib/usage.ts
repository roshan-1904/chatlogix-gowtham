import { apiClient, API_URL } from './api';
import { tokenStorage } from '@chatlogix/auth';

export interface PlatformUsageTotals {
  chargedMilli: number;
  openAiCostMilli: number | null;
  trialGrantedMilli: number;
  otherCreditsMilli: number;
  hasIncompleteCost?: boolean;
}

export interface PlatformUsageSourceItem {
  source: string;
  label: string;
  chargedMilli: number;
  count: number;
}

export interface PlatformUsageVendorItem {
  vendorId: string;
  businessName: string;
  chargedMilli: number;
  count: number;
  topSource: string;
}

export interface PlatformUsagePagination {
  page: number;
  limit: number;
  totalVendors: number;
  totalPages: number;
}

export interface PlatformUsageMeta {
  conversationCount: number;
  chargedToVendorsForMetaMilli: number;
}

export interface PlatformUsageResponse {
  from: string;
  to: string;
  totals: PlatformUsageTotals;
  bySource: PlatformUsageSourceItem[];
  byVendor: PlatformUsageVendorItem[];
  pagination: PlatformUsagePagination;
  meta: PlatformUsageMeta;
}

export interface PlatformUsageParams {
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function getPlatformUsage(params?: PlatformUsageParams): Promise<PlatformUsageResponse> {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  const endpoint = qs ? `/admin/usage?${qs}` : '/admin/usage';
  return apiClient.get<PlatformUsageResponse>(endpoint);
}

export interface VendorUsageTotals {
  chargedMilli: number;
  openAiCostMilli: number | null;
  hasIncompleteCost: boolean;
}

export interface VendorUsageDayItem {
  day: string;
  chargedMilli: number;
  count: number;
}

export interface VendorUsageChargeItem {
  id: string;
  time: string;
  source: string;
  sourceLabel: string;
  chargedMilli: number;
  openAiCostMilli: number | null;
}

export interface VendorUsageResponse {
  vendorId: string;
  businessName: string;
  from: string;
  to: string;
  totals: VendorUsageTotals;
  bySource: PlatformUsageSourceItem[];
  byDay: VendorUsageDayItem[];
  selectedDay: string;
  charges: VendorUsageChargeItem[];
}

export interface VendorUsageParams {
  vendorId: string;
  from?: string;
  to?: string;
  day?: string;
}

export async function getVendorUsage(params: VendorUsageParams): Promise<VendorUsageResponse> {
  const query = new URLSearchParams();
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.day) query.set('day', params.day);

  const qs = query.toString();
  const endpoint = qs ? `/admin/usage/${params.vendorId}?${qs}` : `/admin/usage/${params.vendorId}`;
  return apiClient.get<VendorUsageResponse>(endpoint);
}

/** Formats a date to YYYY-MM-DD in IST (+05:30). */
export function formatIstYmd(date: Date): string {
  const istTime = new Date(date.getTime() + 19800000);
  const y = istTime.getUTCFullYear();
  const m = String(istTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(istTime.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns the start and end of the last 7 calendar days in IST. */
export function getLast7DaysPreset(): { from: string; to: string } {
  const now = new Date();
  const todayIst = formatIstYmd(now);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayIst)!;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const sevenDaysAgo = new Date(Date.UTC(y, m - 1, d - 6));
  const from = `${sevenDaysAgo.getUTCFullYear()}-${String(sevenDaysAgo.getUTCMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getUTCDate()).padStart(2, '0')}`;
  return { from, to: todayIst };
}

/** Returns the start and end of the current month in IST. */
export function getThisMonthPreset(): { from: string; to: string } {
  const now = new Date();
  const todayIst = formatIstYmd(now);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayIst)!;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  return { from, to: todayIst };
}

/** Escapes a CSV cell according to RFC 4180 rules. */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Triggers a browser download for a Blob file. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/** Fetches the full CSV export of platform usage for the given date range. */
export async function exportPlatformUsageCsv(params: {
  from: string;
  to: string;
}): Promise<{ filename: string; blob: Blob }> {
  const query = new URLSearchParams();
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  query.set('format', 'csv');

  const token = tokenStorage.getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/admin/usage?${query.toString()}`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMessage = `Export failed (${response.status})`;
    try {
      const errJson = (await response.json()) as Record<string, unknown>;
      const msg = typeof errJson.message === 'string' ? errJson.message : undefined;
      const err = typeof errJson.error === 'string' ? errJson.error : undefined;
      errorMessage = msg || err || errorMessage;
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  let filename = `chatlogix-usage-${params.from}-to-${params.to}.csv`;
  const disposition = response.headers.get('Content-Disposition');
  if (disposition) {
    const match = /filename="?([^"]+)"?/.exec(disposition);
    if (match?.[1]) {
      filename = match[1];
    }
  }

  const blob = await response.blob();
  return { filename, blob };
}

export interface UsageMarginResult {
  /** The calculated margin percentage rounded to 1 decimal place, e.g. 33.3, or null if unavailable / zero revenue */
  percentage: number | null;
  /** Formatted string for display, e.g. '33.3%', '—' */
  formatted: string;
  /** Status: 'available' | 'zero_revenue' | 'incomplete' */
  status: 'available' | 'zero_revenue' | 'incomplete';
  /** Descriptive caption explaining the metric */
  caption: string;
}

/**
 * Calculates Gross Margin Percentage based on platform billed charges and AI cost:
 * Formula: ((chargedMilli - openAiCostMilli) / chargedMilli) * 100
 * Both figures are in millirupees (milli).
 *
 * Edge cases:
 * - If openAiCostMilli is null, undefined, not finite, or hasIncompleteCost is true: returns status 'incomplete' and formatted '—'.
 * - If chargedMilli is null, undefined, not finite, or <= 0: returns status 'zero_revenue' and formatted '—' (never NaN or Infinity).
 * - If charges and cost are valid: returns percentage rounded to 1 decimal place.
 */
export function calculateUsageMargin(
  chargedMilli: number | null | undefined,
  openAiCostMilli: number | null | undefined,
  hasIncompleteCost?: boolean
): UsageMarginResult {
  if (
    openAiCostMilli === null ||
    openAiCostMilli === undefined ||
    !Number.isFinite(openAiCostMilli) ||
    hasIncompleteCost === true
  ) {
    return {
      percentage: null,
      formatted: '—',
      status: 'incomplete',
      caption: 'Incomplete AI cost data',
    };
  }

  if (
    chargedMilli === null ||
    chargedMilli === undefined ||
    !Number.isFinite(chargedMilli) ||
    chargedMilli <= 0
  ) {
    return {
      percentage: null,
      formatted: '—',
      status: 'zero_revenue',
      caption: 'No billable charges in range',
    };
  }

  const marginFraction = (chargedMilli - openAiCostMilli) / chargedMilli;
  const percentage = Math.round(marginFraction * 1000) / 10;

  return {
    percentage,
    formatted: `${percentage.toFixed(1)}%`,
    status: 'available',
    caption: 'billed vs AI provider cost',
  };
}

