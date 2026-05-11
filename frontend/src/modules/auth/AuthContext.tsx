import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type UserRole = 'admin' | 'vendor';

export interface AuthUser {
  phoneNumber: string;
  roles: UserRole[];
  vendorId?: string | null;
}

const AUTH_STORAGE_KEY = 'chatlogix.auth';

export interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isInitialized: boolean;
  isAuthenticating: boolean;
  setAuthenticating: (value: boolean) => void;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { token: string; user: AuthUser };
        if (parsed?.token && parsed?.user) {
          setToken(parsed.token);
          setUser(parsed.user);
        }
      }
    } catch (error) {
      console.warn('Failed to load stored authentication state', error);
    } finally {
      setIsInitialized(true);
    }
  }, []);

  const login = (newToken: string, authUser: AuthUser) => {
    setToken(newToken);
    setUser(authUser);
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        token: newToken,
        user: authUser
      })
    );
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
       isInitialized,
      isAuthenticating,
      setAuthenticating: setIsAuthenticating,
      login,
      logout
    }),
    [token, user, isInitialized, isAuthenticating]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

