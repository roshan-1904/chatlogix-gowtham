import { prisma } from '../../db/prisma.js';
import { env, metaConnectEnv } from '../../config/env.js';
import { createError, ErrorType } from '../../middleware/errorHandler.js';
import { canProcessMessage } from '../billingService.js';
import { encryptWhatsAppToken } from '../../utils/whatsappTokenCrypto.js';
import {
  attachExtendedCreditLine,
  exchangeEmbeddedSignupCode,
  fetchPhoneNumberProfile,
  fetchWabaPrimaryFundingId,
  registerCloudPhoneNumber,
  subscribeAppToWaba
} from './whatsappConnectGraph.js';
import {
  ACTIVE_CONNECT_STATUSES,
  type WhatsAppConnectPath,
  type WhatsAppConnectStatus
} from './whatsappConnectTypes.js';
import { buildWaMeLink, mapGraphFailure, vendorMessageForCode } from './whatsappConnectErrors.js';
import { logger } from '../../logger.js';

export type CompleteConnectInput = {
  code: string;
  wabaId: string;
  phoneNumberId: string;
  businessId?: string;
  connectPath: WhatsAppConnectPath;
};

export type WhatsAppStatusResponse = {
  connectStatus: WhatsAppConnectStatus | null;
  connectPath: WhatsAppConnectPath | null;
  phoneNumberId: string | null;
  displayPhone: string | null;
  displayName: string | null;
  waMeLink: string | null;
  mockAttachSkipped: boolean;
  testInboundAt: string | null;
  walletCanReply: boolean;
  walletBlockReason: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  connectedAt: string | null;
  liveAt: string | null;
};

export async function assertVendorApprovedForWhatsApp(vendorId: string): Promise<void> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, registrationStatus: true }
  });
  if (!vendor) {
    throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  }
  if (vendor.registrationStatus !== 'approved') {
    throw createError(
      vendorMessageForCode('vendor_not_approved'),
      403,
      ErrorType.AUTHORIZATION,
      undefined,
      { error: 'vendor_not_approved', code: 'vendor_not_approved' }
    );
  }
}

export function getEmbeddedSignupPublicConfig(): {
  appId: string | null;
  configId: string | null;
  configured: boolean;
} {
  return {
    appId: metaConnectEnv.appId ?? null,
    configId: metaConnectEnv.embeddedSignupConfigId ?? null,
    configured: Boolean(metaConnectEnv.appId && metaConnectEnv.embeddedSignupConfigId)
  };
}

/** Local/staging only — both the flag and the missing-credit-line skip are inert in production (spec §12 P2h-e). */
export function isMockCreditAttachSkipped(): boolean {
  if (env.NODE_ENV === 'production') {
    return false;
  }
  return metaConnectEnv.skipCreditAttach || !metaConnectEnv.extendedCreditLineId;
}

async function assertPhoneNotOwnedByOtherVendor(
  phoneNumberId: string,
  vendorId: string
): Promise<void> {
  const existing = await prisma.whatsAppNumber.findUnique({ where: { phoneNumberId } });
  if (existing && existing.vendorId !== vendorId) {
    throw createError(
      vendorMessageForCode('phone_number_taken'),
      409,
      ErrorType.BUSINESS_LOGIC,
      undefined,
      { error: 'phone_number_taken', code: 'phone_number_taken' }
    );
  }
}

async function assertSingleActiveConnect(vendorId: string, phoneNumberId: string): Promise<void> {
  const others = await prisma.whatsAppNumber.findMany({
    where: {
      vendorId,
      phoneNumberId: { not: phoneNumberId },
      connectStatus: { in: ACTIVE_CONNECT_STATUSES }
    }
  });
  if (others.length > 0) {
    throw createError(
      'You already have another WhatsApp number connecting. Finish or remove it first.',
      409,
      ErrorType.BUSINESS_LOGIC,
      undefined,
      { code: 'active_connect_exists' }
    );
  }
}

async function findTestInboundAt(
  vendorId: string,
  connectedAt: Date | null
): Promise<Date | null> {
  if (!connectedAt) return null;
  const row = await prisma.message.findFirst({
    where: {
      senderType: 'customer',
      timestamp: { gte: connectedAt },
      conversation: { vendorId }
    },
    orderBy: { timestamp: 'asc' },
    select: { timestamp: true }
  });
  return row?.timestamp ?? null;
}

async function maybePromoteToLive(rowId: string): Promise<void> {
  const row = await prisma.whatsAppNumber.findUnique({ where: { id: rowId } });
  if (!row || row.connectStatus !== 'credit_attached') {
    return;
  }

  // Spec §12 P2h-e: the dev skip flag may never produce a live number in
  // production — there a real primary_funding_id from the credit attach is the
  // only thing that counts.
  const attachOk =
    env.NODE_ENV === 'production'
      ? Boolean(row.primaryFundingId)
      : Boolean(row.primaryFundingId) || isMockCreditAttachSkipped();
  if (!attachOk) {
    return;
  }

  const wallet = await canProcessMessage(row.vendorId, 'text', {
    assistantTurnWorstCaseMedia: true
  });
  if (!wallet.allowed) {
    return;
  }

  const testInboundAt = await findTestInboundAt(row.vendorId, row.connectedAt);
  if (!testInboundAt) {
    return;
  }

  await prisma.whatsAppNumber.update({
    where: { id: rowId },
    data: {
      connectStatus: 'live',
      liveAt: new Date()
    }
  });
}

function toStatusResponse(
  row: Awaited<ReturnType<typeof loadPrimaryRow>>,
  extras: {
    testInboundAt: Date | null;
    walletCanReply: boolean;
    walletBlockReason: string | null;
  }
): WhatsAppStatusResponse {
  if (!row) {
    return {
      connectStatus: 'not_started',
      connectPath: null,
      phoneNumberId: null,
      displayPhone: null,
      displayName: null,
      waMeLink: null,
      mockAttachSkipped: isMockCreditAttachSkipped(),
      testInboundAt: null,
      walletCanReply: extras.walletCanReply,
      walletBlockReason: extras.walletBlockReason,
      lastErrorCode: null,
      lastErrorMessage: null,
      connectedAt: null,
      liveAt: null
    };
  }

  return {
    connectStatus: (row.connectStatus as WhatsAppConnectStatus) ?? 'not_started',
    connectPath: (row.connectPath as WhatsAppConnectPath) ?? null,
    phoneNumberId: row.phoneNumberId,
    displayPhone: row.displayPhone,
    displayName: row.displayName,
    waMeLink: buildWaMeLink(row.displayPhone),
    mockAttachSkipped: isMockCreditAttachSkipped(),
    testInboundAt: extras.testInboundAt?.toISOString() ?? null,
    walletCanReply: extras.walletCanReply,
    walletBlockReason: extras.walletBlockReason,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    connectedAt: row.connectedAt?.toISOString() ?? null,
    liveAt: row.liveAt?.toISOString() ?? null
  };
}

async function loadPrimaryRow(vendorId: string) {
  return prisma.whatsAppNumber.findFirst({
    where: {
      vendorId,
      OR: [
        { connectStatus: { in: ACTIVE_CONNECT_STATUSES } },
        { connectStatus: 'error' },
        { connectStatus: 'disconnected' }
      ]
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getWhatsAppConnectStatus(vendorId: string): Promise<WhatsAppStatusResponse> {
  await assertVendorApprovedForWhatsApp(vendorId);
  let row = await loadPrimaryRow(vendorId);
  if (row?.connectStatus === 'credit_attached') {
    await maybePromoteToLive(row.id);
    row = await loadPrimaryRow(vendorId);
  }

  const wallet = await canProcessMessage(vendorId, 'text', {
    assistantTurnWorstCaseMedia: true
  });
  const testInboundAt = row
    ? await findTestInboundAt(vendorId, row.connectedAt)
    : null;

  return toStatusResponse(row, {
    testInboundAt,
    walletCanReply: wallet.allowed,
    walletBlockReason: wallet.allowed ? null : (wallet.reason ?? 'insufficient_balance')
  });
}

async function runCreditAttach(wabaId: string): Promise<{
  primaryFundingId: string | null;
  skipped: boolean;
}> {
  if (isMockCreditAttachSkipped()) {
    return { primaryFundingId: null, skipped: true };
  }

  if (metaConnectEnv.extendedCreditLineId && metaConnectEnv.systemUserToken) {
    const attach = await attachExtendedCreditLine(wabaId);
    if (!attach.ok) {
      const mapped = mapGraphFailure(attach);
      throw createError(mapped.message, 422, ErrorType.VALIDATION, undefined, {
        code: 'credit_attach_failed',
        lastErrorCode: mapped.code
      });
    }
    const funding = await fetchWabaPrimaryFundingId(
      wabaId,
      metaConnectEnv.systemUserToken
    );
    if (!funding.ok) {
      const mapped = mapGraphFailure(funding);
      throw createError(mapped.message, 422, ErrorType.VALIDATION, undefined, {
        code: 'credit_attach_failed',
        lastErrorCode: mapped.code
      });
    }
    return { primaryFundingId: funding.data.primary_funding_id ?? null, skipped: false };
  }

  throw createError(
    vendorMessageForCode('credit_attach_failed'),
    422,
    ErrorType.VALIDATION,
    undefined,
    { code: 'credit_attach_failed', lastErrorCode: 'credit_attach_not_configured' }
  );
}

export async function completeWhatsAppConnect(
  vendorId: string,
  input: CompleteConnectInput
): Promise<WhatsAppStatusResponse> {
  await assertVendorApprovedForWhatsApp(vendorId);
  await assertPhoneNotOwnedByOtherVendor(input.phoneNumberId, vendorId);
  await assertSingleActiveConnect(vendorId, input.phoneNumberId);

  const existing = await prisma.whatsAppNumber.findUnique({
    where: { phoneNumberId: input.phoneNumberId }
  });
  if (
    existing &&
    existing.vendorId === vendorId &&
    existing.accessTokenEncrypted &&
    (existing.connectStatus === 'credit_attached' || existing.connectStatus === 'live')
  ) {
    return getWhatsAppConnectStatus(vendorId);
  }

  let row = await prisma.whatsAppNumber.upsert({
    where: { phoneNumberId: input.phoneNumberId },
    create: {
      vendorId,
      phoneNumberId: input.phoneNumberId,
      wabaId: input.wabaId,
      connectStatus: 'meta_in_progress',
      connectPath: input.connectPath,
      metaBusinessId: input.businessId ?? null,
      lastErrorCode: null,
      lastErrorMessage: null
    },
    update: {
      wabaId: input.wabaId,
      connectStatus: 'meta_in_progress',
      connectPath: input.connectPath,
      metaBusinessId: input.businessId ?? undefined,
      lastErrorCode: null,
      lastErrorMessage: null
    }
  });

  try {
    const tokenRes = await exchangeEmbeddedSignupCode(input.code);
    if (!tokenRes.ok) {
      const mapped = mapGraphFailure(tokenRes);
      throw createError(mapped.message, 422, ErrorType.VALIDATION, undefined, {
        code: mapped.code
      });
    }
    const businessToken = tokenRes.data.access_token;
    if (!businessToken) {
      throw createError(
        vendorMessageForCode('graph_error'),
        422,
        ErrorType.VALIDATION,
        undefined,
        { code: 'graph_error' }
      );
    }

    const profile = await fetchPhoneNumberProfile(input.phoneNumberId, businessToken);
    if (!profile.ok) {
      const mapped = mapGraphFailure(profile);
      throw createError(mapped.message, 422, ErrorType.VALIDATION, undefined, {
        code: mapped.code
      });
    }

    if (input.connectPath === 'cloud') {
      const reg = await registerCloudPhoneNumber(input.phoneNumberId, businessToken);
      if (!reg.ok) {
        const mapped = mapGraphFailure(reg);
        throw createError(mapped.message, 422, ErrorType.VALIDATION, undefined, {
          code: mapped.code
        });
      }
    }

    const sub = await subscribeAppToWaba(input.wabaId, businessToken);
    if (!sub.ok) {
      const mapped = mapGraphFailure(sub);
      throw createError(mapped.message, 422, ErrorType.VALIDATION, undefined, {
        code: mapped.code
      });
    }

    const tokenExpiresAt =
      tokenRes.data.expires_in != null
        ? new Date(Date.now() + tokenRes.data.expires_in * 1000)
        : null;

    row = await prisma.whatsAppNumber.update({
      where: { id: row.id },
      data: {
        accessTokenEncrypted: encryptWhatsAppToken(businessToken),
        tokenExpiresAt,
        displayPhone: profile.data.display_phone_number ?? null,
        displayName: profile.data.verified_name ?? null,
        connectedAt: new Date(),
        connectStatus: 'meta_in_progress'
      }
    });

    const attach = await runCreditAttach(input.wabaId);
    row = await prisma.whatsAppNumber.update({
      where: { id: row.id },
      data: {
        connectStatus: 'credit_attached',
        primaryFundingId: attach.primaryFundingId
      }
    });

    await maybePromoteToLive(row.id);
    return getWhatsAppConnectStatus(vendorId);
  } catch (err) {
    const code =
      typeof err === 'object' &&
      err &&
      'details' in err &&
      typeof (err as { details?: { code?: string } }).details?.code === 'string'
        ? (err as { details: { code: string } }).details.code
        : 'graph_error';
    const message =
      err instanceof Error ? err.message : vendorMessageForCode('graph_error');

    await prisma.whatsAppNumber.update({
      where: { id: row.id },
      data: {
        connectStatus: 'error',
        lastErrorCode: code,
        lastErrorMessage: message
      }
    });

    logger.error(
      { err, vendorId, phoneNumberId: input.phoneNumberId, code },
      'WhatsApp complete-connect failed'
    );
    throw err;
  }
}

export async function retryWhatsAppCreditAttach(vendorId: string): Promise<WhatsAppStatusResponse> {
  await assertVendorApprovedForWhatsApp(vendorId);
  const row = await loadPrimaryRow(vendorId);
  if (!row || !row.wabaId) {
    throw createError('No WhatsApp number to attach billing to.', 404, ErrorType.NOT_FOUND);
  }
  if (!row.accessTokenEncrypted) {
    throw createError('Connect your number first.', 422, ErrorType.VALIDATION);
  }

  try {
    const attach = await runCreditAttach(row.wabaId);
    await prisma.whatsAppNumber.update({
      where: { id: row.id },
      data: {
        connectStatus: 'credit_attached',
        primaryFundingId: attach.primaryFundingId,
        lastErrorCode: null,
        lastErrorMessage: null
      }
    });
    await maybePromoteToLive(row.id);
    return getWhatsAppConnectStatus(vendorId);
  } catch (err) {
    const mapped = mapGraphFailure({ status: 422, graphMessage: err instanceof Error ? err.message : '' });
    await prisma.whatsAppNumber.update({
      where: { id: row.id },
      data: {
        connectStatus: 'error',
        lastErrorCode: 'credit_attach_failed',
        lastErrorMessage: mapped.message
      }
    });
    throw err;
  }
}

/** Exported for unit tests */
export { findTestInboundAt, maybePromoteToLive };
