import type { AuthResponse, RefreshResponse, SendCodeResponse, SignupResponse } from './types';

export interface AuthApiConfig {
  baseURL: string;
  getRecaptchaToken?: () => Promise<string>;
}

export class AuthApi {
  private baseURL: string;
  private getRecaptchaToken?: () => Promise<string>;

  constructor(config: AuthApiConfig) {
    this.baseURL = config.baseURL;
    this.getRecaptchaToken = config.getRecaptchaToken;
  }

  async sendCode(phoneNumber: string, recaptchaToken?: string): Promise<SendCodeResponse> {
    let token = recaptchaToken;
    if (!token && this.getRecaptchaToken) {
      try {
        token = await this.getRecaptchaToken();
      } catch (error) {
        console.warn('reCAPTCHA token not available:', error);
      }
    }

    const response = await fetch(`${this.baseURL}/auth/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        phoneNumber,
        ...(token ? { recaptchaToken: token } : {}),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to send code' }));
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async verifyCode(
    phoneNumber: string,
    sessionInfo: string,
    code: string
  ): Promise<AuthResponse> {
    const response = await fetch(`${this.baseURL}/auth/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phoneNumber, sessionInfo, code }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to verify code' }));
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async signupVerify(
    phoneNumber: string,
    sessionInfo: string,
    code: string
  ): Promise<SignupResponse> {
    const response = await fetch(`${this.baseURL}/auth/signup/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phoneNumber, sessionInfo, code }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to create account' }));
      throw new Error(error.message || error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async refresh(): Promise<RefreshResponse | null> {
    const response = await fetch(`${this.baseURL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to refresh session' }));
      throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async logout(): Promise<void> {
    await fetch(`${this.baseURL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  }
}
