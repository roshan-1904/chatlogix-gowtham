import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthState, AuthResponse, SendCodeResponse, UserRole, User, SignupResponse, RegistrationStatus } from './types';
import { tokenStorage } from './storage';
import { AuthApi } from './api';

// Utility to decode JWT token payload (without verification)
// This is safe for extracting user info - backend verifies the signature
function decodeJWT(token: string): { userId: string; phoneNumber: string; roles: string[]; vendorId?: string; registrationStatus?: string; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    // Decode base64url encoded payload
    const payload = parts[1];
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    );
    
    return decoded;
  } catch (error) {
    console.warn('Failed to decode JWT token:', error);
    return null;
  }
}

// Check if token is expired
function isTokenExpired(token: string): boolean {
  const decoded = decodeJWT(token);
  if (!decoded || !decoded.exp) {
    // If no expiration claim, assume token is valid (backend will verify)
    return false;
  }
  
  // exp is in seconds, Date.now() is in milliseconds
  const expirationTime = decoded.exp * 1000;
  return Date.now() >= expirationTime;
}

// Extract user info from JWT token
function extractUserFromToken(token: string): User | null {
  const decoded = decodeJWT(token);
  if (!decoded || !decoded.phoneNumber || !decoded.roles) {
    return null;
  }
  
  return {
    phoneNumber: decoded.phoneNumber,
    roles: decoded.roles as UserRole[],
    vendorId: decoded.vendorId,
    registrationStatus: decoded.registrationStatus as RegistrationStatus | undefined,
  };
}

interface AuthContextValue extends AuthState {
  login: (phoneNumber: string, sessionInfo: string, code: string) => Promise<void>;
  signup: (phoneNumber: string, sessionInfo: string, code: string) => Promise<SignupResponse>;
  sendCode: (phoneNumber: string, recaptchaToken?: string) => Promise<SendCodeResponse>;
  logout: () => Promise<void>;
  hasRole: (role: string) => boolean;
  refreshAuth: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
  api: AuthApi;
}

export function AuthProvider({ children, api }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const clearSession = useCallback(() => {
    tokenStorage.removeToken();
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  const applySession = useCallback((token: string, user: User) => {
    tokenStorage.setToken(token);
    setState({
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const restoreSession = useCallback(async () => {
    const token = tokenStorage.getToken();

    if (token && !isTokenExpired(token)) {
      const user = extractUserFromToken(token);
      if (user) {
        applySession(token, user);
        return;
      }
    }

    try {
      const response = await api.refresh();
      if (response) {
        applySession(response.token, response.user);
        return;
      }
    } catch (error) {
      console.warn('Failed to restore session via refresh token:', error);
    }

    clearSession();
  }, [api, applySession, clearSession]);

  // Load token from storage on mount and restore user session
  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const sendCode = useCallback(
    async (phoneNumber: string, recaptchaToken?: string) => {
      const response = await api.sendCode(phoneNumber, recaptchaToken);
      return response;
    },
    [api]
  );

  const signup = useCallback(
    async (phoneNumber: string, sessionInfo: string, code: string) => {
      try {
        const response: SignupResponse = await api.signupVerify(phoneNumber, sessionInfo, code);
        applySession(response.token, response.user);
        return response;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
        }));
        throw error;
      }
    },
    [api, applySession]
  );

  const login = useCallback(
    async (phoneNumber: string, sessionInfo: string, code: string) => {
      try {
        const response: AuthResponse = await api.verifyCode(phoneNumber, sessionInfo, code);
        applySession(response.token, response.user);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
        }));
        throw error;
      }
    },
    [api, applySession]
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch (error) {
      console.warn('Logout request failed:', error);
    } finally {
      clearSession();
    }
  }, [api, clearSession]);

  const hasRole = useCallback(
    (role: string) => {
      return state.user?.roles.includes(role as UserRole) ?? false;
    },
    [state.user]
  );

  const refreshAuth = useCallback(async () => {
    await restoreSession();
  }, [restoreSession]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        signup,
        sendCode,
        logout,
        hasRole,
        refreshAuth,
        restoreSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
