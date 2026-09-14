import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { AddressInfo } from 'node:net';

const productFindFirst = vi.fn();
const productUpdate = vi.fn();
const productFindUnique = vi.fn();
const invalidateCompactCatalog = vi.fn();
const toVendorEnglish = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    product: {
      findFirst: (...args: unknown[]) => productFindFirst(...args),
      findUnique: (...args: unknown[]) => productFindUnique(...args),
      update: (...args: unknown[]) => productUpdate(...args),
      create: vi.fn()
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
  req.user = { id: 'user-1', vendorId: 'vendor-1', roles: ['vendor'] };
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
