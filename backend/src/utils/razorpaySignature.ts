import crypto from 'crypto';

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Razorpay webhook: HMAC SHA256 hex digest of the raw body. */
export function isValidRazorpayWebhookSignature(
  webhookSecret: string | undefined,
  signatureHeader: string | undefined,
  rawBody: Buffer
): boolean {
  if (!webhookSecret || !signatureHeader) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signatureHeader, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

export function signRazorpayWebhookBody(webhookSecret: string, rawBody: Buffer): string {
  return crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
}
