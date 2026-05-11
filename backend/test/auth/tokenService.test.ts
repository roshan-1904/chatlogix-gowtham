import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = 'unit-test-secret';
  process.env.FIREBASE_PROJECT_ID = 'test-project';
  process.env.FIREBASE_CLIENT_EMAIL = 'firebase@test-project.iam.gserviceaccount.com';
  process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nABCDEF\\n-----END PRIVATE KEY-----';
  process.env.FIREBASE_API_KEY = 'test-firebase-api-key';
  process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/test';
  process.env.INCOMING_QUEUE_URL = 'test-incoming-queue';
  process.env.RESPONSE_QUEUE_URL = 'test-response-queue';
});

describe('tokenService', () => {
  it('should generate and verify auth tokens with roles', async () => {
    const { generateAuthToken, verifyAuthToken } = await import('../../src/services/tokenService.js');

    const token = generateAuthToken({
      userId: 'firebase-uid-123',
      phoneNumber: '+15551234567',
      roles: ['vendor'],
      vendorId: 'vendor-123'
    });

    expect(typeof token).toBe('string');

    const payload = verifyAuthToken(token);
    expect(payload.userId).toBe('firebase-uid-123');
    expect(payload.phoneNumber).toBe('+15551234567');
    expect(payload.roles).toContain('vendor');
    expect(payload.vendorId).toBe('vendor-123');
  });

  it('should throw on invalid tokens', async () => {
    const { verifyAuthToken } = await import('../../src/services/tokenService.js');
    expect(() => verifyAuthToken('invalid-token')).toThrowError();
  });
});


