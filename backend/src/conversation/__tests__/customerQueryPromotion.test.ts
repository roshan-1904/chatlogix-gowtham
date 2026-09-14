import { describe, it, expect, vi, beforeEach } from 'vitest';

const customerQueryFindFirst = vi.fn();
const customerQueryUpdate = vi.fn();
const faqCreate = vi.fn();
const embedFaqQuestionSafe = vi.fn();
const invalidateFaqs = vi.fn();
const toStoredEnglish = vi.fn();
const logCount = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    customerQuery: {
      findFirst: (...args: unknown[]) => customerQueryFindFirst(...args),
      update: (...args: unknown[]) => customerQueryUpdate(...args)
    },
    faq: { create: (...args: unknown[]) => faqCreate(...args) }
  }
}));
vi.mock('../../config/env.js', () => ({ env: { OPENAI_API_KEY: undefined } }));
vi.mock('../../logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/faqEmbedService.js', () => ({
  embedFaqQuestionSafe: (...args: unknown[]) => embedFaqQuestionSafe(...args)
}));
vi.mock('../prefetch.js', () => ({ invalidateFaqs: (...args: unknown[]) => invalidateFaqs(...args) }));
vi.mock('../metrics.js', () => ({ logCount: (...args: unknown[]) => logCount(...args) }));
vi.mock('../../utils/englishStorage.js', () => ({
  toStoredEnglish: (...args: unknown[]) => toStoredEnglish(...args)
}));

import { promoteCustomerQuery } from '../customerQueryPromotion.js';

beforeEach(() => {
  vi.clearAllMocks();
  toStoredEnglish.mockImplementation(async (text: string) =>
    text.includes('இதுக்கு') ? 'Does the baking tin come with dividers?' : text
  );
  customerQueryFindFirst.mockResolvedValue({
    id: 'query-1',
    vendorId: 'vendor-1',
    status: 'answered',
    questionEn: 'Does the baking tin come with dividers?',
    vendorAnswerEn: 'Yes. The tin includes an adjustable divider set.',
    vendorAnswerOriginal: 'Yes da',
    productId: 'prod-tin'
  });
  faqCreate.mockResolvedValue({ id: 'faq-1', question: 'Does the baking tin come with dividers?', answer: 'Yes.' });
  customerQueryUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'query-1',
    ...data
  }));
  embedFaqQuestionSafe.mockResolvedValue(true);
  invalidateFaqs.mockResolvedValue(undefined);
});

describe('promoteCustomerQuery', () => {
  it('writes an English FAQ from Tamil input and embeds it', async () => {
    const result = await promoteCustomerQuery({
      queryId: 'query-1',
      vendorId: 'vendor-1',
      action: 'faq',
      question: 'இதுக்கு dividers வருமா?',
      answer: 'Yes. The Premium Baking Tin includes an adjustable divider set.'
    });

    expect(faqCreate).toHaveBeenCalledWith({
      data: {
        vendorId: 'vendor-1',
        question: 'Does the baking tin come with dividers?',
        answer: 'Yes. The Premium Baking Tin includes an adjustable divider set.',
        isActive: true
      }
    });
    expect(embedFaqQuestionSafe).toHaveBeenCalledWith('faq-1', 'Does the baking tin come with dividers?');
    expect(invalidateFaqs).toHaveBeenCalledWith('vendor-1');
    expect(result.status).toBe('promoted_to_faq');
    expect(logCount).toHaveBeenCalledWith('CustomerQueryPromotedFaq', { vendorId: 'vendor-1' });
  });

  it('returns 409 when the query is still open', async () => {
    customerQueryFindFirst.mockResolvedValue({ id: 'query-1', vendorId: 'vendor-1', status: 'open' });

    await expect(
      promoteCustomerQuery({
        queryId: 'query-1',
        vendorId: 'vendor-1',
        action: 'faq',
        question: 'Q',
        answer: 'A'
      })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(faqCreate).not.toHaveBeenCalled();
  });
});
