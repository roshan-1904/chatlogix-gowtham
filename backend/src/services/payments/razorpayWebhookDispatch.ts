import type { Prisma } from '@prisma/client';
import { logger } from '../../logger.js';
import { milliToPaise } from '../../utils/money.js';
import {
  creditWalletFromTopUpInTx,
  type WalletTopUpCreditMetadata
} from '../wallet/walletTopUpService.js';
import {
  handleAutoRechargePaymentCapturedInTx,
  handleAutoRechargePaymentFailedInTx,
  handleTokenConfirmedInTx,
  handleTokenPausedOrCancelledInTx,
  handleTokenRejectedInTx,
  type RazorpayTokenWebhookEntity
} from '../wallet/autoRechargeService.js';
import type {
  RazorpayDisputeEntity,
  RazorpayPaymentEntity,
  RazorpayRefundEntity,
  RazorpayTransferEntity
} from './razorpayApiClient.js';
import { handleLinkedAccountWebhookInTx } from './linkedAccountService.js';
import {
  handleOrderPaymentCapturedInTx,
  handlePaymentLinkExpiredInTx
} from './orderPaymentWebhook.js';
import {
  handleDisputeWebhookInTx,
  handleRefundStateInTx,
  handleShopFundingCapturedInTx
} from './refundWebhook.js';

type Tx = Prisma.TransactionClient;

export type PaymentPurpose =
  | 'wallet_topup'
  | 'wallet_autorecharge'
  | 'order_payment'
  | 'shop_funding';

export interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity & { notes?: Record<string, string> } };
    refund?: { entity?: RazorpayRefundEntity };
    transfer?: { entity?: RazorpayTransferEntity };
    dispute?: { entity?: RazorpayDisputeEntity };
    order?: { entity?: { id?: string; notes?: Record<string, string> } };
    payment_link?: { entity?: { id?: string; notes?: Record<string, string> } };
    token?: { entity?: RazorpayTokenWebhookEntity };
    account?: { entity?: { id?: string; status?: string; holder_name_mismatch?: boolean } };
  };
}

export interface WebhookDispatchResult {
  createPendingTransfers: boolean;
  submitRefundIds: string[];
  submitPlatformRefundIds: string[];
}

export interface FetchedWebhookEntities {
  payment?: RazorpayPaymentEntity;
  refund?: RazorpayRefundEntity;
  transfer?: RazorpayTransferEntity;
  dispute?: RazorpayDisputeEntity;
}

export interface WebhookDispatchInput {
  eventType: string;
  body: RazorpayWebhookPayload;
  fetched: FetchedWebhookEntities;
  providerEventId: string;
}

function paymentNotes(body: RazorpayWebhookPayload, fetched: FetchedWebhookEntities): Record<string, string> {
  const fromFetch = fetched.payment?.notes;
  if (fromFetch && Object.keys(fromFetch).length > 0) return fromFetch;
  return body.payload?.payment?.entity?.notes ?? {};
}

export function extractPaymentPurpose(
  body: RazorpayWebhookPayload,
  fetched: FetchedWebhookEntities
): string | undefined {
  const notes = paymentNotes(body, fetched);
  if (notes.purpose) return notes.purpose;
  return body.payload?.payment_link?.entity?.notes?.purpose;
}

function isKnownEventName(eventType: string): boolean {
  if (
    eventType === 'payment.captured' ||
    eventType === 'payment.failed' ||
    eventType === 'order.paid' ||
    eventType === 'payment_link.paid' ||
    eventType === 'payment_link.expired' ||
    eventType === 'refund.processed' ||
    eventType === 'refund.failed'
  ) {
    return true;
  }
  if (
    eventType.startsWith('payment.dispute.') ||
    eventType.startsWith('transfer.') ||
    eventType.startsWith('account.') ||
    eventType.startsWith('token.')
  ) {
    return true;
  }
  return false;
}

async function handleWalletTopUpCaptured(
  tx: Tx,
  input: WebhookDispatchInput
): Promise<void> {
  const { fetched, providerEventId } = input;
  const payment = fetched.payment;
  if (!payment?.id) {
    logger.warn({ providerEventId }, 'wallet_topup payment.captured missing payment entity');
    return;
  }

  const notes = payment.notes ?? {};
  const intentId = notes.intentId?.trim();
  if (!intentId) {
    logger.warn(
      { providerEventId, paymentId: payment.id },
      'wallet_topup payment.captured missing notes.intentId — no credit'
    );
    return;
  }

  const intent = await tx.walletTopUpIntent.findUnique({ where: { id: intentId } });
  if (!intent) {
    logger.warn(
      { providerEventId, paymentId: payment.id, intentId },
      'wallet_topup intent not found — no credit'
    );
    return;
  }

  if (payment.amount !== milliToPaise(intent.amountMilli)) {
    logger.error(
      {
        providerEventId,
        paymentId: payment.id,
        intentId,
        expectedPaise: milliToPaise(intent.amountMilli),
        capturedPaise: payment.amount
      },
      'wallet_topup amount mismatch — no credit'
    );
    return;
  }

  const metadata: WalletTopUpCreditMetadata = {
    source: 'wallet_topup',
    provider: 'razorpay',
    intentId: intent.id,
    idempotencyKey: payment.id,
    amountMilli: intent.amountMilli,
    currency: 'INR',
    razorpay_order_id: payment.order_id,
    razorpay_payment_id: payment.id,
    razorpay_signature_verified: true
  };

  await creditWalletFromTopUpInTx(tx, {
    vendorId: intent.vendorId,
    amountMilli: intent.amountMilli,
    idempotencyKey: payment.id,
    metadata
  });

  if (intent.status !== 'completed') {
    await tx.walletTopUpIntent.update({
      where: { id: intent.id },
      data: { status: 'completed', completedAt: new Date() }
    });
  }
}

async function handleOrderPaymentEvent(
  tx: Tx,
  input: WebhookDispatchInput
): Promise<WebhookDispatchResult> {
  const payment = input.fetched.payment;
  if (!payment?.id) {
    logger.warn({ providerEventId: input.providerEventId }, 'order_payment webhook missing payment entity');
    return emptyDispatchResult();
  }
  const purpose = extractPaymentPurpose(input.body, input.fetched);
  if (purpose !== 'order_payment') {
    return emptyDispatchResult();
  }
  const outcome = await handleOrderPaymentCapturedInTx(tx, payment, input.providerEventId);
  const submitRefundIds: string[] = [];
  const submitPlatformRefundIds: string[] = [];
  if (outcome.submitPlatformRefund && outcome.platformRefundPaymentId) {
    const refund = await tx.customerRefund.findFirst({
      where: { customerPaymentId: outcome.platformRefundPaymentId, status: 'submitting' },
      orderBy: { createdAt: 'desc' }
    });
    if (refund) submitPlatformRefundIds.push(refund.id);
  }
  return {
    createPendingTransfers: outcome.shouldCreateTransfers,
    submitRefundIds,
    submitPlatformRefundIds
  };
}

function emptyDispatchResult(): WebhookDispatchResult {
  return { createPendingTransfers: false, submitRefundIds: [], submitPlatformRefundIds: [] };
}

export async function dispatchRazorpayWebhookTx(
  tx: Tx,
  input: WebhookDispatchInput
): Promise<WebhookDispatchResult> {
  const { eventType, body, fetched, providerEventId } = input;

  if (eventType === 'payment.captured') {
    const purpose = extractPaymentPurpose(body, fetched);
    switch (purpose) {
      case 'wallet_topup':
        await handleWalletTopUpCaptured(tx, input);
        return emptyDispatchResult();
      case 'wallet_autorecharge':
        await handleAutoRechargePaymentCapturedInTx(tx, {
          id: fetched.payment!.id,
          amount: fetched.payment!.amount,
          notes: fetched.payment!.notes
        });
        return emptyDispatchResult();
      case 'order_payment':
        return handleOrderPaymentEvent(tx, input);
      case 'shop_funding': {
        if (!fetched.payment) return emptyDispatchResult();
        const funded = await handleShopFundingCapturedInTx(tx, fetched.payment, providerEventId);
        return {
          createPendingTransfers: false,
          submitRefundIds: funded.submitRefundId ? [funded.submitRefundId] : [],
          submitPlatformRefundIds: []
        };
      }
      default:
        logger.warn(
          { providerEventId, eventType, purpose: purpose ?? null },
          'payment.captured with unknown notes.purpose — alert, no credit'
        );
        return emptyDispatchResult();
    }
  }

  if (eventType === 'payment_link.paid') {
    return handleOrderPaymentEvent(tx, input);
  }

  if (eventType === 'payment_link.expired') {
    await handlePaymentLinkExpiredInTx(tx, body);
    return emptyDispatchResult();
  }

  if (eventType === 'payment.failed') {
    const purpose = extractPaymentPurpose(body, fetched);
    if (purpose === 'wallet_autorecharge' && fetched.payment) {
      await handleAutoRechargePaymentFailedInTx(tx, {
        id: fetched.payment.id,
        notes: fetched.payment.notes
      });
    }
    return emptyDispatchResult();
  }

  if (eventType === 'refund.processed' || eventType === 'refund.failed') {
    const refundEntity = fetched.refund ?? body.payload?.refund?.entity;
    if (refundEntity) {
      await handleRefundStateInTx(
        tx,
        refundEntity,
        eventType === 'refund.processed' ? 'processed' : 'failed'
      );
    }
    return emptyDispatchResult();
  }

  if (eventType.startsWith('payment.dispute.')) {
    const dispute = fetched.dispute ?? body.payload?.dispute?.entity;
    if (dispute) {
      await handleDisputeWebhookInTx(tx, eventType, dispute);
    }
    return emptyDispatchResult();
  }

  if (eventType === 'token.confirmed') {
    const token = body.payload?.token?.entity;
    if (token) {
      await handleTokenConfirmedInTx(tx, token, 'razorpay_webhook');
    }
    return emptyDispatchResult();
  }

  if (eventType === 'token.rejected') {
    const token = body.payload?.token?.entity;
    if (token) {
      await handleTokenRejectedInTx(tx, token);
    }
    return emptyDispatchResult();
  }

  if (eventType === 'token.paused' || eventType === 'token.cancelled') {
    const token = body.payload?.token?.entity;
    if (token) {
      await handleTokenPausedOrCancelledInTx(tx, token, eventType);
    }
    return emptyDispatchResult();
  }

  if (eventType.startsWith('account.')) {
    const account = body.payload?.account?.entity;
    if (account?.id) {
      const status =
        eventType === 'account.activated'
          ? 'activated'
          : account.status ?? eventType.replace('account.', '');
      await handleLinkedAccountWebhookInTx(tx, {
        accountId: account.id,
        status,
        holderNameMismatch: account.holder_name_mismatch
      });
    }
    return emptyDispatchResult();
  }

  if (isKnownEventName(eventType)) {
    logger.info(
      { providerEventId, eventType },
      'Razorpay webhook known event without handler in this phase'
    );
    return emptyDispatchResult();
  }

  logger.info(
    { providerEventId, eventType },
    'Razorpay webhook unknown event stored without handler'
  );
  return emptyDispatchResult();
}

export type WebhookDispatchFn = (
  tx: Tx,
  input: WebhookDispatchInput
) => Promise<WebhookDispatchResult>;

let dispatchOverrideForTests: WebhookDispatchFn | null = null;

export function setWebhookDispatchForTests(fn: WebhookDispatchFn | null): void {
  dispatchOverrideForTests = fn;
}

export async function runWebhookDispatchTx(
  tx: Tx,
  input: WebhookDispatchInput
): Promise<WebhookDispatchResult> {
  const fn = dispatchOverrideForTests ?? dispatchRazorpayWebhookTx;
  return fn(tx, input);
}
