import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { AddressInfo } from 'node:net';

const verifyCodeMock = vi.fn();
const resolveRolesMock = vi.fn();
const createRefreshMock = vi.fn();
const validateRefreshMock = vi.fn();
const rotateRefreshMock = vi.fn();
const revokeRefreshMock = vi.fn();
const generateAuthTokenMock = vi.fn();
const setRefreshCookieMock = vi.fn();
const clearRefreshCookieMock = vi.fn();
const vendorFindFirstMock = vi.fn();
const vendorFindManyMock = vi.fn();
const adminFindFirstMock = vi.fn();

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

vi.mock('../../services/roleService.js', () => ({
  resolveRolesForPhone: (...args: unknown[]) => resolveRolesMock(...args)
}));

vi.mock('../../services/tokenService.js', () => ({
  generateAuthToken: (...args: unknown[]) => generateAuthTokenMock(...args)
}));

vi.mock('../../services/refreshTokenService.js', () => ({
  createRefreshToken: (...args: unknown[]) => createRefreshMock(...args),
  validateRefreshToken: (...args: unknown[]) => validateRefreshMock(...args),
  rotateRefreshToken: (...args: unknown[]) => rotateRefreshMock(...args),
  revokeRefreshToken: (...args: unknown[]) => revokeRefreshMock(...args)
}));

vi.mock('../../utils/authCookies.js', () => ({
  REFRESH_COOKIE_NAME: 'chatlogix_refresh',
  setRefreshCookie: (...args: unknown[]) => setRefreshCookieMock(...args),
  clearRefreshCookie: (...args: unknown[]) => clearRefreshCookieMock(...args)
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findFirst: (...args: unknown[]) => vendorFindFirstMock(...args),
      findMany: (...args: unknown[]) => vendorFindManyMock(...args)
    },
    admin: {
      findFirst: (...args: unknown[]) => adminFindFirstMock(...args)
    }
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const { authRouter } = await import('../auth.js');

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/auth', authRouter);

let baseUrl: string;
const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth`;

afterAll(() => {
  server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  verifyCodeMock.mockResolvedValue({
    userId: 'user-1',
    phoneNumber: '+919876543210',
    isNewUser: false
  });
  resolveRolesMock.mockResolvedValue({ roles: ['vendor'], vendorId: 'vendor-1' });
  generateAuthTokenMock.mockReturnValue('access-token');
  createRefreshMock.mockResolvedValue({ rawToken: 'refresh-token-1', expiresAt: new Date() });
  validateRefreshMock.mockResolvedValue({
    userId: 'user-1',
    tokenId: 'token-1',
    phoneNumber: '+919876543210'
  });
  rotateRefreshMock.mockResolvedValue({
    rawToken: 'refresh-token-2',
    expiresAt: new Date(),
    userId: 'user-1'
  });
  revokeRefreshMock.mockResolvedValue(undefined);
  vendorFindFirstMock.mockResolvedValue({ phone: '+919876543210' });
  vendorFindManyMock.mockResolvedValue([]);
  adminFindFirstMock.mockResolvedValue(null);
});

describe('auth refresh routes', () => {
  it('sets refresh cookie on verify-code', async () => {
    const res = await fetch(`${baseUrl}/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: '+919876543210',
        sessionInfo: 'session-1',
        code: '123456'
      })
    });

    expect(res.status).toBe(200);
    expect(createRefreshMock).toHaveBeenCalledWith('user-1', '+919876543210');
    expect(setRefreshCookieMock).toHaveBeenCalledWith(expect.anything(), 'refresh-token-1');
    expect(await res.json()).toMatchObject({
      token: 'access-token',
      user: { phoneNumber: '+919876543210', roles: ['vendor'], vendorId: 'vendor-1' }
    });
  });

  it('returns a new access token on refresh when cookie is present', async () => {
    const res = await fetch(`${baseUrl}/refresh`, {
      method: 'POST',
      headers: {
        Cookie: 'chatlogix_refresh=refresh-token-1'
      }
    });

    expect(res.status).toBe(200);
    expect(validateRefreshMock).toHaveBeenCalledWith('refresh-token-1');
    expect(rotateRefreshMock).toHaveBeenCalledWith('refresh-token-1', 'user-1');
    expect(setRefreshCookieMock).toHaveBeenCalledWith(expect.anything(), 'refresh-token-2');
    expect(await res.json()).toEqual({
      token: 'access-token',
      user: {
        phoneNumber: '+919876543210',
        roles: ['vendor'],
        vendorId: 'vendor-1'
      }
    });
  });

  it('returns 401 when refresh cookie is missing', async () => {
    const res = await fetch(`${baseUrl}/refresh`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('revokes refresh token and clears cookie on logout', async () => {
    const res = await fetch(`${baseUrl}/logout`, {
      method: 'POST',
      headers: {
        Cookie: 'chatlogix_refresh=refresh-token-1'
      }
    });

    expect(res.status).toBe(204);
    expect(revokeRefreshMock).toHaveBeenCalledWith('refresh-token-1');
    expect(clearRefreshCookieMock).toHaveBeenCalledOnce();
  });
});
