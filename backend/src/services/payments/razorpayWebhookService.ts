import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../logger.js';
import { isValidRazorpayWebhookSignature } from '../../utils/razorpaySignature.js';
import { env } from '../../config/env.js';
import { isPaymentAppError } from './razorpayHttpErrors.js';
import {
  getRazorpayApiClient,
  type RazorpayApiClient
} from './razorpayApiClient.js';
import {
  type FetchedWebhookEntities,
  type RazorpayWebhookPayload,
  runWebhookDispatchTx
} from './razorpayWebhookDispatch.js';
import { createPendingTransfers, submitRefund } from './settlementService.js';

export interface RazorpayWebhookRequest {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  eventIdHeader: string | undefined;
}

export type RazorpayWebhookResult =
  | { status: 200 }
  | { status: 400; reason: 'bad_signature' | 'bad_payload' | 'missing_event_id' }
  | { status: 500 };

function parsePayload(rawBody: Buffer): RazorpayWebhookPayload | null {
  try {
    return JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookPayload;
  } catch {
    return null;
  }
}

function entityId(body: RazorpayWebhookPayload): {
  razorpayPaymentId: string | null;
  razorpayRefundId: string | null;
} {
  const paymentId =
    body.payload?.payment?.entity?.id ??
    body.payload?.refund?.entity?.payment_id ??
    body.payload?.dispute?.entity?.payment_id ??
    null;
  const refundId = body.payload?.refund?.entity?.id ?? null;
  return {
    razorpayPaymentId: paymentId,
    razorpayRefundId: refundId
  };
}

function eventNeedsPaymentFetch(eventType: string): boolean {
  return (
    eventType === 'payment.captured' ||
    eventType === 'payment.failed' ||
    eventType === 'order.paid' ||
    eventType === 'payment_link.paid'
  );
}

function eventNeedsRefundFetch(eventType: string): boolean {
  return eventType === 'refund.processed' || eventType === 'refund.failed';
}

function eventNeedsTransferFetch(eventType: string): boolean {
  return eventType.startsWith('transfer.');
}

function eventNeedsDisputeFetch(eventType: string): boolean {
  return eventType.startsWith('payment.dispute.');
}

async function fetchEntitiesForEvent(
  eventType: string,
  body: RazorpayWebhookPayload,
  api: RazorpayApiClient
): Promise<FetchedWebhookEntities> {
  const fetched: FetchedWebhookEntities = {};

  if (eventNeedsPaymentFetch(eventType)) {
    const id = body.payload?.payment?.entity?.id;
    if (id) fetched.payment = await api.fetchPayment(id);
  }

  if (eventNeedsRefundFetch(eventType)) {
    const id = body.payload?.refund?.entity?.id;
    if (id) fetched.refund = await api.fetchRefund(id);
  }

  if (eventNeedsTransferFetch(eventType)) {
    const id = body.payload?.transfer?.entity?.id;
    if (id) fetched.transfer = await api.fetchTransfer(id);
  }

  if (eventNeedsDisputeFetch(eventType)) {
    const id = body.payload?.dispute?.entity?.id;
    if (id) fetched.dispute = await api.fetchDispute(id);
  }

  return fetched;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function processRazorpayWebhook(
  req: RazorpayWebhookRequest
): Promise<RazorpayWebhookResult> {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!isValidRazorpayWebhookSignature(secret, req.signatureHeader, req.rawBody)) {
    return { status: 400, reason: 'bad_signature' };
  }

  const providerEventId = req.eventIdHeader?.trim();
  if (!providerEventId) {
    return { status: 400, reason: 'missing_event_id' };
  }

  const body = parsePayload(req.rawBody);
  if (!body?.event) {
    return { status: 400, reason: 'bad_payload' };
  }

  const eventType = body.event;

  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: { providerEventId },
    select: { id: true }
  });
  if (existing) {
    return { status: 200 };
  }

  let fetched: FetchedWebhookEntities = {};
  try {
    fetched = await fetchEntitiesForEvent(eventType, body, getRazorpayApiClient());
  } catch (err) {
    if (isPaymentAppError(err)) {
      logger.error(
        {
          providerEventId,
          eventType,
          paymentProvider: 'razorpay',
          paymentOperation: err.context?.operation,
          httpStatus: err.context?.httpStatus,
          razorpay: err.context?.razorpay,
          routeNotEnabled: err.context?.routeNotEnabled,
          message: err.message
        },
        'Razorpay webhook pre-fetch failed (payment provider error)'
      );
    } else {
      logger.error({ err, providerEventId, eventType }, 'Razorpay webhook pre-fetch failed');
    }
    return { status: 500 };
  }

  const { razorpayPaymentId, razorpayRefundId } = entityId(body);

  let createTransfersAfterCommit = false;
  let submitRefundIds: string[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      await tx.paymentWebhookEvent.create({
        data: {
          providerEventId,
          eventType,
          razorpayPaymentId,
          razorpayRefundId
        }
      });

      const dispatchResult = await runWebhookDispatchTx(tx, {
        eventType,
        body,
        fetched,
        providerEventId
      });
      createTransfersAfterCommit = dispatchResult.createPendingTransfers;
      submitRefundIds = [
        ...dispatchResult.submitRefundIds,
        ...dispatchResult.submitPlatformRefundIds
      ];

      await tx.paymentWebhookEvent.update({
        where: { providerEventId },
        data: { processedAt: new Date() }
      });
    });

    if (createTransfersAfterCommit) {
      await createPendingTransfers().catch((err) => {
        logger.error({ err, providerEventId, eventType }, 'createPendingTransfers after order payment failed');
      });
    }
    for (const refundId of submitRefundIds) {
      await submitRefund(refundId).catch((err) => {
        logger.error({ err, providerEventId, refundId }, 'submitRefund after webhook commit failed');
      });
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { status: 200 };
    }
    if (isPaymentAppError(err)) {
      logger.error(
        {
          providerEventId,
          eventType,
          paymentProvider: 'razorpay',
          paymentOperation: err.context?.operation,
          httpStatus: err.context?.httpStatus,
          razorpay: err.context?.razorpay,
          routeNotEnabled: err.context?.routeNotEnabled,
          message: err.message
        },
        'Razorpay webhook transaction failed (payment provider error)'
      );
    } else {
      logger.error({ err, providerEventId, eventType }, 'Razorpay webhook transaction failed');
    }
    return { status: 500 };
  }

  return { status: 200 };
}
