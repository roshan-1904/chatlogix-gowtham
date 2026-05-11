// Shared Configuration
// Environment variable validation, API endpoints, feature flags

import { z } from 'zod';

const envSchema = z.object({
  API_URL: z.string().url(),
  ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('development'),
});

export const validateEnv = (env: Record<string, string | undefined>) => {
  return envSchema.parse(env);
};

export const apiEndpoints = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    verifyOtp: '/auth/verify-otp',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
  },
  products: {
    list: '/products',
    create: '/products',
    update: (id: string) => `/products/${id}`,
    delete: (id: string) => `/products/${id}`,
  },
  orders: {
    list: '/orders',
    get: (id: string) => `/orders/${id}`,
    update: (id: string) => `/orders/${id}`,
  },
  templates: {
    list: '/templates',
    create: '/templates',
    update: (id: string) => `/templates/${id}`,
    approve: (id: string) => `/templates/${id}/approve`,
  },
};

export const featureFlags = {
  enableBulkImport: true,
  enableAnalytics: true,
  enablePushNotifications: true,
  enableOfflineMode: false,
} as const;

