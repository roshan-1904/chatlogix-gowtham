import { describe, it, expect } from 'vitest';
import { buildAIPromptsUpdate } from '../vendorAIConfigService.js';

// Phase 0.5.1 fix: PUT /api/vendors/:id/ai-prompts used to silently drop
// `aiProducts`, `aiContentResponsibilities`, `aiContentConversationRules`,
// `aiContentImportantInstructions`, and `aiPreparationTimeMinutes` because the
// Prisma update mapping omitted them. The catalog-import commit flow now
// shares this builder, so a regression here breaks BOTH paths.

describe('buildAIPromptsUpdate — round-trip allow-list', () => {
  it('maps every documented field to its Prisma column', () => {
    const update = buildAIPromptsUpdate({
      botName: 'Bot',
      personality: 'friendly',
      systemPrompt: 'sys',
      greeting: 'hi',
      closing: 'bye',
      preparationTimeMinutes: 30,
      deliveryInstructions: 'deliver',
      pickupDeliveryAddress: 'addr',
      toneExample: 'tone',
      products: 'prods',
      contentResponsibilities: 'resp',
      contentConversationRules: 'rules',
      contentImportantInstructions: 'instr'
    });
    expect(update).toEqual({
      aiBotName: 'Bot',
      aiPersonality: 'friendly',
      aiSystemPrompt: 'sys',
      aiGreeting: 'hi',
      aiClosing: 'bye',
      aiPreparationTimeMinutes: 30,
      aiDeliveryInstructions: 'deliver',
      aiPickupDeliveryAddress: 'addr',
      aiToneExample: 'tone',
      aiProducts: 'prods',
      aiContentResponsibilities: 'resp',
      aiContentConversationRules: 'rules',
      aiContentImportantInstructions: 'instr'
    });
  });

  it('coerces preparationTimeMinutes from string to number (Prisma int column)', () => {
    const update = buildAIPromptsUpdate({ preparationTimeMinutes: '45' });
    expect(update.aiPreparationTimeMinutes).toBe(45);
    expect(typeof update.aiPreparationTimeMinutes).toBe('number');
  });

  it('omits keys that were not provided so partial PATCHes do not overwrite siblings', () => {
    const update = buildAIPromptsUpdate({ greeting: 'hi' });
    expect(update).toEqual({ aiGreeting: 'hi' });
    expect(Object.keys(update)).toHaveLength(1);
  });

  it('treats explicit empty string as a real value (vendor wants to clear the field)', () => {
    const update = buildAIPromptsUpdate({ products: '' });
    expect(update).toEqual({ aiProducts: '' });
  });

  it('does NOT coerce undefined preparationTimeMinutes (must not write 0 or NaN)', () => {
    const update = buildAIPromptsUpdate({ preparationTimeMinutes: undefined });
    expect(update.aiPreparationTimeMinutes).toBeUndefined();
    expect('aiPreparationTimeMinutes' in update).toBe(false);
  });

  it('catches the Phase-0.5.1 regression: aiProducts must be in the mapping', () => {
    // Hard-fail if the bug returns. Without this test, dropping `products`
    // from the mapper would silently corrupt every vendor commit again.
    const update = buildAIPromptsUpdate({ products: 'rice ₹150/kg' });
    expect(update.aiProducts).toBe('rice ₹150/kg');
  });

  it('catches the Phase-0.5.1 regression: aiContent* fields must be in the mapping', () => {
    const update = buildAIPromptsUpdate({
      contentResponsibilities: 'r',
      contentConversationRules: 'cr',
      contentImportantInstructions: 'ii'
    });
    expect(update.aiContentResponsibilities).toBe('r');
    expect(update.aiContentConversationRules).toBe('cr');
    expect(update.aiContentImportantInstructions).toBe('ii');
  });
});
