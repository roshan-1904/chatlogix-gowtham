import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { AddressInfo } from 'node:net';

const productFindFirst = vi.fn();
const productUpdate = vi.fn();
const productFindUnique = vi.fn();
const productFindMany = vi.fn();
const productCount = vi.fn();
const productCreate = vi.fn();
const invalidateCompactCatalog = vi.fn();
const toVendorEnglish = vi.fn();

let currentUser: { id: string; vendorId?: string; roles: string[] } = {
  id: 'user-1',
  vendorId: 'vendor-1',
  roles: ['vendor']
};

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    product: {
      findFirst: (...args: unknown[]) => productFindFirst(...args),
      findUnique: (...args: unknown[]) => productFindUnique(...args),
      findMany: (...args: unknown[]) => productFindMany(...args),
      count: (...args: unknown[]) => productCount(...args),
      update: (...args: unknown[]) => productUpdate(...args),
      create: (...args: unknown[]) => productCreate(...args)
    }
  }
}));
vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock('../../conversation/prefetch.js', () => ({
  invalidateCompactCatalog: (...args: unknown[]) => invalidateCompactCatalog(...args)
}));
vi.mock('../../utils/vendorEnglish.js', () => ({
  needsEnglish: (text: string) => /[^\u0000-\u007F]/.test(text),
  toVendorEnglish: (...args: unknown[]) => toVendorEnglish(...args)
}));

const { productsRouter } = await import('../products.js');

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.user = currentUser;
  next();
});
app.use('/products', productsRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/products`;

afterAll(() => {
  server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  productFindFirst.mockResolvedValue({
    id: 'prod-1',
    vendorId: 'vendor-1',
    name: 'Premium Baking Tin',
    variants: []
  });
  productFindUnique.mockResolvedValue(null);
  productUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'prod-1',
    vendorId: 'vendor-1',
    ...data
  }));
  toVendorEnglish.mockImplementation(async (text: string) => (text.includes('எஸ்எஸ்') ? 'SS 8x8' : text));
});

describe('PUT /products/:id English gate', () => {
  it('stores a Tamil variant label as Latin/English', async () => {
    const res = await fetch(`${baseUrl}/prod-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variants: [
          {
            label: 'எஸ்எஸ் 8x8',
            attributes: { size: '8x8' },
            sku: 'ss-8x8',
            unit: 'pc',
            baseQuantity: 1,
            price: 129900,
            isDivisible: false,
            isActive: true
          }
        ]
      })
    });

    expect(res.status).toBe(200);
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: expect.objectContaining({
        variants: [
          expect.objectContaining({
            label: 'SS 8x8',
            sku: 'SS-8X8'
          })
        ]
      })
    });
  });
});

describe('catalog tenant isolation (docs/launch/02-catalog-tenant-isolation.md)', () => {
  beforeEach(() => {
    currentUser = { id: 'user-1', vendorId: 'shop-A', roles: ['vendor'] };
  });

  it('admin token whose vendorId is shop A, GET /products?vendorId=shop B returns products for shop B', async () => {
    currentUser = { id: 'admin-1', vendorId: 'shop-A', roles: ['admin'] };
    productFindMany.mockResolvedValueOnce([
      { id: 'prod-b1', name: 'Fudge Brownie', vendorId: 'shop-B' }
    ]);
    productCount.mockResolvedValueOnce(1);

    const res = await fetch(`${baseUrl}?vendorId=shop-B`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { products: Array<{ vendorId: string }> };
    expect(body.products).toEqual([expect.objectContaining({ vendorId: 'shop-B' })]);
    expect(productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ vendorId: 'shop-B' })
      })
    );
  });

  it('vendor token for shop A, GET /products?vendorId=shop B returns 403', async () => {
    currentUser = { id: 'vendor-1', vendorId: 'shop-A', roles: ['vendor'] };
    const res = await fetch(`${baseUrl}?vendorId=shop-B`);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Unauthorized');
  });

  it('admin POST /products with body vendorId B creates under B, including when token shop is A', async () => {
    currentUser = { id: 'admin-1', vendorId: 'shop-A', roles: ['admin'] };
    productCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'prod-b2',
      ...data
    }));

    const res = await fetch(`${baseUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Choco Chip Cookie',
        baseUnit: 'box',
        baseQuantity: 1,
        basePrice: 25000,
        vendorId: 'shop-B'
      })
    });

    expect(res.status).toBe(201);
    expect(productCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vendorId: 'shop-B',
        name: 'Choco Chip Cookie'
      })
    });
    expect(invalidateCompactCatalog).toHaveBeenCalledWith('shop-B');
  });

  it('admin PUT /products/:id for a product owned by A, with shop id B, returns 404 and does not change the row', async () => {
    currentUser = { id: 'admin-1', vendorId: 'shop-A', roles: ['admin'] };
    // Product in database belongs to shop-A, but request specifies shop-B
    productFindFirst.mockResolvedValueOnce(null);

    const res = await fetch(`${baseUrl}/prod-owned-by-A?vendorId=shop-B`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed Cookie' })
    });

    expect(res.status).toBe(404);
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it('admin request with no shop id returns 400', async () => {
    currentUser = { id: 'admin-1', vendorId: 'shop-A', roles: ['admin'] };
    const res = await fetch(`${baseUrl}`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Vendor ID required');
  });
});
