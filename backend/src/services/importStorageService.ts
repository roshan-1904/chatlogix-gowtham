import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_TABULAR_BYTES = 5 * 1024 * 1024; // 5 MB
export const PRESIGNED_URL_EXPIRY_SECONDS = 15 * 60;

export const IMAGE_CONTENT_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

export const TABULAR_CONTENT_TYPES = new Set<string>([
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

export type ImportUploadKind = 'image' | 'tabular';

export class ImportStorageError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }
}

function looksLikeS3BucketArn(value: string): boolean {
  return value.startsWith('arn:aws:s3:::');
}

function validateBucketName(bucket: string): void {
  if (looksLikeS3BucketArn(bucket)) {
    throw new ImportStorageError(
      503,
      'BUCKET_NAME_EXPECTED',
      'CATALOG_IMPORT_S3_BUCKET must be a plain bucket name (for example: chatlogix-s3-frontend), not an ARN.'
    );
  }
  if (bucket.startsWith('arn:')) {
    throw new ImportStorageError(
      503,
      'BUCKET_NAME_EXPECTED',
      'CATALOG_IMPORT_S3_BUCKET must be a plain bucket name. ARN values are not supported for catalog import uploads.'
    );
  }
}

function mapPresignError(err: unknown): ImportStorageError {
  const e = err as {
    name?: string;
    message?: string;
    Code?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number; requestId?: string };
  };
  const text = `${e?.name || ''} ${e?.message || ''} ${e?.Code || ''} ${e?.code || ''}`.toLowerCase();

  if (text.includes('accessdenied') || text.includes('forbidden')) {
    return new ImportStorageError(
      503,
      'S3_ACCESS_DENIED',
      'S3 denied access while generating the upload URL. Verify IAM permissions for PutObject on the bucket.'
    );
  }
  if (text.includes('invalidaccesskeyid') || text.includes('signaturedoesnotmatch')) {
    return new ImportStorageError(
      503,
      'S3_AUTH_INVALID',
      'AWS credentials are invalid for the configured S3 bucket/region.'
    );
  }
  if (text.includes('unable to resolve credentials') || text.includes('credential')) {
    return new ImportStorageError(
      503,
      'S3_CREDENTIALS_MISSING',
      'AWS credentials are missing. Set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or run with an IAM role/profile.'
    );
  }
  if (text.includes('nosuchbucket') || text.includes('not found')) {
    return new ImportStorageError(
      503,
      'S3_BUCKET_NOT_FOUND',
      'Configured S3 bucket was not found in the target region.'
    );
  }
  if (text.includes('endpoint') || text.includes('region')) {
    return new ImportStorageError(
      503,
      'S3_ENDPOINT_MISCONFIGURED',
      'S3 endpoint/region configuration looks invalid. Verify CATALOG_IMPORT_S3_REGION and bucket region.'
    );
  }

  return new ImportStorageError(
    503,
    'S3_PRESIGN_FAILED',
    'Failed to generate S3 upload URL. Check backend logs for detailed AWS SDK error context.'
  );
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

function classify(contentType: string): ImportUploadKind | null {
  if (IMAGE_CONTENT_TYPES.has(contentType)) return 'image';
  if (TABULAR_CONTENT_TYPES.has(contentType)) return 'tabular';
  return null;
}

function sanitizeFilename(name: string): string {
  // Strip directory, keep basename, allow letters/digits/._-; collapse everything else to `_`.
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

export interface PresignedUploadRequest {
  vendorId: string;
  jobId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface PresignedUploadResult {
  s3Key: string;
  presignedUrl: string;
  expiresAt: string;
  kind: ImportUploadKind;
  storage: 's3' | 'local';
}

function catalogImportBucket(): string | undefined {
  const bucket = env.CATALOG_IMPORT_S3_BUCKET?.trim();
  return bucket || undefined;
}

function prepareUpload(input: PresignedUploadRequest): {
  kind: ImportUploadKind;
  s3Key: string;
} {
  const kind = classify(input.contentType);
  if (!kind) {
    throw new ImportStorageError(415, 'UNSUPPORTED_MEDIA_TYPE', `Content type ${input.contentType} is not allowed`);
  }

  const cap = kind === 'image' ? MAX_IMAGE_BYTES : MAX_TABULAR_BYTES;
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > cap) {
    throw new ImportStorageError(413, 'PAYLOAD_TOO_LARGE', `File size exceeds ${cap} bytes for kind=${kind}`);
  }

  const safeName = sanitizeFilename(input.filename);
  return {
    kind,
    s3Key: `imports/${input.vendorId}/${input.jobId}/${randomUUID()}-${safeName}`
  };
}

export async function createPresignedUploadUrl(
  input: PresignedUploadRequest
): Promise<PresignedUploadResult> {
  const { kind, s3Key } = prepareUpload(input);
  const expiresAt = new Date(Date.now() + PRESIGNED_URL_EXPIRY_SECONDS * 1000).toISOString();
  const bucket = catalogImportBucket();

  if (!bucket) {
    if (env.NODE_ENV === 'production') {
      throw new ImportStorageError(503, 'BUCKET_NOT_CONFIGURED', 'Catalog import bucket is not configured');
    }
    return { s3Key, presignedUrl: '', expiresAt, kind, storage: 'local' };
  }
  validateBucketName(bucket);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: input.contentType,
    ContentLength: input.sizeBytes
  });
  const region = env.CATALOG_IMPORT_S3_REGION || env.AWS_REGION;
  const hasStaticAwsCredentials = Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
  let presignedUrl: string;
  try {
    presignedUrl = await getSignedUrl(getClient(), command, {
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS
    });
  } catch (err) {
    const e = err as {
      name?: string;
      message?: string;
      Code?: string;
      code?: string;
      $metadata?: { httpStatusCode?: number; requestId?: string };
    };
    logger.error(
      {
        err,
        vendorId: input.vendorId,
        jobId: input.jobId,
        bucket,
        region,
        s3Key,
        hasStaticAwsCredentials,
        awsErrorName: e?.name,
        awsErrorCode: e?.Code || e?.code,
        awsRequestId: e?.$metadata?.requestId,
        awsHttpStatus: e?.$metadata?.httpStatusCode
      },
      'catalog_import_s3_presign_failed'
    );
    throw mapPresignError(err);
  }

  return { s3Key, presignedUrl, expiresAt, kind, storage: 's3' };
}
