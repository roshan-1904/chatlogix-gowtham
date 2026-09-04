import { S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

let client: S3Client | null = null;

/**
 * S3 client for WhatsApp media. The media bucket may live in a different
 * region than AWS_REGION (SQS/Lambdas). followRegionRedirects avoids the
 * PermanentRedirect 301 that otherwise turns /api/messages/:id/media into 503.
 */
export function getWaMediaS3Client(): S3Client {
  if (!client) {
    client = new S3Client({
      region: env.WA_MEDIA_S3_REGION || env.AWS_REGION,
      followRegionRedirects: true,
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
  return client;
}
