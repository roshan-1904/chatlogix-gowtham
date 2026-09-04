import { ApiClient } from '@chatlogix/api-client';
import { tokenStorage } from '@chatlogix/auth';

export const API_URL = import.meta.env.VITE_API_URL || 'https://chatlogix.in/api';

export const apiClient = new ApiClient({
  baseURL: API_URL,
  getToken: () => tokenStorage.getToken(),
  onUnauthorized: () => {
    // Clear token and redirect to login
    tokenStorage.removeToken();
    window.location.href = '/login';
  },
  retries: 2,
});

