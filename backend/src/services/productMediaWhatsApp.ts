import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getWaMediaS3Client } from '../utils/waMediaS3.js';

/** Meta fetches the object once per send; keep >= 5 minutes. */
export const PRODUCT_MEDIA_OUTBOUND_PRESIGN_SECONDS = 300;

/**
 * Presigned GET for WhatsApp outbound `link` sends. Not exposed to the vendor portal.
 */
export async function presignProductMediaOutboundGetUrl(
  s3Bucket: string,
  s3Key: string,
  expiresInSeconds: number = PRODUCT_MEDIA_OUTBOUND_PRESIGN_SECONDS
): Promise<string> {
  const expiresIn = Math.max(expiresInSeconds, PRODUCT_MEDIA_OUTBOUND_PRESIGN_SECONDS);
  const command = new GetObjectCommand({ Bucket: s3Bucket, Key: s3Key });
  return getSignedUrl(getWaMediaS3Client(), command, { expiresIn });
}
