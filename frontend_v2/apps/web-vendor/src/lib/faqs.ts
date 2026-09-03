/**
 * FAQ API service
 */

import { apiClient } from './api';
import type { Faq, FaqFormData } from '../types/faq';

export async function getFaqs(): Promise<Faq[]> {
  const response = await apiClient.get<{ faqs: Faq[] }>('/faqs');
  return response.faqs || [];
}

export async function getFaq(id: string): Promise<Faq> {
  return apiClient.get<Faq>(`/faqs/${id}`);
}

export async function createFaq(faq: FaqFormData): Promise<Faq> {
  return apiClient.post<Faq>('/faqs', faq);
}

export async function updateFaq(id: string, faq: Partial<FaqFormData>): Promise<Faq> {
  return apiClient.put<Faq>(`/faqs/${id}`, faq);
}

export async function deleteFaq(id: string): Promise<void> {
  return apiClient.delete(`/faqs/${id}`);
}
