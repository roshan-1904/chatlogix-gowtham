import { apiClient } from './api';
import { tokenStorage } from '@chatlogix/auth';

export type EnhanceEntityType = 'product' | 'faq';

export interface EnhanceChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface EnhancePreview {
  description?: string;
  answer?: string;
  question?: string;
  keywords?: string[];
}

export interface StartEnhanceSessionResponse {
  sessionId: string;
  expiresAt: string;
  resumed: boolean;
  sufficient: boolean;
  messages: EnhanceChatMessage[];
  preview: EnhancePreview;
}

export interface PostEnhanceMessageResponse {
  messages: EnhanceChatMessage[];
  preview: EnhancePreview;
  assistantMessage: string;
}

export async function startEnhanceSession(
  entityType: EnhanceEntityType,
  entityId: string
): Promise<StartEnhanceSessionResponse> {
  return apiClient.post<StartEnhanceSessionResponse>('/catalog-enhance/sessions', {
    entityType,
    entityId
  });
}

export async function sendEnhanceMessage(
  sessionId: string,
  content: string
): Promise<PostEnhanceMessageResponse> {
  return apiClient.post<PostEnhanceMessageResponse>(
    `/catalog-enhance/sessions/${sessionId}/messages`,
    { content }
  );
}

export async function acceptEnhancePreview(
  sessionId: string,
  body?: { applyKeywords?: boolean; updateQuestion?: boolean }
): Promise<unknown> {
  return apiClient.post(`/catalog-enhance/sessions/${sessionId}/accept`, body ?? {});
}

export async function sendEnhanceVoice(
  sessionId: string,
  audio: Blob
): Promise<PostEnhanceMessageResponse & { transcript?: string }> {
  const token = tokenStorage.getToken();
  const base = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
  const res = await fetch(`${base}/catalog-enhance/sessions/${sessionId}/voice`, {
    method: 'POST',
    headers: {
      'Content-Type': audio.type || 'audio/webm',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    credentials: 'include',
    body: audio
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.message || err.error || 'Voice upload failed') as Error & {
      status?: number;
    };
    e.status = res.status;
    throw e;
  }
  return res.json();
}
