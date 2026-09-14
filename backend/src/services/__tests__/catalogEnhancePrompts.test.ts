import { describe, it, expect } from 'vitest';
import { buildFaqEnhanceSystemPrompt } from '../catalogEnhancePrompts.js';

describe('buildFaqEnhanceSystemPrompt', () => {
  it('requires English FAQ question and answer', () => {
    const prompt = buildFaqEnhanceSystemPrompt({ businessName: 'Ibell' });
    expect(prompt).toMatch(/Always write FAQ question and answer in English/);
    expect(prompt).not.toMatch(/Match the language of the original/);
  });
});
