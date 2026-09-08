export * from './types';
export type { RegistrationStatus, SignupResponse } from './types';
export * from './storage';
export * from './api';
export * from './AuthContext';
export * from './hooks';

// Re-export for convenience
export { AuthProvider, useAuth } from './AuthContext';
export { useLogin, useSignup, useLogout, useHasRole, useHasAnyRole, useHasAllRoles } from './hooks';
