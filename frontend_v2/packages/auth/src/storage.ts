// Token storage utilities
// localStorage for web, SecureStore for mobile (to be implemented)

export interface TokenStorage {
  getToken(): string | null;
  setToken(token: string): void;
  removeToken(): void;
}

class LocalStorageTokenStorage implements TokenStorage {
  private readonly TOKEN_KEY = 'chatlogix_auth_token';

  getToken(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }
    return localStorage.getItem(this.TOKEN_KEY);
  }

  setToken(token: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  removeToken(): void {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.removeItem(this.TOKEN_KEY);
  }
}

// For mobile, we'll need to use SecureStore from expo-secure-store
// This will be implemented when we integrate with mobile app
class SecureStoreTokenStorage implements TokenStorage {
  // Placeholder - will be implemented with expo-secure-store
  getToken(): string | null {
    // TODO: Implement with expo-secure-store
    return null;
  }

  setToken(_token: string): void {
    // TODO: Implement with expo-secure-store
  }

  removeToken(): void {
    // TODO: Implement with expo-secure-store
  }
}

// Factory function to get the appropriate storage based on platform
export function createTokenStorage(isMobile: boolean = false): TokenStorage {
  if (isMobile) {
    return new SecureStoreTokenStorage();
  }
  return new LocalStorageTokenStorage();
}

// Default storage for web
export const tokenStorage = createTokenStorage(false);

