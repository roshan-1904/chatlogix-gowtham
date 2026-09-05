import { describe, it, expect, vi, beforeEach } from 'vitest';

const refreshTokenCreate = vi.fn();
const refreshTokenFindUnique = vi.fn();
const refreshTokenUpdate = vi.fn();
const refreshTokenUpdateMany = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    refreshToken: {
      create: (...args: unknown[]) => refreshTokenCreate(...args),
      findUnique: (...args: unknown[]) => refreshTokenFindUnique(...args),
      update: (...args: unknown[]) => refreshTokenUpdate(...args),
      updateMany: (...args: unknown[]) => refreshTokenUpdateMany(...args)
    }
  }
}));

vi.mock('../../config/env.js', () => ({
  env: {
    AUTH_REFRESH_TOKEN_EXPIRES_IN: '7d',
    LOG_LEVEL: 'silent'
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const {
  createRefreshToken,
  validateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken
} = await import('../refreshTokenService.js');

describe('refreshTokenService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshTokenCreate.mockImplementation(async ({ data }: any) => ({
      id: 'token-1',
      ...data,
      revokedAt: null,
      createdAt: new Date()
    }));
    refreshTokenFindUnique.mockResolvedValue(null);
    refreshTokenUpdate.mockResolvedValue(undefined);
    refreshTokenUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('creates a refresh token with hashed value in the database', async () => {
    const result = await createRefreshToken('user-123', '+919876543210');

    expect(result.rawToken).toBeTruthy();
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(refreshTokenCreate).toHaveBeenCalledOnce();

    const createArgs = refreshTokenCreate.mock.calls[0][0];
    expect(createArgs.data.userId).toBe('user-123');
    expect(createArgs.data.phoneNumber).toBe('+919876543210');
    expect(createArgs.data.tokenHash).not.toBe(result.rawToken);
    expect(createArgs.data.tokenHash).toHaveLength(64);
  });

  it('validates an active refresh token', async () => {
    const { rawToken } = await createRefreshToken('user-123', '+919876543210');
    const storedHash = refreshTokenCreate.mock.calls[0][0].data.tokenHash;

    refreshTokenFindUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-123',
      phoneNumber: '+919876543210',
      tokenHash: storedHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null
    });

    const validated = await validateRefreshToken(rawToken);
    expect(validated).toEqual({
      userId: 'user-123',
      tokenId: 'token-1',
      phoneNumber: '+919876543210'
    });
  });

  it('rejects revoked or missing refresh tokens', async () => {
    await expect(validateRefreshToken('')).rejects.toMatchObject({ statusCode: 401 });

    refreshTokenFindUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-123',
      tokenHash: 'abc',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date()
    });

    await expect(validateRefreshToken('some-token')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rotates a refresh token by revoking the old row and creating a new one', async () => {
    const { rawToken } = await createRefreshToken('user-123', '+919876543210');
    const storedHash = refreshTokenCreate.mock.calls[0][0].data.tokenHash;

    refreshTokenFindUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-123',
      phoneNumber: '+919876543210',
      tokenHash: storedHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null
    });

    const rotated = await rotateRefreshToken(rawToken, 'user-123');

    expect(refreshTokenUpdate).toHaveBeenCalledWith({
      where: { id: 'token-1' },
      data: { revokedAt: expect.any(Date) }
    });
    expect(refreshTokenCreate).toHaveBeenCalledTimes(2);
    expect(rotated.rawToken).not.toBe(rawToken);
    expect(rotated.userId).toBe('user-123');
  });

  it('revokes a refresh token by hash', async () => {
    await revokeRefreshToken('opaque-token');

    expect(refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String), revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
  });
});
