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

import { sendTypingIndicator } from '../whatsappClient.js';

describe('sendTypingIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.WHATSAPP_ACCESS_TOKEN = 'test-token';
    envState.WHATSAPP_PHONE_NUMBER_ID = 'default-phone-id';
  });

  it('POSTs v21 read + typing_indicator with Bearer token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true })
    });

    const result = await sendTypingIndicator('wamid.abc123', 'phone-99');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/phone-99/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json'
    });
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.abc123',
      typing_indicator: { type: 'text' }
    });
    expect(init.signal).toBeDefined();
  });

  it('returns ok: true on 2xx even when success field is absent', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      }
    });

    await expect(sendTypingIndicator('wamid.abc123', 'phone-99')).resolves.toEqual({ ok: true });
  });

  it('returns ok: false on HTTP 4xx without throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad request'
    });

    await expect(sendTypingIndicator('wamid.abc123', 'phone-99')).resolves.toEqual({ ok: false });
  });

  it('returns ok: false on fetch abort/timeout without throwing', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));

    await expect(sendTypingIndicator('wamid.abc123', 'phone-99')).resolves.toEqual({ ok: false });
  });

  it('returns ok: false when credentials are missing', async () => {
    envState.WHATSAPP_ACCESS_TOKEN = undefined;

    await expect(sendTypingIndicator('wamid.abc123', 'phone-99')).resolves.toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
