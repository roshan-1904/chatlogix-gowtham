import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, envState, metaEnvState, canProcessMessageMock } = vi.hoisted(() => ({
  prismaMock: {
    vendor: { findUnique: vi.fn() },
    whatsAppNumber: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn()
    },
    message: { findFirst: vi.fn() }
  },
  envState: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    WHATSAPP_TOKEN_ENCRYPTION_KEY:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  },
  metaEnvState: {
    appId: 'app-1',
    appSecret: 'secret',
    embeddedSignupConfigId: 'cfg-1',
    systemUserToken: 'sys-token',
    extendedCreditLineId: 'credit-line-1' as string | undefined,
    skipCreditAttach: false,
    graphBaseUrl: 'https://graph.test/v18.0'
  },
  canProcessMessageMock: vi.fn()
}));

vi.mock('../../../db/prisma.js', () => ({ prisma: prismaMock }));

vi.mock('../../../config/env.js', () => ({
  env: envState,
  metaConnectEnv: metaEnvState
}));

vi.mock('../../../utils/whatsappTokenCrypto.js', () => ({
  encryptWhatsAppToken: vi.fn((t: string) => `enc:${t}`)
}));

vi.mock('../../billingService.js', () => ({
  canProcessMessage: canProcessMessageMock
}));

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const { graphMocks } = vi.hoisted(() => ({
  graphMocks: {
    exchangeEmbeddedSignupCode: vi.fn(),
    fetchPhoneNumberProfile: vi.fn(),
    registerCloudPhoneNumber: vi.fn(),
    subscribeAppToWaba: vi.fn(),
    attachExtendedCreditLine: vi.fn(),
    fetchWabaPrimaryFundingId: vi.fn()
  }
}));

vi.mock('../whatsappConnectGraph.js', () => ({
  exchangeEmbeddedSignupCode: graphMocks.exchangeEmbeddedSignupCode,
  fetchPhoneNumberProfile: graphMocks.fetchPhoneNumberProfile,
  registerCloudPhoneNumber: graphMocks.registerCloudPhoneNumber,
  subscribeAppToWaba: graphMocks.subscribeAppToWaba,
  attachExtendedCreditLine: graphMocks.attachExtendedCreditLine,
  fetchWabaPrimaryFundingId: graphMocks.fetchWabaPrimaryFundingId,
  graphFetch: vi.fn()
}));

import {
  assertVendorApprovedForWhatsApp,
  completeWhatsAppConnect,
  isMockCreditAttachSkipped,
  maybePromoteToLive
} from '../whatsappConnectService.js';

describe('whatsappConnectService', () => {
  function seedDefaultMocks() {
    prismaMock.vendor.findUnique.mockResolvedValue({
      id: 'v1',
      registrationStatus: 'approved'
    });
    prismaMock.whatsAppNumber.findUnique.mockResolvedValue(null);
    prismaMock.whatsAppNumber.findMany.mockResolvedValue([]);
    prismaMock.whatsAppNumber.findFirst.mockResolvedValue(null);
    prismaMock.message.findFirst.mockResolvedValue(null);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    seedDefaultMocks();
    envState.NODE_ENV = 'test';
    metaEnvState.extendedCreditLineId = 'credit-line-1';
    metaEnvState.skipCreditAttach = false;
    canProcessMessageMock.mockResolvedValue({ allowed: true });

    graphMocks.exchangeEmbeddedSignupCode.mockResolvedValue({
      ok: true,
      data: { access_token: 'biz-token', expires_in: 3600 }
    });
    graphMocks.fetchPhoneNumberProfile.mockResolvedValue({
      ok: true,
      data: { display_phone_number: '+919876543210', verified_name: 'Test Shop' }
    });
    graphMocks.registerCloudPhoneNumber.mockResolvedValue({ ok: true, data: { success: true } });
    graphMocks.subscribeAppToWaba.mockResolvedValue({ ok: true, data: { success: true } });
    graphMocks.attachExtendedCreditLine.mockResolvedValue({ ok: true, data: {} });
    graphMocks.fetchWabaPrimaryFundingId.mockResolvedValue({
      ok: true,
      data: { primary_funding_id: 'fund-1' }
    });
  });

  it('rejects non-approved vendors with 403', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({
      id: 'v1',
      registrationStatus: 'pending_approval'
    });
    await expect(assertVendorApprovedForWhatsApp('v1')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns 409 when phoneNumberId belongs to another vendor', async () => {
    prismaMock.whatsAppNumber.findUnique.mockResolvedValue({
      vendorId: 'other',
      phoneNumberId: 'pn-1'
    });
    await expect(
      completeWhatsAppConnect('v1', {
        code: 'c',
        wabaId: 'waba',
        phoneNumberId: 'pn-1',
        connectPath: 'cloud'
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('happy path upserts row and reaches credit_attached', async () => {
    const row = {
      id: 'row-1',
      vendorId: 'v1',
      phoneNumberId: 'pn-1',
      wabaId: 'waba-1',
      connectStatus: 'meta_in_progress',
      connectedAt: null
    };
    prismaMock.whatsAppNumber.upsert.mockResolvedValue(row);
    prismaMock.whatsAppNumber.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...row,
      ...data
    }));
    prismaMock.whatsAppNumber.findFirst.mockResolvedValue({
      ...row,
      connectStatus: 'credit_attached',
      displayPhone: '+919876543210',
      connectedAt: new Date()
    });

    const result = await completeWhatsAppConnect('v1', {
      code: 'auth-code',
      wabaId: 'waba-1',
      phoneNumberId: 'pn-1',
      connectPath: 'cloud'
    });

    expect(graphMocks.exchangeEmbeddedSignupCode).toHaveBeenCalledWith('auth-code');
    expect(graphMocks.subscribeAppToWaba).toHaveBeenCalledWith('waba-1', 'biz-token');
    expect(graphMocks.attachExtendedCreditLine).toHaveBeenCalled();
    expect(result.connectStatus).toBe('credit_attached');
    expect(isMockCreditAttachSkipped()).toBe(false);
  });

  it('idempotent when same vendor already credit_attached', async () => {
    prismaMock.whatsAppNumber.findUnique.mockResolvedValue({
      id: 'row-1',
      vendorId: 'v1',
      phoneNumberId: 'pn-1',
      accessTokenEncrypted: 'enc:token',
      connectStatus: 'credit_attached'
    });
    prismaMock.whatsAppNumber.findFirst.mockResolvedValue({
      id: 'row-1',
      vendorId: 'v1',
      phoneNumberId: 'pn-1',
      connectStatus: 'credit_attached',
      displayPhone: '+919876543210',
      connectedAt: new Date()
    });

    await completeWhatsAppConnect('v1', {
      code: 'c',
      wabaId: 'waba',
      phoneNumberId: 'pn-1',
      connectPath: 'cloud'
    });

    expect(graphMocks.exchangeEmbeddedSignupCode).not.toHaveBeenCalled();
  });

  it('connects with a ₹0 wallet but does not report live (spec §16.4)', async () => {
    canProcessMessageMock.mockResolvedValue({ allowed: false, reason: 'insufficient_balance' });
    const row = {
      id: 'row-1',
      vendorId: 'v1',
      phoneNumberId: 'pn-1',
      wabaId: 'waba-1',
      connectStatus: 'meta_in_progress',
      connectedAt: null
    };
    prismaMock.whatsAppNumber.upsert.mockResolvedValue(row);
    prismaMock.whatsAppNumber.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...row,
      ...data
    }));
    prismaMock.whatsAppNumber.findFirst.mockResolvedValue({
      ...row,
      connectStatus: 'credit_attached',
      primaryFundingId: 'fund-1',
      connectedAt: new Date()
    });

    const result = await completeWhatsAppConnect('v1', {
      code: 'auth-code',
      wabaId: 'waba-1',
      phoneNumberId: 'pn-1',
      connectPath: 'cloud'
    });

    expect(result.connectStatus).toBe('credit_attached');
    expect(result.walletCanReply).toBe(false);
    expect(result.walletBlockReason).toBe('insufficient_balance');
  });

  it('skip flag cannot mark a production number live (spec §16.11)', async () => {
    envState.NODE_ENV = 'production';
    metaEnvState.extendedCreditLineId = undefined;
    metaEnvState.skipCreditAttach = true;

    expect(isMockCreditAttachSkipped()).toBe(false);

    prismaMock.whatsAppNumber.findUnique.mockResolvedValue({
      id: 'row-1',
      vendorId: 'v1',
      phoneNumberId: 'pn-1',
      connectStatus: 'credit_attached',
      primaryFundingId: null,
      connectedAt: new Date('2026-09-18T00:00:00.000Z')
    });
    prismaMock.message.findFirst.mockResolvedValue({ timestamp: new Date('2026-09-18T01:00:00.000Z') });

    await maybePromoteToLive('row-1');

    expect(prismaMock.whatsAppNumber.update).not.toHaveBeenCalled();
  });
});
