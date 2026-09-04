import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fetchMock, envState } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  envState: {
    WHATSAPP_ACCESS_TOKEN: 'test-token' as string | undefined,
    WHATSAPP_PHONE_NUMBER_ID: 'default-phone-id' as string | undefined
  }
}));

vi.mock('node-fetch', () => ({
  default: (...args: unknown[]) => fetchMock(...args)
}));

vi.mock('../../config/env.js', () => ({
  env: envState
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
});
