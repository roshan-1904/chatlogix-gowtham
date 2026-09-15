import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { uploadWhatsAppMedia } from './whatsappClient.js';
import { readProductMediaObject } from './productMediaStorage.js';
import { getWaMediaS3Client } from '../utils/waMediaS3.js';

type ProductMediaBlobSource = {
  id: string;
  s3Bucket: string;
  s3Key: string;
  mimeType: string;
};

/** Meta fetches the object once per send; keep >= 5 minutes. */
export const PRODUCT_MEDIA_OUTBOUND_PRESIGN_SECONDS = 300;

/**
 * Presigned GET for WhatsApp outbound `link` sends. Not exposed to the vendor portal.
 */
/** Stream catalog media from S3 into WhatsApp Graph, return `media_id` for send. */
export async function uploadProductMediaForWhatsAppSend(
  productMedia: ProductMediaBlobSource,
  phoneNumberId: string
): Promise<string> {
  const { bytes, contentType } = await readProductMediaObject(productMedia);
  const filename = productMedia.s3Key.split('/').pop() ?? `product-${productMedia.id}`;
  const { mediaId } = await uploadWhatsAppMedia(phoneNumberId, contentType, bytes, filename);
  return mediaId;
}

export async function presignProductMediaOutboundGetUrl(
  s3Bucket: string,
  s3Key: string,
  expiresInSeconds: number = PRODUCT_MEDIA_OUTBOUND_PRESIGN_SECONDS
): Promise<string> {
  const expiresIn = Math.max(expiresInSeconds, PRODUCT_MEDIA_OUTBOUND_PRESIGN_SECONDS);
  const command = new GetObjectCommand({ Bucket: s3Bucket, Key: s3Key });
  return getSignedUrl(getWaMediaS3Client(), command, { expiresIn });
}
