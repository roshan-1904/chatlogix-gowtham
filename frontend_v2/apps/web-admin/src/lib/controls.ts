import { apiClient } from './api';

export type StaffAuditAction =
  | 'conversation_read'
  | 'case_opened'
  | 'case_status_changed'
  | 'wallet_credited'
  | 'markup_changed'
  | 'settings_changed'
  | 'feature_flag_changed'
  | 'whatsapp_mapped'
  | 'shop_viewed'
  | 'fx_refreshed'
  | 'vendor_approved'
  | 'vendor_rejected'
  | 'alert_acknowledged'
  | 'alert_resolved';

export interface StaffAuditLogEntry {
  id: string;
  actorId: string;
  action: StaffAuditAction | string;
  vendorId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditListResponse {
  supported: boolean;
  status?: string;
  message?: string;
  items: StaffAuditLogEntry[];
  count: number;
  page?: number;
  limit?: number;
}

export interface ComputedAlert {
  id: string;
  type: 'low_wallet' | 'failing_replies' | 'whatsapp_dropped' | 'fx_stale';
  severity: 'warning' | 'error' | 'info';
  vendorId?: string | null;
  businessName?: string;
  summary: string;
  targetLink: string;
  evaluatedAt: string;
}

export interface ComputedAlertsResponse {
  alerts: ComputedAlert[];
  count: number;
  evaluatedAt: string;
}

export interface TrialClockRow {
  vendorId: string;
  businessName: string;
  registrationStatus: string;
  trialGrantedMilli: number;
  walletBalanceMilli: number;
  trialExpiresAt: string;
  isPastExpiry: boolean;
  caption: string;
}

export interface TrialsResponse {
  filter: string;
  items: TrialClockRow[];
  count: number;
}

export function formatAuditAction(action: string): { label: string; variant: 'default' | 'success' | 'warning' | 'info' } {
  switch (action) {
    case 'wallet_credited':
      return { label: 'Wallet Credited', variant: 'success' };
    case 'markup_changed':
      return { label: 'Markup Changed', variant: 'warning' };
    case 'conversation_read':
      return { label: 'Transcript Read', variant: 'info' };
    case 'settings_changed':
      return { label: 'Settings Changed', variant: 'warning' };
    case 'feature_flag_changed':
      return { label: 'Flag Changed', variant: 'default' };
    case 'whatsapp_mapped':
      return { label: 'WhatsApp Mapped', variant: 'info' };
    case 'case_opened':
      return { label: 'Case Opened', variant: 'info' };
    case 'case_status_changed':
      return { label: 'Case Status Changed', variant: 'default' };
    case 'shop_viewed':
      return { label: 'Shop Inspected', variant: 'default' };
    case 'fx_refreshed':
      return { label: 'FX Refreshed', variant: 'success' };
    default:
      return { label: action.replace(/_/g, ' '), variant: 'default' };
  }
}

export async function listAuditLogs(params?: {
  vendorId?: string;
  action?: string;
  search?: string;
  limit?: number;
  page?: number;
}): Promise<AuditListResponse> {
  const query = new URLSearchParams();
  if (params?.vendorId) query.set('vendorId', params.vendorId);
  if (params?.action && params.action !== 'all') query.set('action', params.action);
  if (params?.search) query.set('search', params.search);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.page) query.set('page', String(params.page));

  const qs = query.toString();
  return apiClient.get<AuditListResponse>(`/admin/audit${qs ? `?${qs}` : ''}`);
}

export async function recordStaffAudit(
  action: string,
  vendorId?: string,
  summary?: string,
  metadata?: any
): Promise<{ recorded: boolean }> {
  return apiClient.post<{ recorded: boolean }>('/admin/audit/record', {
    action,
    vendorId,
    summary,
    metadata,
  });
}

export async function getComputedAlerts(): Promise<ComputedAlertsResponse> {
  return apiClient.get<ComputedAlertsResponse>('/admin/alerts/computed');
}

export async function getTrialClocks(filter: 'next7' | 'past' | 'all' = 'next7'): Promise<TrialsResponse> {
  return apiClient.get<TrialsResponse>(`/admin/trials?filter=${filter}`);
}
