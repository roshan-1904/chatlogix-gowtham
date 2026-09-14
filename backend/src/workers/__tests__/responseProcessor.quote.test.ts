import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendWhatsAppText = vi.fn();
const messageUpdate = vi.fn();

vi.mock('../../services/whatsappClient.js', () => ({
  sendWhatsAppText: (...args: unknown[]) => sendWhatsAppText(...args),
  sendWhatsAppTemplate: vi.fn()
}));
vi.mock('../../services/asyncDatabaseService.js', () => ({ AsyncDatabaseService: vi.fn() }));
vi.mock('../../services/customerInsightsService.js', () => ({
  CustomerInsightsService: vi.fn().mockImplementation(() => ({ updateInsights: vi.fn() }))
}));
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    message: {
      update: (...args: unknown[]) => messageUpdate(...args)
    },
    notificationHistory: { update: vi.fn() }
  }
}));
vi.mock('../../conversation/metrics.js', () => ({ logCount: vi.fn() }));
vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  StepLogger: class {
    step() {}
    warn() {}
    success() {}
    error() {}
  },
  createOperationId: () => 'op-1',
  logWhatsAppOperation: vi.fn(),
  logConversation: vi.fn(),
  logErrorWithContext: vi.fn(),
  logDatabaseFailure: vi.fn(),
  logWhatsAppFailure: vi.fn()
}));

import { WhatsAppSendError } from '../../services/whatsappSendErrors.js';
import { processResponseMessage } from '../responseProcessor.js';

beforeEach(() => {
  vi.clearAllMocks();
  messageUpdate.mockResolvedValue({});
});

describe('processResponseMessage quoted reply fallback', () => {
  it('retries without context and updates Message.content on invalid quote', async () => {
    sendWhatsAppText
      .mockRejectedValueOnce(
        new WhatsAppSendError('bad quote', 400, { isInvalidQuoteContext: true, graphSubcode: 2593006 })
      )
      .mockResolvedValueOnce({ messageId: 'wamid.fallback' });

    await processResponseMessage({
      type: 'text',
      to: '919000000000',
      text: 'Vendor answer',
      messageId: 'out-1',
      phoneNumberId: 'phone-1',
      replyToWhatsappMessageId: 'wamid.old',
      replyToInternalMessageId: 'cust-1',
      fallbackQuestionText: 'dividers varuma?'
    });

    expect(sendWhatsAppText).toHaveBeenCalledTimes(2);
    expect(sendWhatsAppText.mock.calls[0][3]).toEqual({ replyToWhatsappMessageId: 'wamid.old' });
    expect(sendWhatsAppText.mock.calls[1][1]).toContain('dividers varuma?');
    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: 'out-1' },
      data: { content: expect.stringContaining('Vendor answer') }
    });

    // The customer never saw a quoted bubble, so the outbound row must not claim one.
    const sentUpdate = messageUpdate.mock.calls
      .map((call) => call[0] as { data: Record<string, unknown> })
      .find((arg) => arg.data.status === 'sent');
    expect(sentUpdate?.data).not.toHaveProperty('replyToMessageId');
  });

  it('stamps replyToMessageId only when the quoted send succeeds', async () => {
    sendWhatsAppText.mockResolvedValueOnce({ messageId: 'wamid.quoted' });

    await processResponseMessage({
      type: 'text',
      to: '919000000000',
      text: 'Vendor answer',
      messageId: 'out-1',
      phoneNumberId: 'phone-1',
      replyToWhatsappMessageId: 'wamid.old',
      replyToInternalMessageId: 'cust-1',
      fallbackQuestionText: 'dividers varuma?'
    });

    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: 'out-1' },
      data: {
        status: 'sent',
        whatsappMessageId: 'wamid.quoted',
        replyToMessageId: 'cust-1'
      }
    });
  });

  it('does not double-send on auth failures', async () => {
    sendWhatsAppText.mockRejectedValueOnce(new WhatsAppSendError('auth', 401, { isInvalidQuoteContext: false }));

    await expect(
      processResponseMessage({
        type: 'text',
        to: '919000000000',
        text: 'Vendor answer',
        messageId: 'out-1',
        phoneNumberId: 'phone-1',
        replyToWhatsappMessageId: 'wamid.old',
        fallbackQuestionText: 'question?'
      })
    ).rejects.toThrow();

    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['rate limit', new WhatsAppSendError('rate limited', 429, { isInvalidQuoteContext: false })],
    ['server error', new WhatsAppSendError('server error', 503, { isInvalidQuoteContext: false })],
    ['network timeout', new Error('ETIMEDOUT')]
  ])('does not double-send on %s', async (_label, err) => {
    sendWhatsAppText.mockRejectedValueOnce(err);

    await expect(
      processResponseMessage({
        type: 'text',
        to: '919000000000',
        text: 'Vendor answer',
        messageId: 'out-1',
        phoneNumberId: 'phone-1',
        replyToWhatsappMessageId: 'wamid.old',
        fallbackQuestionText: 'question?'
      })
    ).rejects.toThrow();

    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
  });
});
