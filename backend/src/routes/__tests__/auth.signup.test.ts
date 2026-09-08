import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { AddressInfo } from 'node:net';
import { CustomError, ErrorType, ErrorSeverity } from '../../middleware/errorHandler.js';

const verifyCodeMock = vi.fn();
const createTrialVendorMock = vi.fn();
const findVendorByPhoneMock = vi.fn();
const resolveRolesMock = vi.fn();
const createRefreshMock = vi.fn();
const generateAuthTokenMock = vi.fn();
const setRefreshCookieMock = vi.fn();

vi.mock('../../services/phoneAuth.js', () => ({
  sendVerificationCode: vi.fn(),
  verifyCode: (...args: unknown[]) => verifyCodeMock(...args)
}));

vi.mock('../../services/recaptchaParams.js', () => ({
  fetchRecaptchaParams: vi.fn()
}));

vi.mock('../../config/env.js', () => ({
  isFirebaseAuthConfigured: false,
  env: { AUTH_ADMIN_PHONES: '' }
}));

vi.mock('../../services/vendorSignupService.js', () => ({
  createTrialVendor: (...args: unknown[]) => createTrialVendorMock(...args),
  findVendorByPhone: (...args: unknown[]) => findVendorByPhoneMock(...args)
}));

vi.mock('../../services/roleService.js', () => ({
  resolveRolesForPhone: (...args: unknown[]) => resolveRolesMock(...args)
}));

vi.mock('../../services/tokenService.js', () => ({
  generateAuthToken: (...args: unknown[]) => generateAuthTokenMock(...args)
}));

vi.mock('../../services/refreshTokenService.js', () => ({
  createRefreshToken: (...args: unknown[]) => createRefreshMock(...args),
  validateRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn()
}));

vi.mock('../../utils/authCookies.js', () => ({
  REFRESH_COOKIE_NAME: 'chatlogix_refresh',
  setRefreshCookie: (...args: unknown[]) => setRefreshCookieMock(...args),
  clearRefreshCookie: vi.fn()
}));

vi.mock('../../services/onboardingFunnelService.js', () => ({
  logOnboardingFunnelEvent: vi.fn()
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const { authRouter } = await import('../auth.js');
const { enhancedGlobalErrorHandler } = await import('../../middleware/errorHandler.js');

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/auth', authRouter);
app.use(enhancedGlobalErrorHandler);

let baseUrl: string;
const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth`;

afterAll(() => {
  server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  createRefreshMock.mockResolvedValue({ rawToken: 'refresh-token' });
  generateAuthTokenMock.mockReturnValue('jwt-token');
});

describe('POST /auth/signup/verify', () => {
  it('creates trial vendor with ₹100 wallet and returns JWT', async () => {
    verifyCodeMock.mockResolvedValue({
      userId: 'firebase-uid',
      phoneNumber: '+919876543210',
      isNewUser: true
    });
    createTrialVendorMock.mockResolvedValue({
      id: 'vendor-1',
      vendorId: 'vendor-1',
      registrationStatus: 'onboarding',
      walletBalance: 10000,
      trialGrantedPaise: 10000,
      trialExpiresAt: new Date('2026-10-05T00:00:00.000Z')
    });

    const res = await fetch(`${baseUrl}/signup/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: '+919876543210',
        sessionInfo: 'session-abc',
        code: '123456'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe('jwt-token');
    expect(body.user.vendorId).toBe('vendor-1');
    expect(body.user.registrationStatus).toBe('onboarding');
    expect(body.trial.grantedPaise).toBe(10000);
    expect(body.trial.balancePaise).toBe(10000);
    expect(createTrialVendorMock).toHaveBeenCalledWith({
      phoneNumber: '+919876543210',
      firebaseUid: 'firebase-uid'
    });
  });

  it('blocks duplicate phone on signup', async () => {
    verifyCodeMock.mockResolvedValue({
      userId: 'firebase-uid',
      phoneNumber: '+919876543210',
      isNewUser: false
    });
    createTrialVendorMock.mockRejectedValue(
      new CustomError(
        'This phone number already has an account',
        409,
        ErrorType.VALIDATION,
        ErrorSeverity.LOW,
        true,
        { code: 'phone_already_registered' }
      )
    );

    const res = await fetch(`${baseUrl}/signup/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: '+919876543210',
        sessionInfo: 'session-abc',
        code: '123456'
      })
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(createTrialVendorMock).toHaveBeenCalled();
  });
});

describe('POST /auth/signup/check-phone', () => {
  it('reports registered phones', async () => {
    findVendorByPhoneMock.mockResolvedValue({ id: 'vendor-1' });

    const res = await fetch(`${baseUrl}/signup/check-phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '+919876543210' })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registered).toBe(true);
  });
});
