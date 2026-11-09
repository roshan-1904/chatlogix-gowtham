import { describe, it, expect } from 'vitest';
import { parseOrderItems } from '../orderParsing';

describe('orderParsing (P1.3)', () => {
  it('preserves productId and matchedProductId when present in raw item array', () => {
    const rawItems = [
      {
        product: 'Mysore Pak',
        productId: 'prod_mysore_01',
        quantity: 2,
        unitPrice: 150,
        totalPrice: 300,
      },
    ];

    const parsed = parseOrderItems(rawItems);
    expect(parsed[0].product).toBe('Mysore Pak');
    expect(parsed[0].productId).toBe('prod_mysore_01');
    expect(parsed[0].matchedProductId).toBe('prod_mysore_01');
  });

  it('normalizes cart-engine items with lineTotalPaise and id', () => {
    const cartItems = [
      {
        name: 'Kaju Katli 500g',
        id: 'prod_kaju_99',
        quantity: 1,
        unitPricePaise: 45000,
        lineTotalPaise: 45000,
      },
    ];

    const parsed = parseOrderItems(cartItems);
    expect(parsed[0].product).toBe('Kaju Katli 500g');
    expect(parsed[0].productId).toBe('prod_kaju_99');
    expect(parsed[0].matchedProductId).toBe('prod_kaju_99');
    expect(parsed[0].unitPrice).toBe(450);
    expect(parsed[0].totalPrice).toBe(450);
  });

  it('handles JSON string input gracefully', () => {
    const jsonStr = JSON.stringify([
      {
        name: 'Gulab Jamun',
        matchedProductId: 'prod_gj_02',
        quantity: 3,
        unitPrice: 60,
        totalPrice: 180,
      },
    ]);

    const parsed = parseOrderItems(jsonStr);
    expect(parsed.length).toBe(1);
    expect(parsed[0].product).toBe('Gulab Jamun');
    expect(parsed[0].productId).toBe('prod_gj_02');
    expect(parsed[0].matchedProductId).toBe('prod_gj_02');
  });
});

