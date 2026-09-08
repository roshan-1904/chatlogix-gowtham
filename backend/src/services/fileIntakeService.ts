import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import {
  IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  MAX_TABULAR_BYTES,
  TABULAR_CONTENT_TYPES
} from './importStorageService.js';
import { fetchLocalImport, headLocalImport } from './catalogImportLocalStore.js';

export class FileIntakeError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }
}

let s3Client: S3Client | null = null;
function getClient(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.CATALOG_IMPORT_S3_REGION || env.AWS_REGION,
      ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
              ...(env.AWS_SESSION_TOKEN ? { sessionToken: env.AWS_SESSION_TOKEN } : {})
            }
          }
        : {})
    });
  }
  return s3Client;
}

export interface FetchResult {
  buffer: Buffer;
  contentType: string;
  sizeBytes: number;
}

// Cheap defense against users passing foreign keys or traversing buckets.
// Presigned uploads always land at `imports/{vendorId}/{jobId}/...`.
export function assertKeyBelongsToVendor(key: string, vendorId: string): void {
  const prefix = `imports/${vendorId}/`;
  if (!key.startsWith(prefix)) {
    throw new FileIntakeError(403, 'FORBIDDEN_KEY', 'S3 key does not belong to this vendor');
  }
}

export async function headAndValidate(key: string): Promise<{ contentType: string; sizeBytes: number }> {
  const local = await headLocalImport(key);
  if (local) {
    return validateMeta(key, local.contentType, local.sizeBytes);
  }

  const bucket = env.CATALOG_IMPORT_S3_BUCKET?.trim();
  if (!bucket) {
    throw new FileIntakeError(503, 'BUCKET_NOT_CONFIGURED', 'Catalog import bucket is not configured');
  }
  const res = await getClient().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return validateMeta(key, res.ContentType ?? '', Number(res.ContentLength ?? 0));
}

function validateMeta(
  key: string,
  contentType: string,
  sizeBytes: number
): { contentType: string; sizeBytes: number } {
  const isImage = IMAGE_CONTENT_TYPES.has(contentType);
  const isTabular = TABULAR_CONTENT_TYPES.has(contentType);
  if (!isImage && !isTabular) {
    throw new FileIntakeError(415, 'UNSUPPORTED_MEDIA_TYPE', `Content type ${contentType} is not allowed`);
  }
  const cap = isImage ? MAX_IMAGE_BYTES : MAX_TABULAR_BYTES;
  if (sizeBytes <= 0 || sizeBytes > cap) {
    throw new FileIntakeError(413, 'PAYLOAD_TOO_LARGE', `File at ${key} exceeds size cap`);
  }
  return { contentType, sizeBytes };
}

export async function fetchAndValidate(key: string): Promise<FetchResult> {
  const local = await fetchLocalImport(key);
  if (local) {
    validateMeta(key, local.contentType, local.sizeBytes);
    return local;
  }

  const meta = await headAndValidate(key);
  const bucket = env.CATALOG_IMPORT_S3_BUCKET!.trim();
  const res = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = res.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!body?.transformToByteArray) {
    throw new FileIntakeError(500, 'S3_EMPTY_BODY', `No body returned for ${key}`);
  }
  const bytes = await body.transformToByteArray();
  return {
    buffer: Buffer.from(bytes),
    contentType: meta.contentType,
    sizeBytes: meta.sizeBytes
  };
}
