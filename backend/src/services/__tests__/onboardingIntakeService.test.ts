import { describe, it, expect } from 'vitest';
import {
  asExtractedFields,
  buildDemoPrompts,
  computeCompleteness,
  getNextQuestions,
  OVERALL_READY_THRESHOLD,
  MAX_INTAKE_QUESTIONS,
  type IntakeContext,
  type IntakeState
} from '../onboardingIntakeService.js';

function richContext(): IntakeContext {
  return {
    businessName: 'Priya Home Bakery',
    category: 'Food',
    fulfillment: 'both',
    deliveryArea: 'Coimbatore',
    hours: '10am–8pm',
    address: '12 MG Road',
    city: 'Coimbatore',
    language: 'en',
    minOrderPayment: 'Cash or UPI',
    fullListConfirmed: true,
    products: [
      { name: 'Almond Cookies', basePrice: 15000, baseUnit: 'box', description: 'Crunchy eggless almond cookies in a gift box.' },
      { name: 'Brownie', basePrice: 8000, baseUnit: 'piece', description: 'Rich chocolate brownie slice.' },
      { name: 'Cupcake', basePrice: 6000, baseUnit: 'piece', description: 'Vanilla frosted cupcake.' }
    ]
  };
}

describe('computeCompleteness', () => {
  it('scores rich extract at or above 80%', () => {
    const result = computeCompleteness(richContext());
    expect(result.overall).toBeGreaterThanOrEqual(OVERALL_READY_THRESHOLD);
    expect(result.readyForDemo).toBe(true);
  });

  it('scores sparse price-only CSV low', () => {
    const sparse: IntakeContext = {
      products: [
        { name: 'Item A', basePrice: 10000, baseUnit: 'piece', description: 'Item A' },
        { name: 'Item B', basePrice: 12000, baseUnit: 'piece', description: null }
      ]
    };
    const result = computeCompleteness(sparse);
    expect(result.overall).toBeLessThan(OVERALL_READY_THRESHOLD);
    expect(result.readyForDemo).toBe(false);
  });
});

describe('getNextQuestions', () => {
  it('returns highest-weight gap for sparse catalog', () => {
    const ctx: IntakeContext = {
      products: [{ name: 'Item A', basePrice: 10000, baseUnit: 'piece' }]
    };
    const intake: IntakeState = { answers: {}, askedIds: [] };
    const completeness = computeCompleteness(ctx);
    const questions = getNextQuestions(ctx, intake, completeness);
    expect(['businessName', 'productPrices', 'productDescriptions', 'fulfillment']).toContain(
      questions[0]?.id
    );
  });

  it('allows more than 3 questions while below 80%', () => {
    const ctx: IntakeContext = {
      products: [{ name: 'Item A', basePrice: null, baseUnit: 'piece' }]
    };
    const intake: IntakeState = {
      answers: {},
      askedIds: ['businessName', 'productPrices', 'fulfillment']
    };
    const completeness = computeCompleteness(ctx);
    expect(completeness.readyForDemo).toBe(false);
    const questions = getNextQuestions(ctx, intake, completeness);
    expect(questions.length).toBeGreaterThan(0);
  });

  it('stops at engineering ceiling of 10 questions', () => {
    const ctx: IntakeContext = { products: [] };
    const intake: IntakeState = {
      answers: {},
      askedIds: Array.from({ length: MAX_INTAKE_QUESTIONS }, (_, i) => `q${i}`)
    };
    const completeness = computeCompleteness(ctx);
    expect(getNextQuestions(ctx, intake, completeness)).toEqual([]);
  });

  it('returns at most 2 extras after 80%', () => {
    const ctx = richContext();
    const intake: IntakeState = { answers: {}, askedIds: [], extraAfter80: 2 };
    const completeness = computeCompleteness(ctx);
    expect(completeness.readyForDemo).toBe(true);
    expect(getNextQuestions(ctx, intake, completeness)).toEqual([]);
  });
});

describe('buildDemoPrompts', () => {
  it('builds product-specific prompts', () => {
    const prompts = buildDemoPrompts(
      [{ name: 'Almond Cookies' }, { name: 'Brownie' }],
      'Coimbatore'
    );
    expect(prompts[0]).toContain('Almond Cookies');
    expect(prompts.some((p) => p.includes('Coimbatore'))).toBe(true);
  });
});

describe('asExtractedFields', () => {
  it('wraps flat intake draft strings so the confirm form can read .value', () => {
    const fields = asExtractedFields({
      businessName: 'Priya Home Bakery',
      address: '12 Avinashi Road',
      city: 'Coimbatore'
    });
    expect(fields?.businessName).toEqual({ value: 'Priya Home Bakery', confidence: 1 });
    expect(fields?.address.value).toBe('12 Avinashi Road');
    expect(fields?.city.value).toBe('Coimbatore');
  });
});
