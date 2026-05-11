import { useCallback, useMemo } from 'react';
import { useAuth } from '../modules/auth/AuthContext';

const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000';

type RequestBody =
  | string
  | Blob
  | ArrayBufferView
  | ArrayBuffer
  | FormData
  | URLSearchParams
  | ReadableStream<Uint8Array>
  | null
  | undefined
  | Record<string, any>;

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: RequestBody;
  skipAuth?: boolean;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return undefined as unknown as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

function normalizeBody(body: RequestBody, headers: Headers): BodyInit | undefined {
  if (body === null || typeof body === 'undefined') {
    return undefined;
  }

  if (body instanceof FormData || typeof body === 'string' || body instanceof Blob) {
    return body as BodyInit;
  }

  if (body instanceof URLSearchParams) {
    headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
    return body as BodyInit;
  }

  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return body as BodyInit;
  }

  headers.set('Content-Type', 'application/json');
  return JSON.stringify(body);
}

export function useApiClient() {
  const { token, logout } = useAuth();

  const request = useCallback(
    async <T>(path: string, options: RequestOptions = {}) => {
      const { skipAuth, body, headers: headersInit, ...rest } = options;
      const headers = new Headers(headersInit || {});
      const url = path.startsWith('http') ? path : `${API_URL}${path}`;

      if (!skipAuth) {
        if (!token) {
          throw new Error('You are not authenticated.');
        }
        headers.set('Authorization', `Bearer ${token}`);
      }

      const normalizedBody = normalizeBody(body, headers);

      const response = await fetch(url, {
        ...rest,
        headers,
        body: normalizedBody
      });

      if (response.status === 401) {
        logout();
        throw new Error('Session expired. Please sign in again.');
      }

      if (response.status === 204) {
        return undefined as T;
      }

      if (!response.ok) {
        const errorPayload = await parseJsonResponse<{ error?: any; message?: string }>(response);
        const message =
          (errorPayload && (errorPayload.error?.message || errorPayload.message)) ||
          `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      return parseJsonResponse<T>(response);
    },
    [token, logout]
  );

  return useMemo(
    () => ({
      get: <T>(path: string, options?: RequestOptions) =>
        request<T>(path, { ...(options || {}), method: 'GET' }),
      post: <T>(path: string, body?: RequestBody, options?: RequestOptions) =>
        request<T>(path, { ...(options || {}), method: 'POST', body }),
      put: <T>(path: string, body?: RequestBody, options?: RequestOptions) =>
        request<T>(path, { ...(options || {}), method: 'PUT', body }),
      patch: <T>(path: string, body?: RequestBody, options?: RequestOptions) =>
        request<T>(path, { ...(options || {}), method: 'PATCH', body }),
      delete: <T>(path: string, options?: RequestOptions) =>
        request<T>(path, { ...(options || {}), method: 'DELETE' }),
      request
    }),
    [request]
  );
}


