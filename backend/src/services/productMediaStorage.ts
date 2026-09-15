/**
 * Vendor-uploaded catalog photos and videos (docs/PRODUCT_MEDIA.md §8–§10).
 *
 * Distinct from importStorageService.ts, which owns Smart Catalog Import jobs
 * in CATALOG_IMPORT_S3_BUCKET. Product media lives in the WhatsApp media
 * bucket (WA_MEDIA_S3_BUCKET) next to inbound conversation media so the
 * response dispatcher can presign a GET for Meta from a single bucket (PM14).
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  PutObjectTaggingCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { getWaMediaS3Client } from '../utils/waMediaS3.js';
import { readS3ObjectBody } from '../utils/s3Body.js';
import { invalidateCompactCatalog } from '../conversation/prefetch.js';

export type ProductMediaKind = 'image' | 'video';

/** WhatsApp Cloud API media limits (docs/PRODUCT_MEDIA.md §17). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_VIDEO_BYTES = 16 * 1024 * 1024; // 16 MB

/** PM6: at most 10 active assets per product. */
export const MAX_ACTIVE_MEDIA_PER_PRODUCT = 10;

export const PRESIGNED_UPLOAD_EXPIRY_SECONDS = 15 * 60;

/**
 * Catalog objects share the `vendor/{vendorId}/` prefix with conversation
 * media, which is expired by lifecycle. Tagging lets ops target the
 * conversation objects only (docs/PRODUCT_MEDIA.md §9.5).
 */
export const MEDIA_CLASS_TAG_KEY = 'ChatLogixMediaClass';
export const MEDIA_CLASS_TAG_VALUE = 'catalog';
const MEDIA_CLASS_TAGGING = `${MEDIA_CLASS_TAG_KEY}=${MEDIA_CLASS_TAG_VALUE}`;

/** `image/svg+xml` is deliberately absent: WhatsApp rejects it and it is an XSS vector in the portal preview. */
export const IMAGE_CONTENT_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/webp']);
export const VIDEO_CONTENT_TYPES = new Set<string>(['video/mp4', 'video/3gpp']);

export class ProductMediaError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
    this.name = 'ProductMediaError';
  }
}

export interface ProductMediaActor {
  vendorId?: string;
  isAdmin: boolean;
}

export interface ProductMediaDto {
  id: string;
  productId: string;
  kind: ProductMediaKind;
  mimeType: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  label: string | null;
  sortOrder: number;
  isActive: boolean;
  previewUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface ProductMediaRecord {
  id: string;
  vendorId: string;
  productId: string;
  kind: string;
  s3Bucket: string;
  s3Key: string;
  mimeType: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  label: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MEDIA_ORDER_BY = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

/** Strip directory, keep basename, allow letters/digits/._-; collapse everything else to `_`. */
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

export function normalizeContentType(raw: string | undefined | null): string {
  return (raw ?? '').split(';')[0].trim().toLowerCase();
}

export function classifyMediaKind(contentType: string | undefined | null): ProductMediaKind | null {
  const normalized = normalizeContentType(contentType);
  if (IMAGE_CONTENT_TYPES.has(normalized)) return 'image';
  if (VIDEO_CONTENT_TYPES.has(normalized)) return 'video';
  return null;
}

export function maxBytesForKind(kind: ProductMediaKind): number {
  return kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
}

function assertAllowedContentType(contentType: string): ProductMediaKind {
  const kind = classifyMediaKind(contentType);
  if (!kind) {
    throw new ProductMediaError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      `Content type ${normalizeContentType(contentType) || 'unknown'} is not allowed for product media`
    );
  }
  return kind;
}

function assertAllowedSize(kind: ProductMediaKind, sizeBytes: number): void {
  const cap = maxBytesForKind(kind);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > cap) {
    throw new ProductMediaError(
      413,
      'PAYLOAD_TOO_LARGE',
      `File size exceeds the ${cap} byte limit for kind=${kind}`
    );
  }
}

export function productMediaPrefix(vendorId: string, productId: string): string {
  return `vendor/${vendorId}/catalog/${productId}/`;
}

export function buildProductMediaKey(
  vendorId: string,
  productId: string,
  filename: string,
  uploadId: string
): string {
  return `${productMediaPrefix(vendorId, productId)}${uploadId}-${sanitizeFilename(filename)}`;
}

function assertKeyBelongsToProduct(s3Key: string, vendorId: string, productId: string): void {
  const prefix = productMediaPrefix(vendorId, productId);
  if (!s3Key.startsWith(prefix) || s3Key.length <= prefix.length || s3Key.includes('..')) {
    throw new ProductMediaError(400, 'INVALID_S3_KEY', 'Upload key does not belong to this product');
  }
}

function productMediaBucket(): string {
  const bucket = env.WA_MEDIA_S3_BUCKET?.trim();
  if (!bucket) {
    throw new ProductMediaError(
      503,
      'BUCKET_NOT_CONFIGURED',
      'WA_MEDIA_S3_BUCKET is not configured; product media uploads are unavailable'
    );
  }
  if (bucket.startsWith('arn:')) {
    throw new ProductMediaError(
      503,
      'BUCKET_NAME_EXPECTED',
      'WA_MEDIA_S3_BUCKET must be a plain bucket name, not an ARN'
    );
  }
  return bucket;
}

function s3ErrorText(err: unknown): string {
  const e = err as { name?: string; message?: string; Code?: string; code?: string };
  return `${e?.name || ''} ${e?.message || ''} ${e?.Code || ''} ${e?.code || ''}`.toLowerCase();
}

function s3HttpStatus(err: unknown): number | undefined {
  return (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
}

function mapS3Error(err: unknown, fallbackCode: string, fallbackMessage: string): ProductMediaError {
  const text = s3ErrorText(err);
  if (text.includes('accessdenied') || text.includes('forbidden')) {
    return new ProductMediaError(
      503,
      'S3_ACCESS_DENIED',
      'S3 denied access for the media bucket. Verify IAM permissions on vendor/*/catalog/*.'
    );
  }
  if (text.includes('invalidaccesskeyid') || text.includes('signaturedoesnotmatch')) {
    return new ProductMediaError(503, 'S3_AUTH_INVALID', 'AWS credentials are invalid for the media bucket.');
  }
  if (text.includes('unable to resolve credentials') || text.includes('credential')) {
    return new ProductMediaError(503, 'S3_CREDENTIALS_MISSING', 'AWS credentials are missing for the media bucket.');
  }
  if (text.includes('nosuchbucket')) {
    return new ProductMediaError(503, 'S3_BUCKET_NOT_FOUND', 'Configured media bucket was not found in the target region.');
  }
  return new ProductMediaError(503, fallbackCode, fallbackMessage);
}

function isNotFound(err: unknown): boolean {
  const text = s3ErrorText(err);
  return s3HttpStatus(err) === 404 || text.includes('notfound') || text.includes('nosuchkey');
}

export function toProductMediaDto(row: ProductMediaRecord): ProductMediaDto {
  return {
    id: row.id,
    productId: row.productId,
    kind: row.kind === 'video' ? 'video' : 'image',
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes,
    width: row.width,
    height: row.height,
    durationSec: row.durationSec,
    label: row.label,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    previewUrl: `/api/products/${row.productId}/media/${row.id}/preview`,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

/**
 * Tenant guard for every product-media route. Mirrors the products.ts pattern:
 * a product owned by another vendor is reported as 404, never 403, so the API
 * does not confirm that someone else's product id exists.
 */
export async function requireProductForActor(
  productId: string,
  actor: ProductMediaActor
): Promise<{ id: string; vendorId: string }> {
  if (!actor.isAdmin && !actor.vendorId) {
    throw new ProductMediaError(403, 'VENDOR_CONTEXT_REQUIRED', 'Vendor context required');
  }

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      ...(actor.isAdmin ? {} : { vendorId: actor.vendorId })
    },
    select: { id: true, vendorId: true }
  });

  if (!product) {
    throw new ProductMediaError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  }
  return product;
}

async function countActiveMedia(productId: string): Promise<number> {
  return prisma.productMedia.count({ where: { productId, isActive: true } });
}

async function assertActiveCapacity(productId: string): Promise<void> {
  const active = await countActiveMedia(productId);
  if (active >= MAX_ACTIVE_MEDIA_PER_PRODUCT) {
    throw new ProductMediaError(
      409,
      'MEDIA_LIMIT_REACHED',
      `A product can have at most ${MAX_ACTIVE_MEDIA_PER_PRODUCT} active media assets`
    );
  }
}

export interface CreateUploadUrlInput {
  vendorId: string;
  productId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface PlannedProductMediaUpload {
  uploadId: string;
  s3Key: string;
  expiresAt: string;
  kind: ProductMediaKind;
  contentType: string;
}

export interface CreateUploadUrlResult {
  uploadId: string;
  s3Key: string;
  presignedUrl?: string;
  expiresAt: string;
  kind: ProductMediaKind;
  /** When true, PUT bytes to `uploadUrl` on the API (same-origin) instead of S3. */
  uploadViaApi?: boolean;
  uploadUrl?: string;
  /** Headers the browser must send on the upload PUT. */
  requiredHeaders: Record<string, string>;
}

export async function planProductMediaUpload(
  input: CreateUploadUrlInput
): Promise<PlannedProductMediaUpload> {
  const contentType = normalizeContentType(input.contentType);
  const kind = assertAllowedContentType(contentType);
  assertAllowedSize(kind, input.sizeBytes);
  await assertActiveCapacity(input.productId);

  const uploadId = randomUUID();
  const s3Key = buildProductMediaKey(input.vendorId, input.productId, input.filename, uploadId);

  return {
    uploadId,
    s3Key,
    expiresAt: new Date(Date.now() + PRESIGNED_UPLOAD_EXPIRY_SECONDS * 1000).toISOString(),
    kind,
    contentType
  };
}

/** Optional browser-direct S3 PUT (requires bucket CORS). Prefer API proxy via `writeProductMediaUpload`. */
export async function createProductMediaPresignedUploadUrl(
  input: CreateUploadUrlInput
): Promise<CreateUploadUrlResult> {
  const planned = await planProductMediaUpload(input);
  const bucket = productMediaBucket();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: planned.s3Key,
    ContentType: planned.contentType,
    ContentLength: input.sizeBytes,
    Tagging: MEDIA_CLASS_TAGGING
  });

  let presignedUrl: string;
  try {
    presignedUrl = await getSignedUrl(getWaMediaS3Client(), command, {
      expiresIn: PRESIGNED_UPLOAD_EXPIRY_SECONDS
    });
  } catch (err) {
    logger.error(
      { err, vendorId: input.vendorId, productId: input.productId, bucket, s3Key: planned.s3Key },
      'product_media_presign_failed'
    );
    throw mapS3Error(err, 'S3_PRESIGN_FAILED', 'Failed to generate the media upload URL');
  }

  return {
    uploadId: planned.uploadId,
    s3Key: planned.s3Key,
    presignedUrl,
    expiresAt: planned.expiresAt,
    kind: planned.kind,
    requiredHeaders: {
      'Content-Type': planned.contentType,
      'Content-Length': String(input.sizeBytes),
      'x-amz-tagging': MEDIA_CLASS_TAGGING
    }
  };
}

export async function writeProductMediaUpload(params: {
  vendorId: string;
  productId: string;
  s3Key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  assertKeyBelongsToProduct(params.s3Key, params.vendorId, params.productId);
  const contentType = normalizeContentType(params.contentType);
  const kind = assertAllowedContentType(contentType);
  assertAllowedSize(kind, params.body.length);

  const bucket = productMediaBucket();
  try {
    await getWaMediaS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: params.s3Key,
        Body: params.body,
        ContentType: contentType,
        ContentLength: params.body.length,
        Tagging: MEDIA_CLASS_TAGGING
      })
    );
  } catch (err) {
    logger.error(
      { err, vendorId: params.vendorId, productId: params.productId, bucket, s3Key: params.s3Key },
      'product_media_put_failed'
    );
    throw mapS3Error(err, 'S3_PUT_FAILED', 'Failed to store product media');
  }
}

export interface CommitUploadInput {
  vendorId: string;
  productId: string;
  s3Key: string;
  label?: string | null;
  sortOrder?: number;
  width?: number;
  height?: number;
  durationSec?: number;
}

/**
 * Promotes an uploaded object to a ProductMedia row. MIME and size come from
 * HeadObject, not from the client, so a vendor cannot register a 200 MB file
 * by claiming it is 2 KB. Re-committing the same key is idempotent.
 */
export async function commitProductMediaUpload(input: CommitUploadInput): Promise<ProductMediaDto> {
  assertKeyBelongsToProduct(input.s3Key, input.vendorId, input.productId);
  const bucket = productMediaBucket();

  const existing = await prisma.productMedia.findUnique({ where: { s3Key: input.s3Key } });
  if (existing) {
    if (existing.productId !== input.productId) {
      throw new ProductMediaError(409, 'MEDIA_ALREADY_COMMITTED', 'This upload is already attached to another product');
    }
    return toProductMediaDto(existing);
  }

  let head: { ContentLength?: number; ContentType?: string };
  try {
    head = await getWaMediaS3Client().send(
      new HeadObjectCommand({ Bucket: bucket, Key: input.s3Key })
    );
  } catch (err) {
    if (isNotFound(err)) {
      throw new ProductMediaError(
        404,
        'UPLOAD_NOT_FOUND',
        'No uploaded object was found for this key. Complete the presigned PUT before committing.'
      );
    }
    logger.error(
      { err, vendorId: input.vendorId, productId: input.productId, bucket, s3Key: input.s3Key },
      'product_media_head_failed'
    );
    throw mapS3Error(err, 'S3_HEAD_FAILED', 'Failed to verify the uploaded object');
  }

  const mimeType = normalizeContentType(head.ContentType);
  const kind = assertAllowedContentType(mimeType);
  const fileSizeBytes = head.ContentLength ?? 0;
  assertAllowedSize(kind, fileSizeBytes);

  await assertActiveCapacity(input.productId);

  const sortOrder = input.sortOrder ?? (await nextSortOrder(input.productId));

  const created = await prisma.productMedia.create({
    data: {
      vendorId: input.vendorId,
      productId: input.productId,
      kind,
      s3Bucket: bucket,
      s3Key: input.s3Key,
      mimeType,
      fileSizeBytes,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSec: input.durationSec ?? null,
      label: input.label ?? null,
      sortOrder,
      isActive: true
    }
  });

  // Best effort: the presigned PUT already carries the tag, but a client that
  // drops the hoisted x-amz-tagging query param would otherwise leave the
  // object untagged and exposed to the conversation retention rule.
  try {
    await getWaMediaS3Client().send(
      new PutObjectTaggingCommand({
        Bucket: bucket,
        Key: input.s3Key,
        Tagging: { TagSet: [{ Key: MEDIA_CLASS_TAG_KEY, Value: MEDIA_CLASS_TAG_VALUE }] }
      })
    );
  } catch (err) {
    logger.warn(
      { err, productId: input.productId, bucket, s3Key: input.s3Key },
      'product_media_tagging_failed'
    );
  }

  await invalidateCompactCatalog(input.vendorId);
  logger.info(
    { vendorId: input.vendorId, productId: input.productId, mediaId: created.id, kind, fileSizeBytes },
    'product_media_committed'
  );

  return toProductMediaDto(created);
}

async function nextSortOrder(productId: string): Promise<number> {
  const last = await prisma.productMedia.findFirst({
    where: { productId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true }
  });
  return last ? last.sortOrder + 1 : 0;
}

export async function listProductMedia(
  productId: string,
  options: { includeInactive?: boolean } = {}
): Promise<ProductMediaDto[]> {
  const rows = await prisma.productMedia.findMany({
    where: { productId, ...(options.includeInactive ? {} : { isActive: true }) },
    orderBy: MEDIA_ORDER_BY
  });
  return rows.map(toProductMediaDto);
}

export async function getProductMedia(productId: string, mediaId: string): Promise<ProductMediaRecord> {
  const media = await prisma.productMedia.findFirst({ where: { id: mediaId, productId } });
  if (!media) {
    throw new ProductMediaError(404, 'MEDIA_NOT_FOUND', 'Media not found');
  }
  return media;
}

/**
 * Reads the object for the authenticated portal preview. Bytes are streamed
 * through the API rather than redirecting to a presigned URL, matching
 * GET /api/messages/:id/media so the fetch stays same-origin.
 */
export async function readProductMediaObject(
  media: Pick<ProductMediaRecord, 'id' | 's3Bucket' | 's3Key' | 'mimeType'>
): Promise<{ bytes: Buffer; contentType: string }> {
  const bucket = media.s3Bucket || env.WA_MEDIA_S3_BUCKET;
  if (!bucket) {
    throw new ProductMediaError(503, 'BUCKET_NOT_CONFIGURED', 'Media bucket is not configured');
  }

  try {
    const response = await getWaMediaS3Client().send(
      new GetObjectCommand({ Bucket: bucket, Key: media.s3Key })
    );
    const bytes = await readS3ObjectBody(response.Body);
    return { bytes, contentType: media.mimeType || response.ContentType || 'application/octet-stream' };
  } catch (err) {
    if (isNotFound(err)) {
      throw new ProductMediaError(404, 'MEDIA_OBJECT_MISSING', 'Media object is no longer in storage');
    }
    logger.error({ err, mediaId: media.id, bucket, s3Key: media.s3Key }, 'product_media_fetch_failed');
    throw mapS3Error(err, 'S3_GET_FAILED', 'Failed to fetch media');
  }
}

export interface UpdateProductMediaInput {
  label?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export async function updateProductMedia(
  vendorId: string,
  productId: string,
  mediaId: string,
  patch: UpdateProductMediaInput
): Promise<ProductMediaDto> {
  const media = await getProductMedia(productId, mediaId);

  if (patch.isActive === true && !media.isActive) {
    await assertActiveCapacity(productId);
  }

  const updated = await prisma.productMedia.update({
    where: { id: mediaId },
    data: {
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {})
    }
  });

  await invalidateCompactCatalog(vendorId);
  return toProductMediaDto(updated);
}

/**
 * `orderedIds` must be a permutation of every media row on the product, so the
 * resulting sortOrder sequence is dense and unambiguous for the send path.
 */
export async function reorderProductMedia(
  vendorId: string,
  productId: string,
  orderedIds: string[]
): Promise<ProductMediaDto[]> {
  const rows = await prisma.productMedia.findMany({
    where: { productId },
    select: { id: true }
  });

  const known = new Set(rows.map((row) => row.id));
  const requested = new Set(orderedIds);
  if (requested.size !== orderedIds.length || requested.size !== known.size || orderedIds.some((id) => !known.has(id))) {
    throw new ProductMediaError(
      400,
      'INVALID_ORDER',
      'orderedIds must list every media id of this product exactly once'
    );
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.productMedia.update({ where: { id }, data: { sortOrder: index } })
    )
  );

  await invalidateCompactCatalog(vendorId);
  return listProductMedia(productId, { includeInactive: true });
}

/** OQ1: hard delete — the S3 object and the row both go away. */
export async function deleteProductMedia(
  vendorId: string,
  productId: string,
  mediaId: string
): Promise<void> {
  const media = await getProductMedia(productId, mediaId);
  const bucket = media.s3Bucket || env.WA_MEDIA_S3_BUCKET;

  if (bucket) {
    try {
      await getWaMediaS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: media.s3Key }));
    } catch (err) {
      // An orphaned object is cheaper than a row pointing at bytes we can no
      // longer send, so the row is removed either way.
      logger.warn({ err, mediaId, bucket, s3Key: media.s3Key }, 'product_media_s3_delete_failed');
    }
  }

  await prisma.productMedia.delete({ where: { id: mediaId } });
  await invalidateCompactCatalog(vendorId);
  logger.info({ vendorId, productId, mediaId }, 'product_media_deleted');
}
