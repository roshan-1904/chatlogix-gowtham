import { ApiClient } from '@chatlogix/api-client';
import { tokenStorage } from '@chatlogix/auth';

export const API_URL =
  import.meta.env.VITE_ADMIN_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const apiClient = new ApiClient({
  baseURL: API_URL,
  getToken: () => tokenStorage.getToken(),
  onUnauthorized: () => {
    tokenStorage.removeToken();
    window.location.href = '/login';
  },
  retries: 2,
});
