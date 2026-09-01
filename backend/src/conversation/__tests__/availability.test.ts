import { describe, it, expect } from 'vitest';
import { checkAvailability } from '../cart/availability.js';

describe('checkAvailability', () => {
  const stockProduct = {
    fulfillmentType: 'stock' as const,
    inStock: true,
    stockQuantity: 10,
    minOrderQuantity: null,
    maxOrderQuantity: null
  };

  const madeToOrderProduct = {
    fulfillmentType: 'made_to_order' as const,
    inStock: false,
    stockQuantity: null,
    minOrderQuantity: null,
    maxOrderQuantity: null
  };

  it('rejects a stock product that is out of stock (§26 test 6)', () => {
    const result = checkAvailability({ ...stockProduct, inStock: false }, 2);
    expect(result).toEqual({ allowed: false, reason: 'out_of_stock' });
  });

  it('rejects a stock product when the requested quantity exceeds stockQuantity', () => {
    const result = checkAvailability(stockProduct, 20);
    expect(result).toEqual({ allowed: false, reason: 'insufficient_stock' });
  });

  it('allows a stock product within stockQuantity', () => {
    const result = checkAvailability(stockProduct, 5);
    expect(result).toEqual({ allowed: true });
  });

  it('allows a made_to_order product even when inStock is false (§26 test 7)', () => {
    const result = checkAvailability(madeToOrderProduct, 3);
    expect(result).toEqual({ allowed: true });
  });

  it('enforces minOrderQuantity for made_to_order products', () => {
    const result = checkAvailability({ ...madeToOrderProduct, minOrderQuantity: 5 }, 2);
    expect(result).toEqual({ allowed: false, reason: 'below_min_qty' });
  });

  it('enforces maxOrderQuantity for made_to_order products', () => {
    const result = checkAvailability({ ...madeToOrderProduct, maxOrderQuantity: 10 }, 20);
    expect(result).toEqual({ allowed: false, reason: 'above_max_qty' });
  });

  it('enforces minOrderQuantity for stock products too, not just made_to_order', () => {
    const result = checkAvailability({ ...stockProduct, minOrderQuantity: 3 }, 1);
    expect(result).toEqual({ allowed: false, reason: 'below_min_qty' });
  });

  it('treats null min/max as "no limit", not zero', () => {
    const result = checkAvailability(madeToOrderProduct, 1000);
    expect(result).toEqual({ allowed: true });
  });
});
