import { describe, it, expect } from 'vitest';
import { computeUnitPricePaise } from '../cart/productResolve.js';

describe('computeUnitPricePaise', () => {
  it('divides basePrice by baseQuantity', () => {
    expect(computeUnitPricePaise({ basePrice: 10000, baseQuantity: 2 })).toBe(5000);
  });

  it('treats a missing/zero baseQuantity as 1', () => {
    expect(computeUnitPricePaise({ basePrice: 10000, baseQuantity: 0 })).toBe(10000);
  });
});
