import { apiClient } from './api';
import type {
  CustomerQueryDetail,
  CustomerQueryListResponse,
} from '../types/customerQuery';

export async function getCustomerQueries(params?: {
  status?: string;
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<CustomerQueryListResponse> {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (params?.category) search.set('category', params.category);
  if (params?.search) search.set('search', params.search);
  if (params?.page) search.set('page', String(params.page));
  if (params?.pageSize) search.set('pageSize', String(params.pageSize));
  const qs = search.toString();
  return apiClient.get<CustomerQueryListResponse>(`/customer-queries${qs ? `?${qs}` : ''}`);
}

export async function getCustomerQuerySummary(): Promise<{ openCount: number }> {
  return apiClient.get<{ openCount: number }>('/customer-queries/summary');
}

export async function getCustomerQuery(id: string): Promise<CustomerQueryDetail> {
  return apiClient.get<CustomerQueryDetail>(`/customer-queries/${id}`);
}

export async function replyToCustomerQuery(
  id: string,
  content: string,
): Promise<{ markedOpenQueries: number }> {
  return apiClient.post<{ markedOpenQueries: number }>(`/customer-queries/${id}/reply`, { content });
}

export async function getPromotionDraft(id: string): Promise<{
  question: string;
  answer: string;
  suggestedAction: 'faq' | 'catalog' | 'dismiss';
}> {
  return apiClient.post(`/customer-queries/${id}/promotion-draft`, {});
}

export async function promoteCustomerQuery(
  id: string,
  body: {
    action: 'faq' | 'catalog' | 'dismiss';
    question?: string;
    answer?: string;
    productId?: string | null;
    dismissReason?: string;
  },
): Promise<{ status: string; productId?: string | null; editPath?: string; faqId?: string }> {
  return apiClient.post(`/customer-queries/${id}/promote`, body);
}
