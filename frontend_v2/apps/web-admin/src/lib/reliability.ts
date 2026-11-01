import { apiClient } from './api';

export interface ApiErrorStats {
  totalErrors: number;
  currentErrorRate: number;
  uptime: number;
  errorCounts?: Record<string, number>;
  timestamp?: string;
}

export interface FailedMessage {
  id: string;
  conversationId: string;
  timestamp: string;
  vendorId: string;
  businessName: string;
  customerPhone: string;
  content: string;
  failureReason: string | null;
  senderType: string;
}

export interface FailedMessagesResponse {
  from: string;
  to: string;
  items: FailedMessage[];
  count: number;
}

export interface PausedConversation {
  id: string;
  vendorId: string;
  businessName: string;
  customerId: string;
  customerPhone: string;
  updatedAt: string;
  hint: string;
}

export interface PausedConversationsResponse {
  items: PausedConversation[];
  count: number;
}

export interface WalletBlockEventItem {
  id: string;
  vendorId: string;
  businessName: string;
  customerPhone: string;
  reason: string;
  createdAt: string;
  templateSent?: boolean;
}

export interface WalletBlocksResponse {
  supported: boolean;
  status: 'pending_migration' | 'ready';
  message: string;
  from?: string;
  to?: string;
  items: WalletBlockEventItem[];
  count: number;
}

export interface StuckOrder {
  id: string;
  orderNumber: string;
  vendorId: string;
  businessName: string;
  customerPhone: string;
  status: string;
  totalAmountPaise: number;
  updatedAt: string;
}

export interface StuckOrdersResponse {
  cutoff: string;
  items: StuckOrder[];
  count: number;
}

export interface OrderAlert {
  id: string;
  orderId: string;
  orderNumber: string;
  vendorId: string;
  businessName: string;
  customerPhone: string;
  severity: string;
  type: string;
  message: string;
  resolved: boolean;
  createdAt: string;
}

export interface OrderAlertsResponse {
  items: OrderAlert[];
  count: number;
}

export async function getApiErrorStats(): Promise<ApiErrorStats> {
  return apiClient.get<ApiErrorStats>('/errors/stats');
}

export async function getFailedMessages(params?: {
  from?: string;
  to?: string;
  vendorId?: string;
  limit?: number;
}): Promise<FailedMessagesResponse> {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.vendorId) query.set('vendorId', params.vendorId);
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  return apiClient.get<FailedMessagesResponse>(
    `/admin/reliability/failed-messages${qs ? `?${qs}` : ''}`
  );
}

export async function getPausedConversations(params?: {
  vendorId?: string;
  limit?: number;
}): Promise<PausedConversationsResponse> {
  const query = new URLSearchParams();
  if (params?.vendorId) query.set('vendorId', params.vendorId);
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  return apiClient.get<PausedConversationsResponse>(
    `/admin/reliability/paused-conversations${qs ? `?${qs}` : ''}`
  );
}

export async function getWalletBlocks(params?: {
  from?: string;
  to?: string;
  vendorId?: string;
  limit?: number;
}): Promise<WalletBlocksResponse> {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.vendorId) query.set('vendorId', params.vendorId);
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  return apiClient.get<WalletBlocksResponse>(
    `/admin/reliability/wallet-blocks${qs ? `?${qs}` : ''}`
  );
}

export async function getStuckOrders(params?: {
  vendorId?: string;
  limit?: number;
}): Promise<StuckOrdersResponse> {
  const query = new URLSearchParams();
  if (params?.vendorId) query.set('vendorId', params.vendorId);
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  return apiClient.get<StuckOrdersResponse>(
    `/admin/reliability/stuck-orders${qs ? `?${qs}` : ''}`
  );
}

export async function getOrderAlerts(params?: {
  vendorId?: string;
  limit?: number;
}): Promise<OrderAlertsResponse> {
  const query = new URLSearchParams();
  if (params?.vendorId) query.set('vendorId', params.vendorId);
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  return apiClient.get<OrderAlertsResponse>(
    `/admin/reliability/order-alerts${qs ? `?${qs}` : ''}`
  );
}

export function formatPaiseToRupees(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainingMinutes}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

export function formatTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(d);
  } catch {
    return isoString;
  }
}

export function getTopErrorCode(errorCounts?: Record<string, number>): string {
  if (!errorCounts || Object.keys(errorCounts).length === 0) {
    return 'None';
  }
  let maxCount = -1;
  let topKey = 'None';
  for (const [key, count] of Object.entries(errorCounts)) {
    if (typeof count === 'number' && count > maxCount) {
      maxCount = count;
      topKey = key;
    }
  }
  return maxCount > 0 ? `${topKey} (${maxCount})` : topKey;
}
