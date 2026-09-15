import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { AddressInfo } from 'node:net';

// The product-media API is the only place a vendor can put bytes into the
// WhatsApp media bucket, so the guards worth locking down are the ones that
// keep junk and other tenants' data out: MIME allowlist, size caps, the
// PM6 cap of 10 active assets, tenant isolation, and the HeadObject check
// that stops a row being created for an object that was never uploaded.

const BUCKET = 'chatlogix-wa-media';
const VENDOR_ID = 'vendor-1';
const PRODUCT_ID = 'prod-1';

const productFindFirst = vi.fn();
const mediaCount = vi.fn();
const mediaCreate = vi.fn();
const mediaFindUnique = vi.fn();
const mediaFindFirst = vi.fn();
const mediaFindMany = vi.fn();
const mediaUpdate = vi.fn();
const mediaDelete = vi.fn();
const invalidateCompactCatalog = vi.fn();
const getSignedUrlMock = vi.fn();
const s3Send = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    product: {
      findFirst: (...args: unknown[]) => productFindFirst(...args)
    },
    productMedia: {
      count: (...args: unknown[]) => mediaCount(...args),
      create: (...args: unknown[]) => mediaCreate(...args),
      findUnique: (...args: unknown[]) => mediaFindUnique(...args),
      findFirst: (...args: unknown[]) => mediaFindFirst(...args),
      findMany: (...args: unknown[]) => mediaFindMany(...args),
      update: (...args: unknown[]) => mediaUpdate(...args),
      delete: (...args: unknown[]) => mediaDelete(...args)
    },
    $transaction: (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    WA_MEDIA_S3_BUCKET: BUCKET,
    WA_MEDIA_S3_REGION: 'us-east-1'
  }
}));

vi.mock('../../conversation/prefetch.js', () => ({
  invalidateCompactCatalog: (...args: unknown[]) => invalidateCompactCatalog(...args)
}));

vi.mock('../../utils/waMediaS3.js', () => ({
  getWaMediaS3Client: () => ({ send: (...args: unknown[]) => s3Send(...args) })
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args)
}));

const { productMediaRouter } = await import('../productMedia.js');

let currentUser: { id: string; vendorId?: string; roles: string[] } = {
  id: 'user-1',
  vendorId: VENDOR_ID,
  roles: ['vendor']
};

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.user = currentUser;
  next();
});
app.use('/products', productMediaRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/products`;

afterAll(() => {
  server.close();
});

function commandName(command: unknown): string {
  return (command as { constructor: { name: string } }).constructor.name;
}

function notFoundError(): Error {
  const err = new Error('NotFound') as Error & { $metadata: { httpStatusCode: number } };
  err.name = 'NotFound';
  err.$metadata = { httpStatusCode: 404 };
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { id: 'user-1', vendorId: VENDOR_ID, roles: ['vendor'] };

  // Mirrors the Prisma scoping in requireProductForActor: a vendor filter that
  // does not match returns null, exactly as the database would.
  productFindFirst.mockImplementation(async ({ where }: { where: { id: string; vendorId?: string } }) => {
    if (where.id !== PRODUCT_ID) return null;
    if (where.vendorId !== undefined && where.vendorId !== VENDOR_ID) return null;
    return { id: PRODUCT_ID, vendorId: VENDOR_ID };
  });

  mediaCount.mockResolvedValue(0);
  mediaFindUnique.mockResolvedValue(null);
  mediaFindFirst.mockResolvedValue(null);
  mediaFindMany.mockResolvedValue([]);
  mediaCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'media-1',
    width: null,
    height: null,
    durationSec: null,
    label: null,
    isActive: true,
    createdAt: new Date('2026-09-15T00:00:00.000Z'),
    updatedAt: new Date('2026-09-15T00:00:00.000Z'),
    ...data
  }));

  getSignedUrlMock.mockResolvedValue('https://s3.example/put');
  s3Send.mockImplementation(async (command: unknown) => {
    switch (commandName(command)) {
      case 'HeadObjectCommand':
        return { ContentType: 'image/jpeg', ContentLength: 204800 };
      default:
        return {};
    }
  });
});

function postJson(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('POST /products/:id/media/upload-url', () => {
  it('returns API direct-upload target under vendor/{vendorId}/catalog/{productId}/', async () => {
    const res = await postJson(`/${PRODUCT_ID}/media/upload-url`, {
      filename: 'cake front.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 204800
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      s3Key: string;
      kind: string;
      uploadViaApi: boolean;
      uploadUrl: string;
      requiredHeaders: Record<string, string>;
    };
    expect(body.kind).toBe('image');
    expect(body.uploadViaApi).toBe(true);
    expect(body.uploadUrl).toContain(`/products/${PRODUCT_ID}/media/direct-upload?key=`);
    expect(body.requiredHeaders['Content-Type']).toBe('image/jpeg');
    expect(getSignedUrlMock).not.toHaveBeenCalled();
    expect(body.s3Key).toMatch(
      new RegExp(`^vendor/${VENDOR_ID}/catalog/${PRODUCT_ID}/[0-9a-f-]{36}-cake_front\\.jpg$`)
    );
  });

  it.each(['image/svg+xml', 'application/pdf', 'video/quicktime', 'image/gif'])(
    'rejects %s with 415 and never presigns',
    async (contentType) => {
      const res = await postJson(`/${PRODUCT_ID}/media/upload-url`, {
        filename: 'payload.bin',
        contentType,
        sizeBytes: 1024
      });

      expect(res.status).toBe(415);
      expect(await res.json()).toMatchObject({ error: 'UNSUPPORTED_MEDIA_TYPE' });
      expect(getSignedUrlMock).not.toHaveBeenCalled();
    }
  );

  it('rejects an image over the 5 MB cap with 413', async () => {
    const res = await postJson(`/${PRODUCT_ID}/media/upload-url`, {
      filename: 'huge.png',
      contentType: 'image/png',
      sizeBytes: 6 * 1024 * 1024
    });

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('rejects a video over the 16 MB WhatsApp cap before it reaches S3', async () => {
    const res = await postJson(`/${PRODUCT_ID}/media/upload-url`, {
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      sizeBytes: 20 * 1024 * 1024
    });

    // Zod stops anything above the largest cap; the service would return 413.
    expect(res.status).toBe(400);
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('accepts a 16 MB video', async () => {
    const res = await postJson(`/${PRODUCT_ID}/media/upload-url`, {
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      sizeBytes: 16 * 1024 * 1024
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { kind: string }).kind).toBe('video');
  });

  it('refuses a new upload once the product already has 10 active assets', async () => {
    mediaCount.mockResolvedValue(10);

    const res = await postJson(`/${PRODUCT_ID}/media/upload-url`, {
      filename: 'eleventh.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'MEDIA_LIMIT_REACHED' });
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });
});

describe('POST /products/:id/media/commit', () => {
  const s3Key = `vendor/${VENDOR_ID}/catalog/${PRODUCT_ID}/11111111-2222-3333-4444-555555555555-cake.jpg`;

  it('takes mimeType and fileSizeBytes from HeadObject, not from the client', async () => {
    const res = await postJson(`/${PRODUCT_ID}/media/commit`, { s3Key, label: 'Front view' });

    expect(res.status).toBe(201);
    expect(mediaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vendorId: VENDOR_ID,
        productId: PRODUCT_ID,
        kind: 'image',
        s3Bucket: BUCKET,
        s3Key,
        mimeType: 'image/jpeg',
        fileSizeBytes: 204800,
        label: 'Front view',
        isActive: true
      })
    });
    expect(invalidateCompactCatalog).toHaveBeenCalledWith(VENDOR_ID);

    const body = (await res.json()) as { previewUrl: string };
    expect(body.previewUrl).toBe(`/api/products/${PRODUCT_ID}/media/media-1/preview`);
  });

  it('fails with 404 when the object was never uploaded', async () => {
    s3Send.mockImplementation(async (command: unknown) => {
      if (commandName(command) === 'HeadObjectCommand') throw notFoundError();
      return {};
    });

    const res = await postJson(`/${PRODUCT_ID}/media/commit`, { s3Key });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'UPLOAD_NOT_FOUND' });
    expect(mediaCreate).not.toHaveBeenCalled();
    expect(invalidateCompactCatalog).not.toHaveBeenCalled();
  });

  it('rejects an object whose stored content type is not on the allowlist', async () => {
    s3Send.mockImplementation(async (command: unknown) => {
      if (commandName(command) === 'HeadObjectCommand') {
        return { ContentType: 'image/svg+xml', ContentLength: 1024 };
      }
      return {};
    });

    const res = await postJson(`/${PRODUCT_ID}/media/commit`, { s3Key });

    expect(res.status).toBe(415);
    expect(mediaCreate).not.toHaveBeenCalled();
  });

  it('rejects an object that is larger than the cap for its kind', async () => {
    s3Send.mockImplementation(async (command: unknown) => {
      if (commandName(command) === 'HeadObjectCommand') {
        return { ContentType: 'image/jpeg', ContentLength: 9 * 1024 * 1024 };
      }
      return {};
    });

    const res = await postJson(`/${PRODUCT_ID}/media/commit`, { s3Key });

    expect(res.status).toBe(413);
    expect(mediaCreate).not.toHaveBeenCalled();
  });

  it('refuses to commit an 11th active asset', async () => {
    mediaCount.mockResolvedValue(10);

    const res = await postJson(`/${PRODUCT_ID}/media/commit`, { s3Key });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'MEDIA_LIMIT_REACHED' });
    expect(mediaCreate).not.toHaveBeenCalled();
  });

  it('rejects a key that points outside this product prefix', async () => {
    const res = await postJson(`/${PRODUCT_ID}/media/commit`, {
      s3Key: `vendor/${VENDOR_ID}/catalog/other-product/uuid-cake.jpg`
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'INVALID_S3_KEY' });
    expect(s3Send).not.toHaveBeenCalled();
  });
});

describe('PUT /products/:id/media/direct-upload', () => {
  it('writes bytes to S3 when key belongs to the product', async () => {
    const planRes = await postJson(`/${PRODUCT_ID}/media/upload-url`, {
      filename: 'thumb.webp',
      contentType: 'image/webp',
      sizeBytes: 512
    });
    const { uploadUrl, s3Key } = (await planRes.json()) as { uploadUrl: string; s3Key: string };
    const bytes = Buffer.from('fake-webp');

    const res = await fetch(`${baseUrl}${uploadUrl.replace(/^\/products/, '')}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/webp' },
      body: bytes
    });

    expect(res.status).toBe(200);
    expect(s3Send).toHaveBeenCalled();
    const putCall = s3Send.mock.calls.find(
      (args) => commandName(args[0]) === 'PutObjectCommand'
    );
    expect(putCall).toBeTruthy();
    expect((putCall![0] as { input: { Key: string } }).input.Key).toBe(s3Key);
  });

  it('rejects a key outside the product prefix', async () => {
    const res = await fetch(
      `${baseUrl}/${PRODUCT_ID}/media/direct-upload?key=${encodeURIComponent('vendor/other/catalog/x/evil.jpg')}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: Buffer.from('x')
      }
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'INVALID_S3_KEY' });
    expect(s3Send).not.toHaveBeenCalled();
  });
});

describe('tenant isolation', () => {
  it('hides another vendor\u2019s product behind a 404 on list', async () => {
    currentUser = { id: 'user-2', vendorId: 'vendor-2', roles: ['vendor'] };

    const res = await fetch(`${baseUrl}/${PRODUCT_ID}/media`);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'PRODUCT_NOT_FOUND' });
    expect(mediaFindMany).not.toHaveBeenCalled();
  });

  it('never plans an upload for another vendor\u2019s product', async () => {
    currentUser = { id: 'user-2', vendorId: 'vendor-2', roles: ['vendor'] };

    const res = await postJson(`/${PRODUCT_ID}/media/upload-url`, {
      filename: 'cake.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024
    });

    expect(res.status).toBe(404);
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('will not delete another vendor\u2019s media', async () => {
    currentUser = { id: 'user-2', vendorId: 'vendor-2', roles: ['vendor'] };

    const res = await fetch(`${baseUrl}/${PRODUCT_ID}/media/media-1`, { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(mediaDelete).not.toHaveBeenCalled();
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('requires a vendor context for a non-admin caller', async () => {
    currentUser = { id: 'user-3', roles: ['vendor'] };

    const res = await fetch(`${baseUrl}/${PRODUCT_ID}/media`);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'VENDOR_CONTEXT_REQUIRED' });
  });

  it('lets an admin reach any product and writes rows under the owning vendor', async () => {
    currentUser = { id: 'admin-1', roles: ['admin'] };

    const res = await postJson(`/${PRODUCT_ID}/media/commit`, {
      s3Key: `vendor/${VENDOR_ID}/catalog/${PRODUCT_ID}/uuid-cake.jpg`
    });

    expect(res.status).toBe(201);
    expect(mediaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ vendorId: VENDOR_ID })
    });
  });
});

describe('DELETE /products/:id/media/:mediaId', () => {
  it('removes the S3 object and the row, then invalidates the compact catalog', async () => {
    mediaFindFirst.mockResolvedValue({
      id: 'media-1',
      vendorId: VENDOR_ID,
      productId: PRODUCT_ID,
      kind: 'image',
      s3Bucket: BUCKET,
      s3Key: 'vendor/vendor-1/catalog/prod-1/uuid-cake.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: 1024,
      width: null,
      height: null,
      durationSec: null,
      label: null,
      sortOrder: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const res = await fetch(`${baseUrl}/${PRODUCT_ID}/media/media-1`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(s3Send).toHaveBeenCalledTimes(1);
    expect(commandName(s3Send.mock.calls[0][0])).toBe('DeleteObjectCommand');
    expect(mediaDelete).toHaveBeenCalledWith({ where: { id: 'media-1' } });
    expect(invalidateCompactCatalog).toHaveBeenCalledWith(VENDOR_ID);
  });

  it('returns 404 for a media id that belongs to a different product', async () => {
    mediaFindFirst.mockResolvedValue(null);

    const res = await fetch(`${baseUrl}/${PRODUCT_ID}/media/media-9`, { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(mediaDelete).not.toHaveBeenCalled();
  });
});

describe('POST /products/:id/media/reorder', () => {
  it('rejects an incomplete ordering', async () => {
    mediaFindMany.mockResolvedValue([{ id: 'media-1' }, { id: 'media-2' }]);

    const res = await postJson(`/${PRODUCT_ID}/media/reorder`, { orderedIds: ['media-1'] });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'INVALID_ORDER' });
    expect(mediaUpdate).not.toHaveBeenCalled();
  });

  it('writes a dense sortOrder sequence', async () => {
    mediaFindMany.mockResolvedValueOnce([{ id: 'media-1' }, { id: 'media-2' }]);
    mediaFindMany.mockResolvedValueOnce([]);
    mediaUpdate.mockResolvedValue({});

    const res = await postJson(`/${PRODUCT_ID}/media/reorder`, {
      orderedIds: ['media-2', 'media-1']
    });

    expect(res.status).toBe(200);
    expect(mediaUpdate).toHaveBeenNthCalledWith(1, { where: { id: 'media-2' }, data: { sortOrder: 0 } });
    expect(mediaUpdate).toHaveBeenNthCalledWith(2, { where: { id: 'media-1' }, data: { sortOrder: 1 } });
    expect(invalidateCompactCatalog).toHaveBeenCalledWith(VENDOR_ID);
  });
});
