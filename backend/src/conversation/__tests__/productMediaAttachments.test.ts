import { describe, it, expect, vi, beforeEach } from 'vitest';

const productMediaFindMany = vi.fn();
const productMediaFindFirst = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    productMedia: {
      findMany: (...args: unknown[]) => productMediaFindMany(...args),
      findFirst: (...args: unknown[]) => productMediaFindFirst(...args)
    }
  }
}));

import {
  collectSendProductMediaOps,
  resolveProductMediaAttachments,
  MAX_OUTBOUND_IMAGES_PER_TURN
} from '../productMediaAttachments.js';
import { validateProductIds } from '../cart/productResolve.js';
import type { CompactCatalogEntry } from '../types.js';
import { stripSendProductMediaOps } from '../orderStatusGuard.js';

const catalogBase: CompactCatalogEntry = {
  id: 'prod-cake',
  name: 'Cake',
  price: 50000,
  unit: 'piece',
  baseQuantity: 1,
  minQty: null,
  maxQty: null,
  keywords: [],
  fulfillmentType: 'made_to_order',
  inStock: true,
  stockQuantity: null,
  variants: [],
  description: '',
  isDivisible: false,
  imageCount: 2,
  videoCount: 1,
  mediaLabels: ['Front']
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('collectSendProductMediaOps', () => {
  it('dedupes by productId (first wins)', () => {
    const ops = collectSendProductMediaOps([
      { type: 'send_product_media', productId: 'p1', kind: 'image' },
      { type: 'send_product_media', productId: 'p1', kind: 'video' },
      { type: 'send_product_media', productId: 'p2', kind: null }
    ]);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ productId: 'p1', kind: 'image' });
  });
});

describe('resolveProductMediaAttachments', () => {
  it('returns up to 3 images ordered by sortOrder', async () => {
    productMediaFindMany.mockResolvedValue([
      { id: 'm1', kind: 'image' },
      { id: 'm2', kind: 'image' },
      { id: 'm3', kind: 'image' }
    ]);

    const resolved = await resolveProductMediaAttachments(
      'vendor-1',
      [{ type: 'send_product_media', productId: 'prod-1', kind: 'image' }],
      'Here are photos'
    );

    expect(resolved).toHaveLength(3);
    expect(resolved[0]).toEqual({ productMediaId: 'm1', kind: 'image', caption: 'Here are photos' });
    expect(resolved[1].caption).toBeUndefined();
    expect(productMediaFindMany.mock.calls[0][0].take).toBe(MAX_OUTBOUND_IMAGES_PER_TURN);
  });

  it('sends one video when kind is video', async () => {
    productMediaFindFirst.mockResolvedValue({ id: 'v1', kind: 'video' });

    const resolved = await resolveProductMediaAttachments(
      'vendor-1',
      [{ type: 'send_product_media', productId: 'prod-1', kind: 'video' }],
      'Demo video'
    );

    expect(resolved).toEqual([{ productMediaId: 'v1', kind: 'video', caption: 'Demo video' }]);
    expect(productMediaFindMany).not.toHaveBeenCalled();
  });

  it('returns empty when no active media rows', async () => {
    productMediaFindMany.mockResolvedValue([]);
    productMediaFindFirst.mockResolvedValue(null);

    const resolved = await resolveProductMediaAttachments(
      'vendor-1',
      [{ type: 'send_product_media', productId: 'prod-1', kind: 'image' }]
    );

    expect(resolved).toEqual([]);
  });
});

describe('validateProductIds — send_product_media', () => {
  it('drops hallucinated productId', () => {
    const { valid, invalid } = validateProductIds(
      [{ type: 'send_product_media', productId: 'not-in-catalog', kind: 'image' }],
      [catalogBase]
    );
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });

  it('keeps send_product_media when productId is in catalog', () => {
    const { valid, invalid } = validateProductIds(
      [{ type: 'send_product_media', productId: 'prod-cake', kind: null }],
      [catalogBase]
    );
    expect(invalid).toHaveLength(0);
    expect(valid).toHaveLength(1);
  });
});

describe('stripSendProductMediaOps (D6)', () => {
  it('removes send_product_media ops', () => {
    expect(
      stripSendProductMediaOps([
        { type: 'noop' },
        { type: 'send_product_media', productId: 'p1', kind: 'image' }
      ])
    ).toEqual([{ type: 'noop' }]);
  });
});
