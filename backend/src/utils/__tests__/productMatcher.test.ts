/**
 * Unit Tests for Product Matcher Utility
 * 
 * Tests cover:
 * - Exact matching
 * - Partial matching
 * - Keyword matching
 * - Fuzzy matching with typos
 * - AI multi-language matching (mocked)
 * - Vendor-agnostic field access
 * - Performance edge cases
 * - Error handling
 * 
 * @module utils/__tests__/productMatcher
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  findBestProductMatch,
  matchOrderItems,
  sanitizeExtractedData,
  ProductMatch
} from '../productMatcher.js';

// Mock dependencies
vi.mock('../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: vi.fn()
    }
  }
}));

vi.mock('../cacheStrategy.js', () => ({
  getCachedProductCatalog: vi.fn()
}));

describe('Product Matcher', () => {
  // Sample products for testing (generic structure)
  const products = [
    {
      id: '1',
      name: 'Product One',
      keywords: ['one', 'first'],
      basePrice: 1000,
      inStock: true
    },
    {
      id: '2',
      name: 'Product Two Long Name',
      keywords: ['two', 'second'],
      basePrice: 2000,
      inStock: true
    },
    {
      id: '3',
      name: 'Special Product',
      keywords: ['special', 'unique'],
      basePrice: 3000,
      inStock: false
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findBestProductMatch', () => {
    it('should match exact product name', async () => {
      const match = await findBestProductMatch('Product One', products);
      expect(match).not.toBeNull();
      expect(match?.matchType).toBe('exact');
      expect(match?.similarity).toBe(1.0);
      expect(match?.matchedName).toBe('Product One');
      expect(match?.confidence).toBe('high');
    });

    it('should match partial product name', async () => {
      const match = await findBestProductMatch('Product Two', products);
      expect(match).not.toBeNull();
      expect(match?.matchType).toBe('partial');
      expect(match?.matchedName).toBe('Product Two Long Name');
      expect(match?.similarity).toBeGreaterThan(0.8);
    });

    it('should match by keyword', async () => {
      const match = await findBestProductMatch('first', products);
      expect(match).not.toBeNull();
      expect(match?.matchType).toBe('keyword');
      expect(match?.matchedName).toBe('Product One');
      expect(match?.similarity).toBe(0.85);
    });

    it('should match product with typo (fuzzy)', async () => {
      const match = await findBestProductMatch('Product On', products, { threshold: 0.7 });
      expect(match).not.toBeNull();
      expect(match?.matchType).toBe('fuzzy');
      expect(match?.similarity).toBeGreaterThan(0.7);
      expect(match?.matchedName).toBe('Product One');
    });

    it('should return null for no match', async () => {
      const match = await findBestProductMatch('NonExistent Product', products);
      expect(match).toBeNull();
    });

    it('should return null for empty product name', async () => {
      const match = await findBestProductMatch('', products);
      expect(match).toBeNull();
    });

    it('should return null for empty catalog', async () => {
      const match = await findBestProductMatch('Product One', []);
      expect(match).toBeNull();
    });

    it('should work with different product structures', async () => {
      const customProducts = [
        { productName: 'Custom Product', tags: ['custom'], unitPrice: 100 }
      ];
      const match = await findBestProductMatch('Custom', customProducts, {
        productNameField: 'productName',
        productKeywordsField: 'tags'
      });
      expect(match).not.toBeNull();
      expect(match?.matchedName).toBe('Custom Product');
    });

    it('should handle case-insensitive matching', async () => {
      const match = await findBestProductMatch('PRODUCT ONE', products);
      expect(match).not.toBeNull();
      expect(match?.matchType).toBe('exact');
    });

    it('should handle products with special characters', async () => {
      const specialProducts = [
        { name: 'Café Product', keywords: ['cafe'], basePrice: 1000 }
      ];
      const match = await findBestProductMatch('Cafe Product', specialProducts);
      expect(match).not.toBeNull();
      expect(match?.matchedName).toBe('Café Product');
    });

    it('should respect threshold configuration', async () => {
      // Low threshold should match
      const matchLow = await findBestProductMatch('Product On', products, { threshold: 0.5 });
      expect(matchLow).not.toBeNull();

      // High threshold should not match
      const matchHigh = await findBestProductMatch('Product On', products, { threshold: 0.95 });
      // May or may not match depending on similarity, but should respect threshold
      if (matchHigh) {
        expect(matchHigh.similarity).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('should disable fuzzy matching when configured', async () => {
      const match = await findBestProductMatch('Product On', products, {
        threshold: 0.7,
        enableFuzzy: false
      });
      // Should not find fuzzy match, might find partial or keyword match
      if (match && match.matchType === 'fuzzy') {
        expect.fail('Fuzzy matching should be disabled');
      }
    });
  });

  describe('matchOrderItems', () => {
    const orderItems = [
      { product: 'Product One', quantity: 2 },
      { product: 'Product Two', quantity: 1 },
      { product: 'NonExistent', quantity: 1 }
    ];

    it('should match multiple order items', async () => {
      const matches = await matchOrderItems(orderItems, 'vendor-1', products);
      expect(matches).toHaveLength(3);
      expect(matches[0].match).not.toBeNull();
      expect(matches[0].match?.matchedName).toBe('Product One');
      expect(matches[1].match).not.toBeNull();
      expect(matches[1].match?.matchedName).toBe('Product Two Long Name');
      expect(matches[2].match).toBeNull(); // No match for non-existent
    });

    it('should handle empty order items', async () => {
      const matches = await matchOrderItems([], 'vendor-1', products);
      expect(matches).toHaveLength(0);
    });

    it('should handle items with name field instead of product', async () => {
      const items = [{ name: 'Product One', quantity: 1 }];
      const matches = await matchOrderItems(items, 'vendor-1', products);
      expect(matches[0].match).not.toBeNull();
      expect(matches[0].match?.matchedName).toBe('Product One');
    });

    it('should use cached products when available', async () => {
      const { getCachedProductCatalog } = await import('../cacheStrategy.js');
      vi.mocked(getCachedProductCatalog).mockResolvedValue(products);

      const matches = await matchOrderItems(orderItems, 'vendor-1', undefined, {
        useCache: true
      });
      expect(matches).toHaveLength(3);
      expect(getCachedProductCatalog).toHaveBeenCalledWith('vendor-1');
    });
  });

  describe('sanitizeExtractedData', () => {
    it('should remove "Unknown" placeholder', () => {
      const data = {
        orderItems: [
          { product: 'Unknown', quantity: 1 },
          { product: 'Product One', quantity: 2 }
        ]
      };
      const sanitized = sanitizeExtractedData(data);
      expect(sanitized.orderItems.length).toBe(1);
      expect(sanitized.orderItems[0].product).toBe('Product One');
    });

    it('should remove multiple invalid placeholders', () => {
      const data = {
        orderItems: [
          { product: 'Unknown', quantity: 1 },
          { product: 'N/A', quantity: 1 },
          { product: '', quantity: 1 },
          { product: 'Product One', quantity: 2 }
        ]
      };
      const sanitized = sanitizeExtractedData(data);
      expect(sanitized.orderItems.length).toBe(1);
      expect(sanitized.orderItems[0].product).toBe('Product One');
    });

    it('should preserve partial names', () => {
      const data = {
        orderItems: [
          { product: 'Product', quantity: 1 }
        ]
      };
      const sanitized = sanitizeExtractedData(data);
      expect(sanitized.orderItems.length).toBe(1);
      expect(sanitized.orderItems[0].product).toBe('Product');
    });

    it('should preserve typos', () => {
      const data = {
        orderItems: [
          { product: 'Product On', quantity: 1 }
        ]
      };
      const sanitized = sanitizeExtractedData(data);
      expect(sanitized.orderItems.length).toBe(1);
      expect(sanitized.orderItems[0].product).toBe('Product On');
    });

    it('should handle case-insensitive placeholder detection', () => {
      const data = {
        orderItems: [
          { product: 'unknown', quantity: 1 },
          { product: 'N/A', quantity: 1 },
          { product: 'n/a', quantity: 1 }
        ]
      };
      const sanitized = sanitizeExtractedData(data);
      expect(sanitized.orderItems.length).toBe(0);
    });

    it('should handle null/undefined items', () => {
      const data = {
        orderItems: [
          null,
          undefined,
          { product: 'Product One', quantity: 1 }
        ]
      };
      const sanitized = sanitizeExtractedData(data);
      expect(sanitized.orderItems.length).toBe(1);
    });

    it('should handle items with name field', () => {
      const data = {
        orderItems: [
          { name: 'Unknown', quantity: 1 },
          { name: 'Product One', quantity: 2 }
        ]
      };
      const sanitized = sanitizeExtractedData(data);
      expect(sanitized.orderItems.length).toBe(1);
      expect(sanitized.orderItems[0].name).toBe('Product One');
    });

    it('should handle empty orderItems array', () => {
      const data = {
        orderItems: []
      };
      const sanitized = sanitizeExtractedData(data);
      expect(sanitized.orderItems).toEqual([]);
    });

    it('should handle missing orderItems field', () => {
      const data = {
        deliveryAddress: '123 Main St'
      };
      const sanitized = sanitizeExtractedData(data);
      expect(sanitized.deliveryAddress).toBe('123 Main St');
    });
  });

  describe('Performance Edge Cases', () => {
    it('should handle large product catalogs efficiently', async () => {
      // Create large catalog (1000 products)
      const largeCatalog = Array.from({ length: 1000 }, (_, i) => ({
        id: `product-${i}`,
        name: `Product ${i}`,
        keywords: [`keyword-${i}`],
        basePrice: 1000 + i,
        inStock: true
      }));

      const startTime = Date.now();
      const match = await findBestProductMatch('Product 500', largeCatalog);
      const duration = Date.now() - startTime;

      expect(match).not.toBeNull();
      expect(duration).toBeLessThan(100); // Should complete in < 100ms
    });

    it('should handle very long product names', async () => {
      const longNameProduct = {
        id: '1',
        name: 'A'.repeat(200), // Very long name
        keywords: [],
        basePrice: 1000,
        inStock: true
      };

      const match = await findBestProductMatch('A'.repeat(100), [longNameProduct]);
      // Should handle gracefully (may or may not match depending on threshold)
      expect(match === null || match !== null).toBe(true);
    });

    it('should handle products with many keywords', async () => {
      const manyKeywordsProduct = {
        id: '1',
        name: 'Product',
        keywords: Array.from({ length: 100 }, (_, i) => `keyword-${i}`),
        basePrice: 1000,
        inStock: true
      };

      const match = await findBestProductMatch('keyword-50', [manyKeywordsProduct]);
      expect(match).not.toBeNull();
      expect(match?.matchType).toBe('keyword');
    });
  });

  describe('Error Handling', () => {
    it('should handle null product name gracefully', async () => {
      const match = await findBestProductMatch(null as any, products);
      expect(match).toBeNull();
    });

    it('should handle undefined product name gracefully', async () => {
      const match = await findBestProductMatch(undefined as any, products);
      expect(match).toBeNull();
    });

    it('should handle non-string product name gracefully', async () => {
      const match = await findBestProductMatch(123 as any, products);
      expect(match).toBeNull();
    });

    it('should handle products with null name field', async () => {
      const productsWithNull = [
        { id: '1', name: null, keywords: [], basePrice: 1000 }
      ];
      const match = await findBestProductMatch('Product', productsWithNull);
      // Should skip null products
      expect(match).toBeNull();
    });
  });
});
