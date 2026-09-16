export type UserRole = 'admin' | 'vendor' | 'vendor_staff';

export type RegistrationStatus = 'onboarding' | 'pending_approval' | 'approved' | 'rejected';

export interface User {
  phoneNumber: string;
  roles: UserRole[];
  vendorId?: string;
  registrationStatus?: RegistrationStatus;
}

export interface AuthResponse {
  token: string;
  user: User;
  isNewUser: boolean;
}

export interface SignupResponse extends AuthResponse {
  /** Trial wallet money is in millirupees (1 rupee = 1000), not paise. */
  trial?: {
    balanceMilli: number;
    grantedMilli: number;
    expiresAt: string;
  };
  redirectTo?: string;
}

export interface RefreshResponse {
  token: string;
  user: User;
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
