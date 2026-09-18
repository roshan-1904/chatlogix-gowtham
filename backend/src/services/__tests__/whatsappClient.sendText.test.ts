import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fetchMock, envState, prismaMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  envState: {
    WHATSAPP_ACCESS_TOKEN: 'test-token' as string | undefined,
    WHATSAPP_PHONE_NUMBER_ID: 'default-phone-id' as string | undefined
  },
  prismaMock: {
    whatsAppNumber: { findUnique: vi.fn() }
  }
}));

vi.mock('node-fetch', () => ({
  default: (...args: unknown[]) => fetchMock(...args)
}));

vi.mock('../../config/env.js', () => ({
  env: envState
}));

vi.mock('../../db/prisma.js', () => ({ prisma: prismaMock }));

vi.mock('../../utils/whatsappTokenCrypto.js', () => ({
  decryptWhatsAppToken: vi.fn((enc: string) => enc.replace(/^enc:/, ''))
}));

vi.mock('../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

import { sendWhatsAppText } from '../whatsappClient.js';

// Regression test for the 2026-09-04 incident: a response-queue message with
// no phoneNumberId and no WHATSAPP_PHONE_NUMBER_ID env fallback used to
// resolve to `undefined` silently (sendWhatsAppText returned undefined
// instead of throwing), so responseProcessor.ts logged the send as a
// success and deleted the SQS message even though WhatsApp was never called.
describe('sendWhatsAppText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.WHATSAPP_ACCESS_TOKEN = 'test-token';
    envState.WHATSAPP_PHONE_NUMBER_ID = 'default-phone-id';
    prismaMock.whatsAppNumber.findUnique.mockResolvedValue(null);
  });

  it('sends via the Graph API when a phoneNumberId is available', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.sent-1' }] })
    });

    const result = await sendWhatsAppText('919000000000', 'hello', 'phone-99');

    expect(result).toEqual({ messageId: 'wamid.sent-1' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('falls back to the env WHATSAPP_PHONE_NUMBER_ID when none is passed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.sent-2' }] })
    });

    await sendWhatsAppText('919000000000', 'hello');

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('default-phone-id');
  });

  it('includes context.message_id when replyToWhatsappMessageId is set', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.quoted' }] })
    });

    await sendWhatsAppText('919000000000', 'answer', 'phone-99', {
      replyToWhatsappMessageId: 'wamid.customer-1'
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { context?: { message_id: string } };
    expect(body.context).toEqual({ message_id: 'wamid.customer-1' });
  });

  it('throws instead of silently no-op-ing when no phoneNumberId is available anywhere', async () => {
    envState.WHATSAPP_PHONE_NUMBER_ID = undefined;

    await expect(sendWhatsAppText('919000000000', 'hello')).rejects.toThrow(/phoneNumberId/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when the access token is missing, even with a phoneNumberId passed in', async () => {
    envState.WHATSAPP_ACCESS_TOKEN = undefined;

    await expect(sendWhatsAppText('919000000000', 'hello', 'phone-99')).rejects.toThrow(/phoneNumberId/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses decrypted tenant token when WhatsAppNumber has encrypted token', async () => {
    prismaMock.whatsAppNumber.findUnique.mockResolvedValue({
      phoneNumberId: 'tenant-phone',
      accessTokenEncrypted: 'enc:tenant-secret',
      connectStatus: 'live'
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.tenant' }] })
    });

    await sendWhatsAppText('919000000000', 'hello', 'tenant-phone');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const auth =
      init.headers instanceof Headers
        ? init.headers.get('Authorization')
        : (init.headers as Record<string, string>).Authorization;
    expect(auth).toContain('tenant-secret');
    expect(auth).not.toContain('test-token');
  });

  it('uses the global token for a legacy row that has no tenant token', async () => {
    prismaMock.whatsAppNumber.findUnique.mockResolvedValue({
      phoneNumberId: 'legacy-phone',
      accessTokenEncrypted: null,
      connectStatus: null
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.legacy' }] })
    });

    await sendWhatsAppText('919000000000', 'hello', 'legacy-phone');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('legacy-phone');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  it('throws when P2h row is live but tenant token is missing', async () => {
    prismaMock.whatsAppNumber.findUnique.mockResolvedValue({
      phoneNumberId: 'tenant-phone',
      accessTokenEncrypted: null,
      connectStatus: 'live'
    });

    await expect(sendWhatsAppText('919000000000', 'hello', 'tenant-phone')).rejects.toThrow(
      /tenant token missing/i
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
