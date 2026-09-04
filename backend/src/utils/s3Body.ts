/**
 * AWS SDK v3 GetObject Body is an SdkStream: in Node it often looks like a
 * Readable, but depending on runtime/handler it may only expose the mixin
 * helpers. Catalog import already reads via transformToByteArray(); do the
 * same here so /media does not throw on body.pipe is not a function.
 */
export async function readS3ObjectBody(body: unknown): Promise<Buffer> {
  if (body == null || typeof body !== 'object') {
    throw new Error('S3 object body was empty');
  }

  const candidate = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof candidate.transformToByteArray !== 'function') {
    throw new Error('S3 object body is not readable');
  }

  const bytes = await candidate.transformToByteArray();
  return Buffer.from(bytes);
}

/** WhatsApp voice notes are Opus in an Ogg container; browsers need the codec hint. */
export function mediaResponseContentType(
  mimeType?: string | null,
  s3ContentType?: string
): string {
  const raw = mimeType || s3ContentType || 'application/octet-stream';
  if (raw === 'audio/ogg' || raw.startsWith('audio/ogg;')) {
    return 'audio/ogg; codecs=opus';
  }
  return raw;
}
