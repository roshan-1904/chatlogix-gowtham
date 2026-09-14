import { describe, it, expect } from 'vitest';
import {
  isProductSufficient,
  isFaqSufficient,
  productMissingHints
} from '../catalogEnhanceSufficiency.js';

describe('catalogEnhanceSufficiency', () => {
  it('product insufficient with name only', () => {
    expect(isProductSufficient({ name: 'Rose Cake' })).toBe(false);
  });

  it('product sufficient with long description', () => {
    expect(
      isProductSufficient({
        name: 'Rose Cake',
        description: 'A'.repeat(40)
      })
    ).toBe(true);
  });

  it('product sufficient with category', () => {
    expect(isProductSufficient({ name: 'Tea', category: 'Beverages' })).toBe(true);
  });

  it('product sufficient with session user text', () => {
    expect(
      isProductSufficient({
        name: 'Tea',
        sessionMessages: [{ role: 'user', content: 'x'.repeat(20), createdAt: '' }]
      })
    ).toBe(true);
  });

  it('faq sufficient when answer is long enough', () => {
    expect(
      isFaqSufficient({
        question: 'Delivery?',
        answer: 'We deliver daily within the city limits.'
      })
    ).toBe(true);
  });

  it('faq insufficient with short answer', () => {
    expect(isFaqSufficient({ question: 'Hi?', answer: 'Yes' })).toBe(false);
  });

  it('productMissingHints returns at least one hint', () => {
    const hints = productMissingHints({ name: 'X' });
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.length).toBeLessThanOrEqual(4);
  });
});
