import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthState, AuthResponse, UserRole, User } from './types';
import { tokenStorage } from './storage';
import { AuthApi } from './api';

// Utility to decode JWT token payload (without verification)
// This is safe for extracting user info - backend verifies the signature
function decodeJWT(token: string): { userId: string; phoneNumber: string; roles: string[]; vendorId?: string; exp?: number } | null {
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
  };
}

interface AuthContextValue extends AuthState {
  login: (phoneNumber: string, sessionInfo: string, code: string) => Promise<void>;
  sendCode: (phoneNumber: string, recaptchaToken?: string) => Promise<{ sessionInfo: string; expiresIn: number }>;
  logout: () => void;
  hasRole: (role: string) => boolean;
  refreshAuth: () => Promise<void>;
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

  // Load token from storage on mount and restore user session
  useEffect(() => {
    const token = tokenStorage.getToken();
    if (token) {
      // Check if token is expired
      if (isTokenExpired(token)) {
        // Token is expired, clear it
        tokenStorage.removeToken();
        setState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return;
      }
      
      // Decode token to extract user information
      const user = extractUserFromToken(token);
      if (user) {
        // Restore authenticated session
        setState({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        // Token is invalid or corrupted, clear it
        tokenStorage.removeToken();
        setState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } else {
      setState((prev) => ({
        ...prev,
        isLoading: false,
      }));
    }
  }, []);

  const sendCode = useCallback(
    async (phoneNumber: string, recaptchaToken?: string) => {
      const response = await api.sendCode(phoneNumber, recaptchaToken);
      return response;
    },
    [api]
  );

  const login = useCallback(
    async (phoneNumber: string, sessionInfo: string, code: string) => {
      try {
        const response: AuthResponse = await api.verifyCode(phoneNumber, sessionInfo, code);
        
        // Store token
        tokenStorage.setToken(response.token);
        
        // Update state
        setState({
          user: response.user,
          token: response.token,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
        }));
        throw error;
      }
    },
    [api]
  );

  const logout = useCallback(() => {
    tokenStorage.removeToken();
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  const hasRole = useCallback(
    (role: string) => {
      return state.user?.roles.includes(role as UserRole) ?? false;
    },
    [state.user]
  );

  const refreshAuth = useCallback(async () => {
    // Reload token from storage and restore user info
    const token = tokenStorage.getToken();
    if (token) {
      // Check if token is expired
      if (isTokenExpired(token)) {
        tokenStorage.removeToken();
        setState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return;
      }
      
      const user = extractUserFromToken(token);
      if (user) {
        setState({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        // Token is invalid, clear it
        tokenStorage.removeToken();
        setState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } else {
      setState({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        sendCode,
        logout,
        hasRole,
        refreshAuth,
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

