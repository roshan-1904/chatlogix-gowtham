import type { Request, Response } from 'express';
import { logger } from '../logger.js';
import { respondIfBadSignatureRateLimited } from '../middleware/razorpayWebhookBadSignatureLimit.js';
import { processRazorpayWebhook } from '../services/payments/razorpayWebhookService.js';

export async function razorpayWebhookHandler(req: Request, res: Response): Promise<void> {
  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) {
    res.sendStatus(400);
    return;
  }

  const signatureHeader = req.header('x-razorpay-signature') ?? undefined;
  const eventIdHeader = req.header('x-razorpay-event-id') ?? undefined;

  const result = await processRazorpayWebhook({
    rawBody,
    signatureHeader,
    eventIdHeader
  });

  if (result.status === 400 && result.reason === 'bad_signature') {
    if (respondIfBadSignatureRateLimited(req, res)) {
      return;
    }
    res.sendStatus(400);
    return;
  }

  if (result.status === 400) {
    res.sendStatus(400);
    return;
  }

  if (result.status === 500) {
    logger.warn({ eventIdHeader }, 'Razorpay webhook processing failed — returning 5xx for retry');
    res.sendStatus(500);
    return;
  }

  res.sendStatus(200);
}
