import { describe, it, expect, vi, beforeEach } from 'vitest';

const envState = vi.hoisted(() => ({
  isFirebase: false,
  nodeEnv: 'test' as string,
  allowDev: undefined as string | undefined,
  apiKey: undefined as string | undefined
}));

vi.mock('../../config/env.js', () => ({
  get env() {
    return {
      NODE_ENV: envState.nodeEnv,
      AUTH_ALLOW_DEV_OTP: envState.allowDev,
      FIREBASE_API_KEY: envState.apiKey
    };
  },
  get isFirebaseAuthConfigured() {
    return Boolean(envState.apiKey);
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const { sendVerificationCode, verifyCode } = await import('../phoneAuth.js');

describe('phoneAuth', () => {
  beforeEach(() => {
    envState.isFirebase = false;
    envState.nodeEnv = 'test';
    envState.allowDev = undefined;
    envState.apiKey = undefined;
    vi.unstubAllGlobals();
  });

  it('creates a dev OTP session when Firebase is not configured', async () => {
    const { sessionInfo, delivery } = await sendVerificationCode('+919876543210');
    expect(delivery).toBe('dev');
    const verified = await verifyCode(sessionInfo, '123456');
    expect(verified.phoneNumber).toBe('+919876543210');
  });

  it('rejects a wrong dev OTP', async () => {
    const { sessionInfo } = await sendVerificationCode('+919876543210');
    await expect(verifyCode(sessionInfo, '000000')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refuses the hardcoded OTP in production without Firebase', async () => {
    envState.nodeEnv = 'production';
    await expect(sendVerificationCode('+919876543210')).rejects.toMatchObject({ statusCode: 503 });
  });

  it('sends through Firebase Identity Toolkit when configured', async () => {
    envState.apiKey = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionInfo: 'firebase-session' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendVerificationCode('+919876543210', 'recaptcha-token');
    expect(result).toEqual({ sessionInfo: 'firebase-session', delivery: 'firebase' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('accounts:sendVerificationCode');
    expect(JSON.parse(String(init.body))).toEqual({
      phoneNumber: '+919876543210',
      recaptchaToken: 'recaptcha-token'
    });
  });

  it('requires reCAPTCHA when Firebase is configured', async () => {
    envState.apiKey = 'test-key';
    await expect(sendVerificationCode('+919876543210')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/reCAPTCHA/i)
    });
  });

  it('verifies a Firebase OTP', async () => {
    envState.apiKey = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        localId: 'firebase-uid',
        phoneNumber: '+919876543210',
        isNewUser: false
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const verified = await verifyCode('firebase-session', '654321');
    expect(verified).toEqual({
      userId: 'firebase-uid',
      phoneNumber: '+919876543210',
      isNewUser: false
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('accounts:signInWithPhoneNumber');
    expect(JSON.parse(String(init.body))).toEqual({
      sessionInfo: 'firebase-session',
      code: '654321'
    });
  });
});
