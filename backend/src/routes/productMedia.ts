/**
 * Product media REST surface (docs/PRODUCT_MEDIA.md §10).
 *
 * Mounted on /api/products ahead of productsRouter. Every path here carries a
 * /media segment, so it never shadows the existing /:id product routes; the
 * router simply falls through for anything that does not match.
 */
import express from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/authorize.js';
import { logger } from '../logger.js';
import {
  commitProductMediaUpload,
  deleteProductMedia,
  getProductMedia,
  listProductMedia,
  normalizeContentType,
  planProductMediaUpload,
  ProductMediaError,
  readProductMediaObject,
  reorderProductMedia,
  requireProductForActor,
  toProductMediaDto,
  updateProductMedia,
  writeProductMediaUpload,
  MAX_ACTIVE_MEDIA_PER_PRODUCT,
  MAX_VIDEO_BYTES
} from '../services/productMediaStorage.js';

export const productMediaRouter = express.Router();

const UploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  sizeBytes: z.number().int().positive().max(MAX_VIDEO_BYTES),
  variantSku: z.string().trim().min(1).max(80).optional()
});

const CommitSchema = z.object({
  s3Key: z.string().min(1).max(1024),
  label: z.string().trim().max(120).nullish(),
  variantSku: z.string().trim().min(1).max(80).optional(),
  sortOrder: z.number().int().min(0).max(MAX_ACTIVE_MEDIA_PER_PRODUCT - 1).optional(),
  width: z.number().int().positive().max(100000).optional(),
  height: z.number().int().positive().max(100000).optional(),
  durationSec: z.number().int().positive().max(3600).optional()
});

const UpdateSchema = z
  .object({
    label: z.string().trim().max(120).nullish(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    isActive: z.boolean().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'No updatable fields provided' });

const ReorderSchema = z.object({
  orderedIds: z.array(z.string().min(1).max(64)).min(1).max(MAX_ACTIVE_MEDIA_PER_PRODUCT * 2)
});

interface RequestActor {
  vendorId?: string;
  isAdmin: boolean;
}

function actorFrom(req: express.Request): RequestActor {
  const user = req.user as { vendorId?: string; roles?: string[] } | undefined;
  return {
    vendorId: user?.vendorId,
    isAdmin: Boolean(user?.roles?.includes('admin'))
  };
}

function handleError(res: express.Response, error: unknown, context: Record<string, unknown>): void {
  if (error instanceof ProductMediaError) {
    res.status(error.statusCode).json({ error: error.code, message: error.message });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'invalid_input', details: error.flatten() });
    return;
  }
  logger.error({ error, ...context }, 'product_media_request_failed');
  res.status(500).json({ error: 'product_media_request_failed' });
}

// PUT /api/products/:id/media/direct-upload?key=... — same-origin upload (no S3 CORS).
productMediaRouter.put(
  '/:id/media/direct-upload',
  express.raw({ type: '*/*', limit: MAX_VIDEO_BYTES }),
  requireRole('vendor', 'admin'),
  async (req, res) => {
    const productId = req.params.id;
    const s3Key = typeof req.query.key === 'string' ? req.query.key : '';
    if (!s3Key) {
      res.status(400).json({ error: 'invalid_input', message: 'Missing key query parameter' });
      return;
    }
    try {
      const product = await requireProductForActor(productId, actorFrom(req));
      const contentType = normalizeContentType(req.get('content-type'));
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? []);
      if (body.length <= 0) {
        res.status(400).json({ error: 'EMPTY_BODY', message: 'Upload body is empty' });
        return;
      }
      await writeProductMediaUpload({
        vendorId: product.vendorId,
        productId: product.id,
        s3Key,
        body,
        contentType
      });
      res.status(200).end();
    } catch (error) {
      handleError(res, error, { productId, s3Key });
    }
  }
);

// POST /api/products/:id/media/upload-url — plan upload; client PUTs via direct-upload (default).
productMediaRouter.post('/:id/media/upload-url', requireRole('vendor', 'admin'), async (req, res) => {
  const productId = req.params.id;
  try {
    const body = UploadUrlSchema.parse(req.body);
    const product = await requireProductForActor(productId, actorFrom(req));
    const planned = await planProductMediaUpload({
      vendorId: product.vendorId,
      productId: product.id,
      filename: body.filename,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      ...(body.variantSku ? { variantSku: body.variantSku } : {})
    });
    res.json({
      uploadId: planned.uploadId,
      s3Key: planned.s3Key,
      expiresAt: planned.expiresAt,
      kind: planned.kind,
      uploadViaApi: true,
      uploadUrl: `/products/${product.id}/media/direct-upload?key=${encodeURIComponent(planned.s3Key)}`,
      requiredHeaders: { 'Content-Type': planned.contentType }
    });
  } catch (error) {
    handleError(res, error, { productId });
  }
});

// POST /api/products/:id/media/commit - register the uploaded object
productMediaRouter.post('/:id/media/commit', requireRole('vendor', 'admin'), async (req, res) => {
  const productId = req.params.id;
  try {
    const body = CommitSchema.parse(req.body);
    const product = await requireProductForActor(productId, actorFrom(req));
    const media = await commitProductMediaUpload({
      vendorId: product.vendorId,
      productId: product.id,
      s3Key: body.s3Key,
      label: body.label ?? null,
      ...(body.variantSku ? { variantSku: body.variantSku } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(body.width !== undefined ? { width: body.width } : {}),
      ...(body.height !== undefined ? { height: body.height } : {}),
      ...(body.durationSec !== undefined ? { durationSec: body.durationSec } : {})
    });
    res.status(201).json(media);
  } catch (error) {
    handleError(res, error, { productId });
  }
});

// GET /api/products/:id/media - list media for the product
productMediaRouter.get('/:id/media', requireRole('vendor', 'admin'), async (req, res) => {
  const productId = req.params.id;
  try {
    const product = await requireProductForActor(productId, actorFrom(req));
    const includeInactive = req.query.includeInactive === 'true';
    const media = await listProductMedia(product.id, { includeInactive });
    res.json({ media });
  } catch (error) {
    handleError(res, error, { productId });
  }
});

// GET /api/products/:id/media/:mediaId/preview - authenticated byte stream.
// Same approach as GET /api/messages/:id/media: the portal fetches with a
// Bearer token and turns the response into a blob: URL, so the request must
// stay same-origin instead of redirecting to a presigned S3 URL.
productMediaRouter.get(
  '/:id/media/:mediaId/preview',
  requireRole('vendor', 'admin'),
  async (req, res) => {
    const productId = req.params.id;
    const mediaId = req.params.mediaId;
    try {
      const product = await requireProductForActor(productId, actorFrom(req));
      const media = await getProductMedia(product.id, mediaId);
      const { bytes, contentType } = await readProductMediaObject(media);

      // Helmet defaults CORP to same-origin, which blocks a dashboard hosted
      // on another origin from reading the body.
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'private, max-age=60');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(bytes.byteLength));
      res.end(bytes);
    } catch (error) {
      handleError(res, error, { productId, mediaId });
    }
  }
);

// PATCH /api/products/:id/media/:mediaId - label, sortOrder, isActive
productMediaRouter.patch('/:id/media/:mediaId', requireRole('vendor', 'admin'), async (req, res) => {
  const productId = req.params.id;
  const mediaId = req.params.mediaId;
  try {
    const body = UpdateSchema.parse(req.body);
    const product = await requireProductForActor(productId, actorFrom(req));
    const media = await updateProductMedia(product.vendorId, product.id, mediaId, body);
    res.json(media);
  } catch (error) {
    handleError(res, error, { productId, mediaId });
  }
});

// POST /api/products/:id/media/reorder - full reorder of the product's media
productMediaRouter.post('/:id/media/reorder', requireRole('vendor', 'admin'), async (req, res) => {
  const productId = req.params.id;
  try {
    const body = ReorderSchema.parse(req.body);
    const product = await requireProductForActor(productId, actorFrom(req));
    const media = await reorderProductMedia(product.vendorId, product.id, body.orderedIds);
    res.json({ media });
  } catch (error) {
    handleError(res, error, { productId });
  }
});

// DELETE /api/products/:id/media/:mediaId - hard delete object + row
productMediaRouter.delete('/:id/media/:mediaId', requireRole('vendor', 'admin'), async (req, res) => {
  const productId = req.params.id;
  const mediaId = req.params.mediaId;
  try {
    const product = await requireProductForActor(productId, actorFrom(req));
    await deleteProductMedia(product.vendorId, product.id, mediaId);
    res.status(204).end();
  } catch (error) {
    handleError(res, error, { productId, mediaId });
  }
});
