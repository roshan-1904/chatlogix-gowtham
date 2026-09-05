import { ApiClient } from '@chatlogix/api-client';
import { tokenStorage } from '@chatlogix/auth';
import { authApi } from './auth';

export const API_URL = import.meta.env.VITE_API_URL || 'https://chatlogix.in/api';

export const apiClient = new ApiClient({
  baseURL: API_URL,
  getToken: () => tokenStorage.getToken(),
  onRefresh: async () => {
    const response = await authApi.refresh();
    if (!response) {
      return null;
    }

    tokenStorage.setToken(response.token);
    return response.token;
  },
  onUnauthorized: () => {
    tokenStorage.removeToken();
    window.location.href = '/login';
  },
  retries: 2,
});
