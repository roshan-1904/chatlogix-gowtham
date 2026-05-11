import { describe, it, expect, vi } from 'vitest';
import { getTemplate } from '../catalogTemplateService.js';

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe('catalogTemplateService.getTemplate', () => {
  it('returns an empty list for unsupported categories', async () => {
    const out = await getTemplate('crypto-mining-rigs');
    expect(out).toEqual([]);
  });

  it('returns a populated, no-price catalog for grocery', async () => {
    const out = await getTemplate('grocery');
    expect(out.length).toBeGreaterThan(10);
    for (const draft of out) {
      expect(draft.basePrice).toBeNull();
      expect(draft.isActive).toBe(false);
      expect(draft.sourceMeta.warnings).toContain('needs_pricing');
      expect(draft.name.length).toBeGreaterThan(0);
    }
  });

  it('returns an empty list for stub categories that have no items yet', async () => {
    const restaurant = await getTemplate('restaurant');
    const bakery = await getTemplate('bakery');
    expect(Array.isArray(restaurant)).toBe(true);
    expect(Array.isArray(bakery)).toBe(true);
    expect(restaurant.length).toBe(0);
    expect(bakery.length).toBe(0);
  });

  it('normalizes category casing/whitespace', async () => {
    const a = await getTemplate('GROCERY');
    const b = await getTemplate('  grocery  ');
    expect(a.length).toBe(b.length);
  });

  it('produces deterministic, unique rowIds within a category', async () => {
    const out = await getTemplate('grocery');
    const ids = new Set(out.map((d) => d.rowId));
    expect(ids.size).toBe(out.length);
  });
});
