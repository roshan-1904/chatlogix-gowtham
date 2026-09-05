export type UserRole = 'admin' | 'vendor' | 'vendor_staff';

export interface User {
  phoneNumber: string;
  roles: UserRole[];
  vendorId?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  isNewUser: boolean;
}

export interface SendCodeResponse {
  sessionInfo: string;
  expiresIn: number;
  delivery?: 'firebase' | 'dev';
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

