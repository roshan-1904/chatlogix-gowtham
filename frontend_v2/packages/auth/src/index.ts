// Authentication Package
// Phone/OTP authentication flow, auth context/provider, token storage

export * from './types';
export * from './storage';
export * from './api';
export * from './AuthContext';
export * from './hooks';

// Re-export for convenience
export { AuthProvider, useAuth } from './AuthContext';
export { useLogin, useLogout, useHasRole, useHasAnyRole, useHasAllRoles } from './hooks';
