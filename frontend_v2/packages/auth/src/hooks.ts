import { useCallback } from 'react';
import { useAuth } from './AuthContext';
import type { UserRole } from './types';

/**
 * Hook to get authentication state and actions
 */
export function useAuthState() {
  const auth = useAuth();
  return {
    user: auth.user,
    token: auth.token,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
  };
}

export function useSignup() {
  const { signup, sendCode } = useAuth();
  return { signup, sendCode };
}

/**
 * Hook for login functionality
 */
export function useLogin() {
  const { login, signup, sendCode } = useAuth();

  const handleLogin = useCallback(
    async (phoneNumber: string, sessionInfo: string, code: string) => {
      await login(phoneNumber, sessionInfo, code);
    },
    [login]
  );

  const handleSignup = useCallback(
    async (phoneNumber: string, sessionInfo: string, code: string) => {
      return await signup(phoneNumber, sessionInfo, code);
    },
    [signup]
  );

  const handleSendCode = useCallback(
    async (phoneNumber: string, recaptchaToken?: string) => {
      return await sendCode(phoneNumber, recaptchaToken);
    },
    [sendCode]
  );

  return {
    login: handleLogin,
    signup: handleSignup,
    sendCode: handleSendCode,
  };
}

/**
 * Hook for logout functionality
 */
export function useLogout() {
  const { logout } = useAuth();
  return logout;
}

/**
 * Hook to check if user has a specific role
 */
export function useHasRole(role: UserRole): boolean {
  const { hasRole } = useAuth();
  return hasRole(role);
}

/**
 * Hook to check if user has any of the specified roles
 */
export function useHasAnyRole(roles: UserRole[]): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return roles.some((role) => user.roles.includes(role));
}

/**
 * Hook to check if user has all of the specified roles
 */
export function useHasAllRoles(roles: UserRole[]): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return roles.every((role) => user.roles.includes(role));
}

