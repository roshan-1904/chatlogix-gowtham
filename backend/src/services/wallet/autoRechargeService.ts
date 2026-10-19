import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { env, walletEnv } from '../../config/env.js';
import { createError, ErrorType } from '../../middleware/errorHandler.js';
import { logger } from '../../logger.js';
import { getRazorpayApiClient } from '../payments/razorpayApiClient.js';
import { lockVendorForSettlement } from '../payments/vendorSettlementLock.js';
import { AUTO_RECHARGE_THRESHOLD_MILLI } from '../payments/settlementMath.js';
import { milliToPaise } from '../../utils/money.js';
import { assertVendorCanTopUp } from './walletTopUpService.js';
import {
  AUTO_RECHARGE_PRESET_AMOUNTS_MILLI,
  AUTO_RECHARGE_SCHEDULE_DELAY_MS,
  AUTO_RECHARGE_SWEEP_INTERVAL_MS,
  isAutoRechargePresetMilli
} from './autoRechargeConstants.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MANDATE_TOKEN_TTL_SEC = 10 * 365 * 24 * 60 * 60;

type Tx = PrismaTypes.TransactionClient;

export function scheduleDayUtcFromDate(date: Date): Date {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

function debitAtUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

async function ensureRazorpayCustomerId(vendorId: string): Promise<string> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      id: true,
      businessName: true,
      email: true,
      phone: true,
      razorpayWalletCustomerId: true
    }
  });
  if (!vendor) {
    throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  }
  if (vendor.razorpayWalletCustomerId) {
    return vendor.razorpayWalletCustomerId;
  }

  const customer = await getRazorpayApiClient().createCustomer({
    name: vendor.businessName,
    email: vendor.email,
    contact: vendor.phone,
    notes: { vendorId: vendor.id, purpose: 'wallet_autorecharge' }
  });

  await prisma.vendor.update({
    where: { id: vendorId },
    data: { razorpayWalletCustomerId: customer.id }
  });

  return customer.id;
}

export type AutoRechargeClientAction = {
  type: 'razorpay_mandate_checkout';
  orderId: string;
  customerId: string;
  keyId: string;
  amountMilli: number;
  registrationId: string;
};

export async function startAutoRechargeMandateRegistration(
  vendorId: string,
  amountMilli: number,
  approvedBy: string
): Promise<{ registrationId: string; clientAction: AutoRechargeClientAction | null }> {
  if (walletEnv.paymentProvider !== 'razorpay') {
    throw createError(
      'Auto-recharge requires Razorpay',
      403,
      ErrorType.PAYMENT,
      undefined,
      { error: 'auto_recharge_unavailable' }
    );
  }

  if (!isAutoRechargePresetMilli(amountMilli)) {
    throw createError('Invalid auto-recharge amount', 400, ErrorType.VALIDATION, undefined, {
      error: 'invalid_auto_recharge_amount',
      allowedMilli: AUTO_RECHARGE_PRESET_AMOUNTS_MILLI
    });
  }

  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw createError('Razorpay is not configured', 503, ErrorType.PAYMENT, undefined, {
      error: 'razorpay_not_configured'
    });
  }

  await assertVendorCanTopUp(vendorId);

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      autoRechargeMandateId: true,
      autoRechargeAmountMilli: true
    }
  });
  if (!vendor) {
    throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  }

  const replaceMandateId =
    vendor.autoRechargeMandateId &&
    vendor.autoRechargeAmountMilli !== amountMilli &&
    vendor.autoRechargeMandateId.trim()
      ? vendor.autoRechargeMandateId
      : null;

  await prisma.walletAutoRechargeRegistration.updateMany({
    where: { vendorId, status: 'pending' },
    data: { status: 'cancelled' }
  });

  const registrationId = randomUUID();
  const customerId = await ensureRazorpayCustomerId(vendorId);
  const maxAmountPaise = milliToPaise(amountMilli);

  const order = await getRazorpayApiClient().createMandateRegistrationOrder({
    customerId,
    maxAmountPaise,
    receipt: registrationId.replace(/-/g, '').slice(0, 40),
    notes: {
      purpose: 'wallet_autorecharge_mandate',
      vendorId,
      registrationId,
      amountMilli: String(amountMilli),
      approvedBy
    },
    tokenExpireAtUnix: Math.floor(Date.now() / 1000) + MANDATE_TOKEN_TTL_SEC
  });

  await prisma.walletAutoRechargeRegistration.create({
    data: {
      id: registrationId,
      vendorId,
      amountMilli,
      status: 'pending',
      razorpayOrderId: order.id,
      replaceMandateId
    }
  });

  logger.info({ vendorId, registrationId, amountMilli, approvedBy }, 'auto_recharge_mandate_registration_started');

  return {
    registrationId,
    clientAction: {
      type: 'razorpay_mandate_checkout',
      orderId: order.id,
      customerId,
      keyId,
      amountMilli,
      registrationId
    }
  };
}

export async function disableAutoRecharge(vendorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockVendorForSettlement(tx, vendorId);
    await tx.vendor.update({
      where: { id: vendorId },
      data: {
        autoRechargeEnabled: false
      }
    });
    await cancelScheduledAttemptsInTx(tx, vendorId, 'vendor_disabled');
  });
}

async function cancelScheduledAttemptsInTx(tx: Tx, vendorId: string, reason: string): Promise<void> {
  await tx.walletAutoRechargeAttempt.updateMany({
    where: { vendorId, status: { in: ['scheduled', 'pending'] } },
    data: { status: 'cancelled', failureReason: reason }
  });
}

export async function maybeScheduleAutoRechargeAfterDebit(
  vendorId: string,
  balanceAfterMilli: number,
  now = new Date()
): Promise<void> {
  if (balanceAfterMilli >= AUTO_RECHARGE_THRESHOLD_MILLI) {
    return;
  }
  await scheduleAutoRechargeAttemptIfEligible(vendorId, now);
}

export async function scheduleAutoRechargeAttemptIfEligible(vendorId: string, now = new Date()): Promise<boolean> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      walletBalanceMilli: true,
      autoRechargeEnabled: true,
      autoRechargeAmountMilli: true,
      autoRechargeMandateId: true,
      razorpayWalletCustomerId: true,
      email: true,
      phone: true
    }
  });

  if (!vendor) return false;
  if (!vendor.autoRechargeEnabled || !vendor.autoRechargeMandateId || !vendor.autoRechargeAmountMilli) {
    return false;
  }
  if (vendor.walletBalanceMilli >= AUTO_RECHARGE_THRESHOLD_MILLI) {
    return false;
  }

  const scheduleDay = scheduleDayUtcFromDate(now);
  const inflight = await prisma.walletAutoRechargeAttempt.findFirst({
    where: {
      vendorId,
      OR: [{ status: { in: ['scheduled', 'pending'] } }, { scheduleDay }]
    }
  });
  if (inflight) {
    return false;
  }

  const scheduledDebitAt = new Date(now.getTime() + AUTO_RECHARGE_SCHEDULE_DELAY_MS);
  const amountMilli = vendor.autoRechargeAmountMilli;

  let attemptId: string;
  try {
    const created = await prisma.walletAutoRechargeAttempt.create({
      data: {
        vendorId,
        amountMilli,
        status: 'scheduled',
        scheduledDebitAt,
        scheduleDay
      }
    });
    attemptId = created.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false;
    }
    throw error;
  }

  const customerId = vendor.razorpayWalletCustomerId;
  const mandateId = vendor.autoRechargeMandateId;
  if (customerId && mandateId) {
    try {
      await getRazorpayApiClient().notifyRecurringPreDebit({
        customerId,
        tokenId: mandateId,
        amountPaise: milliToPaise(amountMilli),
        debitAtUnix: debitAtUnixSeconds(scheduledDebitAt)
      });
      await prisma.walletAutoRechargeAttempt.update({
        where: { id: attemptId },
        data: { preDebitNotifiedAt: now }
      });
    } catch (err) {
      logger.warn({ err, vendorId, attemptId }, 'auto_recharge_pre_debit_notify_failed');
    }
  }

  logger.info({ vendorId, attemptId, scheduledDebitAt, amountMilli }, 'auto_recharge_attempt_scheduled');
  return true;
}

export async function sweepVendorsForAutoRecharge(now = new Date()): Promise<number> {
  const vendors = await prisma.vendor.findMany({
    where: {
      autoRechargeEnabled: true,
      autoRechargeMandateId: { not: null },
      autoRechargeAmountMilli: { not: null },
      walletBalanceMilli: { lt: AUTO_RECHARGE_THRESHOLD_MILLI }
    },
    select: { id: true }
  });

  let scheduled = 0;
  for (const { id } of vendors) {
    const did = await scheduleAutoRechargeAttemptIfEligible(id, now);
    if (did) scheduled += 1;
  }
  return scheduled;
}

export async function processDueAutoRechargeAttempts(now = new Date()): Promise<number> {
  const due = await prisma.walletAutoRechargeAttempt.findMany({
    where: {
      status: 'scheduled',
      scheduledDebitAt: { lte: now }
    },
    take: 50,
    include: {
      vendor: {
        select: {
          id: true,
          email: true,
          phone: true,
          autoRechargeMandateId: true,
          razorpayWalletCustomerId: true,
          autoRechargeEnabled: true
        }
      }
    }
  });

  let processed = 0;
  for (const attempt of due) {
    const vendor = attempt.vendor;
    if (!vendor.autoRechargeEnabled || !vendor.autoRechargeMandateId || !vendor.razorpayWalletCustomerId) {
      await prisma.walletAutoRechargeAttempt.update({
        where: { id: attempt.id },
        data: { status: 'cancelled', failureReason: 'mandate_unavailable' }
      });
      continue;
    }

    try {
      const order = await getRazorpayApiClient().createOrder({
        amountPaise: milliToPaise(attempt.amountMilli),
        receipt: attempt.id.replace(/-/g, '').slice(0, 40),
        notes: {
          purpose: 'wallet_autorecharge',
          vendorId: vendor.id,
          attemptId: attempt.id,
          amountMilli: String(attempt.amountMilli)
        }
      });

      await getRazorpayApiClient().createRecurringPayment({
        email: vendor.email,
        contact: vendor.phone,
        amountPaise: milliToPaise(attempt.amountMilli),
        orderId: order.id,
        customerId: vendor.razorpayWalletCustomerId,
        tokenId: vendor.autoRechargeMandateId,
        description: 'ChatLogix AI wallet auto-recharge'
      });

      await prisma.walletAutoRechargeAttempt.update({
        where: { id: attempt.id },
        data: { status: 'pending', razorpayOrderId: order.id }
      });
      processed += 1;
    } catch (err) {
      logger.error({ err, attemptId: attempt.id, vendorId: vendor.id }, 'auto_recharge_debit_failed');
      await prisma.walletAutoRechargeAttempt.update({
        where: { id: attempt.id },
        data: { status: 'failed', failureReason: 'debit_request_failed' }
      });
      notifyAutoRechargeFailure(vendor.id, 'We could not debit your UPI mandate. Auto-recharge is paused until you turn it on again.');
      await prisma.vendor.update({
        where: { id: vendor.id },
        data: { autoRechargeEnabled: false }
      });
    }
  }

  return processed;
}

function notifyAutoRechargeFailure(vendorId: string, message: string): void {
  logger.info({ vendorId, message }, 'auto_recharge_vendor_notice');
}

export async function cancelSupersededMandateAfterCommit(
  customerId: string | null | undefined,
  mandateId: string | null | undefined
): Promise<void> {
  if (!customerId || !mandateId) return;
  try {
    await getRazorpayApiClient().cancelCustomerToken(customerId, mandateId);
  } catch (err) {
    logger.warn({ err, customerId, mandateId }, 'auto_recharge_cancel_superseded_mandate_failed');
  }
}

export interface RazorpayTokenWebhookEntity {
  id?: string;
  customer_id?: string;
  notes?: Record<string, string>;
}

export async function handleTokenConfirmedInTx(
  tx: Tx,
  token: RazorpayTokenWebhookEntity,
  approvedByFallback: string
): Promise<void> {
  const mandateId = token.id?.trim();
  const notes = token.notes ?? {};
  const vendorId = notes.vendorId?.trim();
  const registrationId = notes.registrationId?.trim();
  const amountFromNotes = notes.amountMilli ? Number(notes.amountMilli) : NaN;

  if (!mandateId || !vendorId || !registrationId) {
    logger.warn({ mandateId, vendorId, registrationId }, 'token.confirmed missing vendor/registration notes');
    return;
  }

  const registration = await tx.walletAutoRechargeRegistration.findUnique({
    where: { id: registrationId }
  });
  if (!registration || registration.vendorId !== vendorId) {
    logger.warn({ registrationId, vendorId }, 'token.confirmed registration not found');
    return;
  }

  const amountMilli = Number.isFinite(amountFromNotes) ? amountFromNotes : registration.amountMilli;
  if (!isAutoRechargePresetMilli(amountMilli)) {
    logger.warn({ amountMilli, vendorId }, 'token.confirmed invalid amount');
    return;
  }

  await lockVendorForSettlement(tx, vendorId);

  const vendor = await tx.vendor.findUnique({
    where: { id: vendorId },
    select: {
      razorpayWalletCustomerId: true,
      autoRechargeMandateId: true
    }
  });
  if (!vendor) return;

  const customerId = token.customer_id?.trim() ?? vendor.razorpayWalletCustomerId ?? undefined;
  if (customerId && !vendor.razorpayWalletCustomerId) {
    await tx.vendor.update({
      where: { id: vendorId },
      data: { razorpayWalletCustomerId: customerId }
    });
  }

  const replaceMandateId = registration.replaceMandateId;

  await tx.vendor.update({
    where: { id: vendorId },
    data: {
      autoRechargeEnabled: true,
      autoRechargeAmountMilli: amountMilli,
      autoRechargeMandateId: mandateId
    }
  });

  await tx.walletAutoRechargeRegistration.update({
    where: { id: registrationId },
    data: { status: 'confirmed' }
  });

  await tx.walletAutoRechargeMandateAudit.create({
    data: {
      vendorId,
      mandateId,
      amountMilli,
      approvedBy: notes.approvedBy?.trim() || approvedByFallback
    }
  });

  if (replaceMandateId && replaceMandateId !== mandateId) {
    await cancelSupersededMandateAfterCommit(customerId ?? vendor.razorpayWalletCustomerId, replaceMandateId);
  }

  logger.info({ vendorId, mandateId, amountMilli }, 'auto_recharge_mandate_confirmed');
}

export async function handleTokenRejectedInTx(tx: Tx, token: RazorpayTokenWebhookEntity): Promise<void> {
  const notes = token.notes ?? {};
  const vendorId = notes.vendorId?.trim();
  const registrationId = notes.registrationId?.trim();
  if (registrationId) {
    await tx.walletAutoRechargeRegistration.updateMany({
      where: { id: registrationId, status: 'pending' },
      data: { status: 'rejected' }
    });
  }
  if (!vendorId) return;

  await lockVendorForSettlement(tx, vendorId);
  await tx.vendor.update({
    where: { id: vendorId },
    data: { autoRechargeEnabled: false }
  });
  notifyAutoRechargeFailure(vendorId, 'Your UPI auto-recharge mandate was not approved. Auto-recharge stays off.');
}

export async function handleTokenPausedOrCancelledInTx(
  tx: Tx,
  token: RazorpayTokenWebhookEntity,
  eventType: 'token.paused' | 'token.cancelled'
): Promise<void> {
  const mandateId = token.id?.trim();
  const notes = token.notes ?? {};
  let vendorId: string | undefined = notes.vendorId?.trim();

  if (!vendorId && mandateId) {
    const vendor = await tx.vendor.findFirst({
      where: { autoRechargeMandateId: mandateId },
      select: { id: true }
    });
    vendorId = vendor?.id;
  }

  if (!vendorId) {
    logger.warn({ mandateId, eventType }, 'token lifecycle event without vendor');
    return;
  }

  await lockVendorForSettlement(tx, vendorId);
  await tx.vendor.update({
    where: { id: vendorId },
    data: {
      autoRechargeEnabled: false,
      ...(eventType === 'token.cancelled' ? { autoRechargeMandateId: null } : {})
    }
  });
  await cancelScheduledAttemptsInTx(tx, vendorId, eventType);

  const message =
    eventType === 'token.paused'
      ? 'Your bank paused the UPI auto-recharge mandate. Auto-recharge is off until you set it up again.'
      : 'Your UPI auto-recharge mandate was cancelled. Auto-recharge is off.';
  notifyAutoRechargeFailure(vendorId, message);
}

export async function handleAutoRechargePaymentCapturedInTx(
  tx: Tx,
  payment: { id: string; amount: number; notes?: Record<string, string> }
): Promise<void> {
  const notes = payment.notes ?? {};
  const vendorId = notes.vendorId?.trim();
  const attemptId = notes.attemptId?.trim();
  const amountFromNotes = notes.amountMilli ? Number(notes.amountMilli) : NaN;

  if (!vendorId) {
    logger.warn({ paymentId: payment.id }, 'wallet_autorecharge capture missing vendorId');
    return;
  }

  await lockVendorForSettlement(tx, vendorId);

  const vendor = await tx.vendor.findUnique({
    where: { id: vendorId },
    select: {
      autoRechargeAmountMilli: true,
      settlementBalanceMilli: true
    }
  });
  if (!vendor?.autoRechargeAmountMilli) {
    logger.warn({ vendorId, paymentId: payment.id }, 'wallet_autorecharge vendor missing preset');
    return;
  }

  const amountMilli = Number.isFinite(amountFromNotes) ? amountFromNotes : vendor.autoRechargeAmountMilli;
  if (payment.amount !== milliToPaise(amountMilli)) {
    logger.error(
      {
        paymentId: payment.id,
        vendorId,
        expectedPaise: milliToPaise(amountMilli),
        capturedPaise: payment.amount
      },
      'wallet_autorecharge amount mismatch — no credit'
    );
    return;
  }

  const { creditWalletFromTopUpInTx } = await import('./walletTopUpService.js');
  await creditWalletFromTopUpInTx(tx, {
    vendorId,
    amountMilli,
    idempotencyKey: payment.id,
    metadata: {
      source: 'wallet_autorecharge',
      provider: 'razorpay',
      idempotencyKey: payment.id,
      amountMilli,
      currency: 'INR',
      razorpay_payment_id: payment.id,
      attemptId: attemptId ?? undefined,
      razorpay_signature_verified: true
    }
  });

  if (attemptId) {
    await tx.walletAutoRechargeAttempt.updateMany({
      where: { id: attemptId, vendorId },
      data: { status: 'completed' }
    });
  }
}

export async function handleAutoRechargePaymentFailedInTx(
  tx: Tx,
  payment: { id: string; notes?: Record<string, string> }
): Promise<void> {
  const notes = payment.notes ?? {};
  const vendorId = notes.vendorId?.trim();
  const attemptId = notes.attemptId?.trim();
  if (!vendorId) return;

  await lockVendorForSettlement(tx, vendorId);
  if (attemptId) {
    await tx.walletAutoRechargeAttempt.updateMany({
      where: { id: attemptId, vendorId },
      data: { status: 'failed', failureReason: 'payment_failed' }
    });
  }
  await tx.vendor.update({
    where: { id: vendorId },
    data: { autoRechargeEnabled: false }
  });
}

export function startAutoRechargeBackgroundLoops(): NodeJS.Timeout {
  const tick = () => {
    void sweepVendorsForAutoRecharge()
      .then((n) => {
        if (n > 0) logger.info({ scheduled: n }, 'auto_recharge_sweep_scheduled');
      })
      .catch((err) => logger.warn({ err }, 'auto_recharge_sweep_failed'));

    void processDueAutoRechargeAttempts()
      .then((n) => {
        if (n > 0) logger.info({ processed: n }, 'auto_recharge_due_processed');
      })
      .catch((err) => logger.warn({ err }, 'auto_recharge_due_process_failed'));
  };

  tick();
  return setInterval(tick, AUTO_RECHARGE_SWEEP_INTERVAL_MS);
}
