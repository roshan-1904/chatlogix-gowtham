import { describe, it, expect } from 'vitest';
import {
  ENRICHMENT_MODEL,
  buildEnrichmentSystemPrompt,
  shopContextFromVendorProfile
} from '../catalogEnrichmentService.js';

describe('shopContextFromVendorProfile', () => {
  it('maps brochure fields and extras into enricher context', () => {
    const ctx = shopContextFromVendorProfile(
      {
        businessName: { value: 'Priya Home Bakery' },
        city: { value: 'Coimbatore' },
        hours: { value: '10am–8pm' },
        deliveryNotes: { value: 'City-wide delivery' },
        category: { value: 'Food' },
        address: { value: '12 Avinashi Road' }
      },
      { category: 'Food' }
    );
    expect(ctx).toMatchObject({
      businessName: 'Priya Home Bakery',
      city: 'Coimbatore',
      hours: '10am–8pm',
      deliveryNotes: 'City-wide delivery',
      category: 'Food',
      address: '12 Avinashi Road'
    });
  });

  it('returns undefined when the profile is empty', () => {
    expect(
      shopContextFromVendorProfile({
        businessName: { value: null },
        city: { value: '  ' }
      })
    ).toBeUndefined();
  });
});

describe('buildEnrichmentSystemPrompt', () => {
  it('asks for chat-ready descriptions and includes shop facts', () => {
    expect(ENRICHMENT_MODEL).toBe('gpt-4.1-mini');
    const prompt = buildEnrichmentSystemPrompt({
      businessName: 'Priya Home Bakery',
      city: 'Coimbatore',
      hours: '10am–8pm'
    });
    expect(prompt).toMatch(/5-10 short lines/);
    expect(prompt).toMatch(/Priya Home Bakery/);
    expect(prompt).toMatch(/Coimbatore/);
    expect(prompt).toMatch(/Do not invent ingredients/);
  });
});
