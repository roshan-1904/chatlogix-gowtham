import { describe, it, expect, vi, beforeEach } from 'vitest';

const messageFindUnique = vi.fn();
const messageFindFirst = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    message: {
      findUnique: (...args: unknown[]) => messageFindUnique(...args),
      findFirst: (...args: unknown[]) => messageFindFirst(...args)
    }
  }
}));
vi.mock('../../conversation/metrics.js', () => ({ logCount: vi.fn() }));
vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import {
  buildQuotedReplyFallbackBody,
  planOutboundTextForQuote,
  resolveQuoteWamid,
  truncateForFallbackPrefix
} from '../quotedReplyHelpers.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildQuotedReplyFallbackBody', () => {
  it('formats intro, quoted question, and vendor reply', () => {
    const body = buildQuotedReplyFallbackBody(
      'Regarding your earlier message:',
      'dividers varuma?',
      'Yes, included.'
    );
    expect(body).toBe('Regarding your earlier message:\n\n"dividers varuma?"\n\nYes, included.');
  });

  it('truncates very long question text in the prefix only', () => {
    const long = 'a'.repeat(500);
    const truncated = truncateForFallbackPrefix(long, 400);
    expect(truncated.endsWith('…')).toBe(true);
    expect(truncated.length).toBe(401);
  });
});

describe('resolveQuoteWamid', () => {
  it('returns wamid for customer messages', async () => {
    messageFindUnique.mockResolvedValue({
      id: 'm1',
      conversationId: 'conv-1',
      senderType: 'customer',
      whatsappMessageId: 'wamid.1',
      content: 'hello'
    });
    const result = await resolveQuoteWamid('m1', 'stored question', 'conv-1');
    expect(result).toEqual({
      internalMessageId: 'm1',
      whatsappMessageId: 'wamid.1',
      fallbackQuestionOriginal: 'stored question'
    });
  });

  it('refuses to quote an anchor from another conversation', async () => {
    messageFindUnique.mockResolvedValue({
      id: 'm1',
      conversationId: 'conv-other',
      senderType: 'customer',
      whatsappMessageId: 'wamid.1',
      content: 'hello'
    });
    const result = await resolveQuoteWamid('m1', 'stored question', 'conv-1');
    expect(result?.whatsappMessageId).toBeNull();
    expect(planOutboundTextForQuote('answer', result, 'Intro:').useQuoteContext).toBe(false);
  });

  it('refuses to quote a vendor message', async () => {
    messageFindUnique.mockResolvedValue({
      id: 'm1',
      conversationId: 'conv-1',
      senderType: 'vendor',
      whatsappMessageId: 'wamid.1',
      content: 'hello'
    });
    const result = await resolveQuoteWamid('m1', 'stored question', 'conv-1');
    expect(result?.whatsappMessageId).toBeNull();
  });

  it('returns fallback-only when wamid is missing', async () => {
    messageFindUnique.mockResolvedValue({
      id: 'm1',
      conversationId: 'conv-1',
      senderType: 'customer',
      whatsappMessageId: null,
      content: 'hello'
    });
    const result = await resolveQuoteWamid('m1', 'stored question', 'conv-1');
    expect(result?.whatsappMessageId).toBeNull();
    expect(planOutboundTextForQuote('answer', result, 'Intro:').useQuoteContext).toBe(false);
  });
});
