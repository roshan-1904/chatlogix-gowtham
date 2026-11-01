// API Client
// Fetch/axios wrapper with auth token handling, error handling, retry logic

export interface ApiClientConfig {
  baseURL: string;
  getToken?: () => string | null;
  onUnauthorized?: () => void;
  onRefresh?: () => Promise<string | null>;
  retries?: number;
}

export class ApiError extends Error {
  status: number;
  data?: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export class ApiClient {
  private baseURL: string;
  private getToken?: () => string | null;
  private onUnauthorized?: () => void;
  private onRefresh?: () => Promise<string | null>;
  private retries: number;

  constructor(config: ApiClientConfig | string, getToken?: () => string | null) {
    // Support both old API (baseURL, getToken) and new API (config object)
    if (typeof config === 'string') {
      this.baseURL = config;
      this.getToken = getToken;
      this.retries = 1;
    } else {
      this.baseURL = config.baseURL;
      this.getToken = config.getToken;
      this.onUnauthorized = config.onUnauthorized;
      this.onRefresh = config.onRefresh;
      this.retries = config.retries ?? 1;
    }
  }

  private async requestWithRetry<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0,
    refreshAttempted = false
  ): Promise<T> {
    const token = this.getToken?.();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        headers,
        credentials: options.credentials ?? 'include',
      });

      if (response.status === 401) {
        if (!refreshAttempted && this.onRefresh) {
          const newToken = await this.onRefresh();
          if (newToken) {
            return this.requestWithRetry<T>(endpoint, options, retryCount, true);
          }
        }

        this.onUnauthorized?.();
        throw new Error('Unauthorized - Please login again');
      }

      if (!response.ok) {
        // The API nests errors as `{ error: { message } }`, so `body.message`
        // alone is undefined and every failure collapses into the generic
        // status text. Callers map on the message, so unwrap both shapes.
        let errorMessage = `API Error: ${response.status} ${response.statusText}`;
        let errorData: any = undefined;
        try {
          errorData = await response.json();
          const nested =
            errorData?.error && typeof errorData.error === 'object'
              ? errorData.error.message
              : undefined;
          errorMessage =
            errorData?.message ||
            nested ||
            (typeof errorData?.error === 'string' ? errorData.error : undefined) ||
            errorMessage;
        } catch {
          // If JSON parsing fails, use default message
        }

        // Retry on 5xx errors
        if (response.status >= 500 && retryCount < this.retries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1)));
          return this.requestWithRetry<T>(endpoint, options, retryCount + 1, refreshAttempted);
        }

        throw new ApiError(errorMessage, response.status, errorData);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json();
    } catch (error) {
      // Retry on network errors
      if (retryCount < this.retries && error instanceof TypeError) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1)));
        return this.requestWithRetry<T>(endpoint, options, retryCount + 1, refreshAttempted);
      }
      throw error;
    }
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.requestWithRetry<T>(endpoint, options);
  }

  get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  put<T>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  patch<T>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  delete<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}
