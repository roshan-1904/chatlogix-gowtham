import { apiClient } from './api';

export type StaffCaseStatus = 'open' | 'waiting' | 'resolved';

export interface StaffCaseNote {
  id: string;
  caseId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface StaffCase {
  id: string;
  vendorId: string;
  subject: string;
  status: StaffCaseStatus;
  conversationId?: string | null;
  openedBy: string;
  createdAt: string;
  updatedAt: string;
  vendor?: {
    id: string;
    businessName: string;
  };
  notes?: StaffCaseNote[];
}

export interface CaseListResponse {
  supported: boolean;
  status?: string;
  message?: string;
  items: StaffCase[];
  count: number;
  page?: number;
  limit?: number;
}

export interface ShopContext {
  vendor: {
    id: string;
    businessName: string;
    walletBalanceMilli: number;
    markupPercent: number;
  };
  whatsapp: {
    phoneNumber: string;
    connectStatus: string;
  } | null;
  lastFailure: {
    id: string;
    conversationId: string;
    timestamp: string;
    failureReason: string;
    preview: string;
  } | null;
  openQuestions: Array<{
    id: string;
    questionEn: string;
    category: string;
    hitCount: number;
    lastSeenAt: string;
    status: string;
  }>;
}

export interface AuditedConversationMessage {
  id: string;
  senderType: 'customer' | 'assistant' | 'vendor' | 'system';
  timestamp: string;
  content: string;
  contentEn: string | null;
  status?: string;
}

export interface AuditedConversation {
  conversationId: string;
  vendor: {
    id: string;
    businessName: string;
  };
  customer: {
    id?: string;
    phone: string;
  };
  auditRecorded: boolean;
  messages: AuditedConversationMessage[];
}

export function isValidStatusTransition(from: StaffCaseStatus, to: StaffCaseStatus): boolean {
  if (from === to) return false;
  if (from === 'open') return to === 'waiting' || to === 'resolved';
  if (from === 'waiting') return to === 'open' || to === 'resolved';
  if (from === 'resolved') return to === 'open';
  return false;
}

export function getStatusBadgeVariant(
  status: StaffCaseStatus
): 'default' | 'success' | 'warning' | 'info' {
  switch (status) {
    case 'open':
      return 'info';
    case 'waiting':
      return 'warning';
    case 'resolved':
      return 'success';
    default:
      return 'default';
  }
}

export function getStatusLabel(status: StaffCaseStatus): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'waiting':
      return 'Waiting';
    case 'resolved':
      return 'Resolved';
    default:
      return status;
  }
}

export async function listCases(params?: {
  status?: string;
  search?: string;
  limit?: number;
  page?: number;
}): Promise<CaseListResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.search) query.set('search', params.search);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.page) query.set('page', String(params.page));

  const qs = query.toString();
  return apiClient.get<CaseListResponse>(`/admin/support/cases${qs ? `?${qs}` : ''}`);
}

export async function getCase(caseId: string): Promise<StaffCase> {
  return apiClient.get<StaffCase>(`/admin/support/cases/${caseId}`);
}

export async function createCase(data: {
  vendorId: string;
  subject: string;
  conversationId?: string;
}): Promise<StaffCase> {
  return apiClient.post<StaffCase>('/admin/support/cases', data);
}

export async function updateCaseStatus(
  caseId: string,
  status: StaffCaseStatus
): Promise<StaffCase> {
  return apiClient.patch<StaffCase>(`/admin/support/cases/${caseId}`, { status });
}

export async function addCaseNote(caseId: string, body: string): Promise<StaffCaseNote> {
  return apiClient.post<StaffCaseNote>(`/admin/support/cases/${caseId}/notes`, { body });
}

export async function getShopContext(vendorId: string): Promise<ShopContext> {
  return apiClient.get<ShopContext>(`/admin/support/vendors/${vendorId}/context`);
}

export async function getAuditedConversation(
  conversationId: string,
  caseId?: string
): Promise<AuditedConversation> {
  const qs = caseId ? `?caseId=${encodeURIComponent(caseId)}` : '';
  return apiClient.get<AuditedConversation>(`/admin/support/conversations/${conversationId}${qs}`);
}
