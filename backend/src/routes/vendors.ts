import express from 'express';
import { prisma } from '../db/prisma.js';
import { creditWalletFromTopUp, newAdminRechargeIdempotencyKey } from '../services/wallet/walletTopUpService.js';
import { requireRole, requireVendorAccess } from '../middleware/authorize.js';
import { createDatabaseError, asyncHandlerWithContext, createValidationError, ErrorType, ErrorSeverity } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { dashboardStatsRateLimit } from '../middleware/rateLimit.js';
import { getDashboardStats } from '../services/dashboardStatsService.js';
import type { DateRangePreset } from '../utils/dateRange.js';
import { sendPhoneVerificationCode, verifyPhoneChange } from '../services/settingsVerification.js';
import { sendEmailVerificationCode, verifyEmailChange } from '../services/emailVerification.js';
import { vendorOnboardingRouter } from './vendorOnboarding.js';
import {
  phoneVerificationSendSchema,
  phoneVerificationConfirmSchema,
  emailVerificationSendSchema,
  emailVerificationConfirmSchema,
  businessInfoSchema,
  aiConfigSchema,
  orderSettingsSchema,
  notificationSettingsSchema,
  matchingConfigSchema,
  timezoneSchema,
} from '../utils/validation/settingsSchemas.js';
import { settingsRateLimit } from '../middleware/settingsRateLimit.js';
import { buildAIPromptsUpdate } from '../services/vendorAIConfigService.js';
import { shapeMessageMedia } from './conversations.js';
import { invalidateVendorFlagCache } from '../config/featureFlags.js';
import { TURN_AUDIT_FLAG } from '../observability/turnAuditLog.js';
import { logger } from '../logger.js';
import {
  clearLinkedAccountOptIn,
  getLinkedAccountStatus,
  submitLinkedAccountOptIn
} from '../services/payments/linkedAccountService.js';
import { bigintToDecimalString } from '../utils/bigIntJson.js';
import { getVendorSettlementOverview } from '../services/payments/settlementService.js';
import {
  confirmSettlementBankChange,
  requestSettlementBankChangeOtp
} from '../services/payments/settlementBankChangeService.js';
import {
  freezeVendorReleases,
  getAdminSettlementView,
  setVendorRollingReserveBps,
  unfreezeVendorReleases
} from '../services/payments/settlementControlService.js';
import { patchVendorBillingConfig } from '../services/payments/vendorBillingConfigService.js';
import {
  disableCollectionPreservingLedger,
  offboardVendor
} from '../services/payments/vendorOffboardingService.js';
import {
  getPlatformFeeInvoicePdfForVendor,
  issuePlatformFeeInvoiceForVendor,
  listVendorPlatformFeeInvoices,
  requestPlatformFeeCreditNote
} from '../services/payments/platformFeeInvoiceService.js';
import {
  getVendorSettlementStatement,
  getVendorSettlementStatementCsv
} from '../services/payments/settlementStatementService.js';

export const vendorsRouter = express.Router();

vendorsRouter.use(vendorOnboardingRouter);

// Helper function to handle Prisma errors consistently
function handlePrismaError(error: any, operation: string, table: string, next: express.NextFunction) {
  const isConnectionError = error?.code === 'P1001' || 
                            error?.name === 'PrismaClientInitializationError' ||
                            error?.message?.includes("Can't reach database server") ||
                            error?.message?.includes('ECONNREFUSED') ||
                            error?.message?.includes('ETIMEDOUT');
  
  if (isConnectionError) {
    const dbError = createDatabaseError(
      'Database connection unavailable. Please check your database connection settings.',
      operation,
      table
    );
    dbError.statusCode = 503; // Service Unavailable
    return next(dbError);
  }
  
  // For other database errors, pass to error handler
  const dbError = createDatabaseError(
    error?.message || 'Database operation failed',
    operation,
    table
  );
  return next(dbError);
}

const vendorListSelect = {
  id: true,
  businessName: true,
  phone: true,
  email: true,
  subscriptionPlan: true,
  subscriptionStatus: true,
  walletBalanceMilli: true,
  markupPercent: true,
  createdAt: true
};

// GET /api/vendors - List vendors (admin -> all, vendor -> own)
vendorsRouter.get('/', requireRole('admin', 'vendor'), async (req, res) => {
  try {
    const isAdmin = req.user?.roles?.includes('admin');

    if (isAdmin) {
      const vendors = await prisma.vendor.findMany({
        select: vendorListSelect
      });
      return res.json(vendors);
    }

    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(403).json({ error: 'vendor_context_missing' });
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: vendorListSelect
    });

    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    return res.json([vendor]);
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

vendorsRouter.post('/register', requireRole('admin'), async (req, res) => {
  const { businessName, phone, email, subscriptionPlan } = req.body || {};
  if (!businessName || !phone || !email) return res.status(400).json({ error: 'missing_fields' });
  const vendor = await prisma.vendor.create({
    data: {
      businessName,
      phone,
      email,
      subscriptionPlan: subscriptionPlan || 'Starter',
      walletBalanceMilli: 0
    },
    select: {
      id: true,
      businessName: true,
      phone: true,
      email: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
      walletBalanceMilli: true,
      settlementBalanceMilli: true,
      paymentsManagedByChatlogix: true,
      paymentFeeBps: true,
      registrationStatus: true,
      createdAt: true
    }
  });
  res.json({
    ...vendor,
    settlementBalanceMilli: vendor.settlementBalanceMilli.toString()
  });
});

vendorsRouter.get('/:id/usage-analytics', requireVendorAccess(req => req.params.id), async (req, res, next) => {
  try {
    const vendorId = req.params.id;
    const total = await prisma.creditUsage.aggregate({
      where: { vendorId },
      _sum: { chargedMilli: true }
    });
    res.json({ vendorId, chargedMilli: total._sum.chargedMilli || 0 });
  } catch (error: any) {
    return handlePrismaError(error, 'aggregate', 'CreditUsage', next);
  }
});

vendorsRouter.get('/:id/config', requireVendorAccess(req => req.params.id), async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.findUnique({ 
      where: { id: req.params.id },
      select: {
        id: true,
        businessName: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        walletBalanceMilli: true,
        markupPercent: true,
        paymentFeeBps: true,
        paymentsManagedByChatlogix: true,
        paymentLinkAutoSend: true,
        aiBotName: true,
        aiPersonality: true,
        aiSystemPrompt: true,
        aiGreeting: true,
        aiClosing: true,
        aiPreparationTimeMinutes: true,
        aiDeliveryInstructions: true,
        aiPickupDeliveryAddress: true,
        aiToneExample: true,
        category: true,
        catalogImportEnabled: true
      }
    });
    if (!vendor) return res.status(404).json({ error: 'not_found' });
    res.json({
      id: vendor.id,
      businessName: vendor.businessName,
      plan: vendor.subscriptionPlan,
      status: vendor.subscriptionStatus,
      walletBalanceMilli: vendor.walletBalanceMilli,
      markupPercent: vendor.markupPercent,
      paymentFeeBps: vendor.paymentFeeBps,
      paymentsManagedByChatlogix: vendor.paymentsManagedByChatlogix,
      paymentLinkAutoSend: vendor.paymentLinkAutoSend,
      category: vendor.category ?? null,
      catalogImportEnabled: !!vendor.catalogImportEnabled,
      ai: {
        botName: vendor.aiBotName,
        personality: vendor.aiPersonality,
        systemPrompt: vendor.aiSystemPrompt,
        greeting: vendor.aiGreeting,
        closing: vendor.aiClosing,
        preparationTimeMinutes: vendor.aiPreparationTimeMinutes || null,
        deliveryInstructions: vendor.aiDeliveryInstructions,
        pickupDeliveryAddress: vendor.aiPickupDeliveryAddress,
        toneExample: vendor.aiToneExample
      }
    });
  } catch (error: any) {
    return handlePrismaError(error, 'findUnique', 'Vendor', next);
  }
});

// Update vendor AI prompts/config
vendorsRouter.put('/:id/ai-prompts', requireVendorAccess(req => req.params.id), settingsRateLimit, async (req, res) => {
  const vendorId = req.params.id;
  const data = buildAIPromptsUpdate(req.body || {});
  const vendor = await prisma.vendor.update({ where: { id: vendorId }, data });
  res.json({ ok: true, id: vendor.id });
});

vendorsRouter.post('/:id/recharge-wallet', requireRole('admin'), async (req, res) => {
  const vendorId = req.params.id;
  const amount = Number(req.body?.amount || 0);
  // Millirupees are stored as Int, and creditWalletFromTopUp rejects non-integers.
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'invalid_amount' });
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) return res.status(404).json({ error: 'not_found' });

  const idempotencyKey =
    typeof req.body?.idempotencyKey === 'string' && req.body.idempotencyKey.length > 0
      ? req.body.idempotencyKey
      : newAdminRechargeIdempotencyKey();

  const credit = await creditWalletFromTopUp({
    vendorId,
    amountMilli: amount,
    idempotencyKey,
    metadata: {
      source: 'admin_recharge',
      provider: 'admin',
      idempotencyKey,
      amountMilli: amount,
      currency: 'INR',
      adminUserId: req.user?.id
    }
  });

  res.json({ vendorId, walletBalanceMilli: credit.balanceAfterMilli, idempotent: credit.idempotent });
});

// Bookkeeping only: subscriptionPlan no longer affects billing (no monthly quota).
vendorsRouter.post('/:id/upgrade-plan', requireRole('admin'), async (req, res) => {
  const vendorId = req.params.id;
  const plan = req.body?.plan as string;
  const allowed = ['Starter', 'Pro', 'Business', 'Enterprise'];
  if (!allowed.includes(plan)) return res.status(400).json({ error: 'invalid_plan' });
  const vendor = await prisma.vendor.update({ where: { id: vendorId }, data: { subscriptionPlan: plan } });
  res.json({ id: vendor.id, plan: vendor.subscriptionPlan });
});

const billingConfigSchema = z
  .object({
    markupPercent: z.number().int().min(0).max(500).optional(),
    paymentFeeBps: z.number().int().min(0).max(2000).optional()
  })
  .refine((body) => body.markupPercent !== undefined || body.paymentFeeBps !== undefined, {
    message: 'At least one of markupPercent or paymentFeeBps is required'
  });

const vendorFeatureFlagsResponseSchema = z.object({
  conversation_turn_audit: z.boolean()
});

const vendorFeatureFlagsPatchSchema = z
  .object({
    conversation_turn_audit: z.boolean().optional()
  })
  .strict()
  .refine((body) => body.conversation_turn_audit !== undefined, {
    message: 'At least one known feature flag must be provided'
  });

function readConversationTurnAudit(flags: unknown): boolean {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return false;
  return (flags as Record<string, unknown>).conversation_turn_audit === true;
}

// GET /api/vendors/:id/feature-flags — admin-only turn-audit toggle (not exposed on vendor config)
vendorsRouter.get('/:id/feature-flags', requireRole('admin'), async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: req.params.id },
      select: { featureFlags: true }
    });
    if (!vendor) {
      return res.status(404).json({ error: 'not_found' });
    }
    const body = vendorFeatureFlagsResponseSchema.parse({
      conversation_turn_audit: readConversationTurnAudit(vendor.featureFlags)
    });
    return res.json(body);
  } catch (error) {
    return handlePrismaError(error, 'read', 'Vendor', next);
  }
});

// PATCH /api/vendors/:id/feature-flags — merge into Vendor.featureFlags JSON
vendorsRouter.patch('/:id/feature-flags', requireRole('admin'), async (req, res, next) => {
  const parsed = vendorFeatureFlagsPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_feature_flags',
      details: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
    });
  }

  try {
    const existing = await prisma.vendor.findUnique({
      where: { id: req.params.id },
      select: { featureFlags: true }
    });
    if (!existing) {
      return res.status(404).json({ error: 'not_found' });
    }

    const prior =
      existing.featureFlags && typeof existing.featureFlags === 'object' && !Array.isArray(existing.featureFlags)
        ? (existing.featureFlags as Record<string, boolean>)
        : {};

    const merged = { ...prior, ...parsed.data };

    const vendor = await prisma.vendor.update({
      where: { id: req.params.id },
      data: { featureFlags: merged },
      select: { featureFlags: true }
    });

    logger.info(
      {
        adminUserId: req.user?.id,
        vendorId: req.params.id,
        patch: parsed.data
      },
      'admin updated vendor feature flags'
    );

    if (parsed.data.conversation_turn_audit !== undefined) {
      invalidateVendorFlagCache(req.params.id, TURN_AUDIT_FLAG);
    }

    const body = vendorFeatureFlagsResponseSchema.parse({
      conversation_turn_audit: readConversationTurnAudit(vendor.featureFlags)
    });
    return res.json(body);
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'not_found' });
    }
    return handlePrismaError(error, 'update', 'Vendor', next);
  }
});

// PATCH /api/vendors/:id/billing-config - Admin-editable markup + order payment fee
vendorsRouter.patch('/:id/billing-config', requireRole('admin'), async (req, res, next) => {
  const parsed = billingConfigSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_billing_config',
      details: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
    });
  }

  try {
    const vendor = await patchVendorBillingConfig({
      vendorId: req.params.id,
      changedBy: req.user?.id ?? 'admin',
      markupPercent: parsed.data.markupPercent,
      paymentFeeBps: parsed.data.paymentFeeBps
    });
    return res.json(vendor);
  } catch (error: any) {
    if (error?.statusCode === 404) {
      return res.status(404).json({ error: 'not_found' });
    }
    return handlePrismaError(error, 'update', 'Vendor', next);
  }
});

const walletTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

// GET /api/vendors/:id/wallet-transactions - Recent wallet ledger for the admin vendor detail panel
vendorsRouter.get('/:id/wallet-transactions', requireRole('admin'), async (req, res, next) => {
  const parsed = walletTransactionsQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_query',
      details: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
    });
  }

  try {
    const transactions = await prisma.walletTransaction.findMany({
      where: { vendorId: req.params.id },
      orderBy: { transactionDate: 'desc' },
      take: parsed.data.limit,
      select: {
        id: true,
        transactionType: true,
        amountMilli: true,
        balanceAfterMilli: true,
        transactionDate: true,
        metadata: true
      }
    });

    return res.json({
      transactions: transactions.map((tx) => {
        const metadata =
          tx.metadata && typeof tx.metadata === 'object' && !Array.isArray(tx.metadata)
            ? (tx.metadata as Record<string, unknown>)
            : undefined;

        return {
          id: tx.id,
          transactionType: tx.transactionType,
          amountMilli: tx.amountMilli,
          balanceAfterMilli: tx.balanceAfterMilli,
          transactionDate: tx.transactionDate.toISOString(),
          ...(metadata ? { metadata } : {})
        };
      })
    });
  } catch (error: any) {
    return handlePrismaError(error, 'findMany', 'WalletTransaction', next);
  }
});

async function getVendorConversationsWithMeta(options: {
  vendorId: string;
  page: number;
  limit: number;
  searchQuery?: string;
}) {
  const { vendorId, page, limit, searchQuery } = options;

  const where: any = {
    vendorId,
    messages: {
      some: {},
    },
  };

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    where.OR = [
      {
        customer: {
          phone: {
            contains: q,
            mode: 'insensitive',
          },
        },
      },
      {
        customer: {
          customerInsights: {
            some: {
              vendorId,
              customerName: {
                contains: q,
                mode: 'insensitive',
              },
            },
          },
        },
      },
    ];
  }

  const total = await prisma.conversation.count({ where });

  const conversations = await prisma.conversation.findMany({
    where,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { updatedAt: 'desc' },
    include: {
      customer: true,
      messages: {
        orderBy: { timestamp: 'desc' },
        take: 1,
        select: {
          id: true,
          content: true,
          contentEn: true,
          timestamp: true,
          senderType: true,
          type: true,
          media: true,
        },
      },
      orders: {
        select: {
          id: true,
          status: true,
          totalAmount: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          messages: true,
        },
      },
    },
  });

  const customerIds = conversations.map((c) => c.customerId);
  const insightNames = await prisma.customerInsights.findMany({
    where: {
      vendorId,
      customerId: { in: customerIds },
    },
    select: {
      customerId: true,
      customerName: true,
    },
  });

  const nameMap = new Map<string, string | null>();
  for (const row of insightNames) {
    nameMap.set(row.customerId, row.customerName || null);
  }

  const now = Date.now();

  const conversationsWithMeta = conversations.map((conv) => {
    const lastRaw = conv.messages[0] || null;
    const lastMessage = lastRaw
      ? {
          id: lastRaw.id,
          content: lastRaw.content,
          contentEn: lastRaw.contentEn,
          timestamp: lastRaw.timestamp,
          senderType: lastRaw.senderType,
          type: lastRaw.type,
          media: shapeMessageMedia(lastRaw.id, lastRaw.media),
        }
      : null;
    const orders = conv.orders || [];

    const orderCount = orders.length;
    const totalSpent = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const activeOrders = orders.filter(
      (o) => o.status !== 'delivered' && o.status !== 'cancelled',
    );
    const hasActiveOrder = activeOrders.length > 0;
    const activeOrderStatus =
      hasActiveOrder ? activeOrders[activeOrders.length - 1].status : null;

    const minutesSinceLastMessage = lastMessage
      ? Math.floor((now - new Date(lastMessage.timestamp).getTime()) / 60000)
      : null;

    return {
      id: conv.id,
      vendorId: conv.vendorId,
      customerId: conv.customerId,
      status: conv.status,
      aiPaused: conv.aiPaused,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      customerName: nameMap.get(conv.customerId) || null,
      customer: {
        id: conv.customer.id,
        phone: conv.customer.phone,
      },
      _count: {
        messages: conv._count?.messages || 0,
      },
      lastMessage,
      orderCount,
      totalSpent,
      hasActiveOrder,
      activeOrderStatus,
      lastMessageSender: lastMessage?.senderType ?? null,
      minutesSinceLastMessage,
      // Add lastMessageTimestamp for sorting
      lastMessageTimestamp: lastMessage?.timestamp || conv.updatedAt,
    };
  });

  // Sort by minutesSinceLastMessage (ascending - most recent first)
  // This matches the Dashboard Recent Conversations widget sorting
  conversationsWithMeta.sort((a, b) => {
    // Handle null values - put conversations without messages at the end
    if (a.minutesSinceLastMessage === null && b.minutesSinceLastMessage === null) {
      return 0;
    }
    if (a.minutesSinceLastMessage === null) return 1; // a goes to end
    if (b.minutesSinceLastMessage === null) return -1; // b goes to end
    
    // Sort by minutesSinceLastMessage ascending (smaller = more recent = first)
    return a.minutesSinceLastMessage - b.minutesSinceLastMessage;
  });

  const hasMore = page * limit < total;

  return {
    conversations: conversationsWithMeta,
    total,
    page,
    hasMore,
  };
}

// GET /api/vendors/:id/conversations - List vendor conversations (with optional pagination)
vendorsRouter.get(
  '/:id/conversations',
  requireVendorAccess((req) => req.params.id),
  async (req, res, next) => {
    try {
      const vendorId = req.params.id;
      const page = Number.parseInt((req.query.page as string) || '0', 10) || 0;
      const limit = Number.parseInt((req.query.limit as string) || '50', 10) || 50;

      // Backwards-compatible behavior: if no page is specified, return an array like before
      if (!page) {
        const result = await getVendorConversationsWithMeta({
          vendorId,
          page: 1,
          limit,
        });
        return res.json(result.conversations);
      }

      const result = await getVendorConversationsWithMeta({
        vendorId,
        page,
        limit,
      });

      return res.json(result);
    } catch (error: any) {
      return handlePrismaError(error, 'findMany', 'Conversation', next);
    }
  },
);

// GET /api/vendors/:id/conversations/search - Search conversations by customer name or phone
vendorsRouter.get(
  '/:id/conversations/search',
  requireVendorAccess((req) => req.params.id),
  async (req, res, next) => {
    try {
      const vendorId = req.params.id;
      const searchQuery = (req.query.q as string) || '';
      const page = Number.parseInt((req.query.page as string) || '1', 10) || 1;
      const limit = Number.parseInt((req.query.limit as string) || '20', 10) || 20;

      if (!searchQuery.trim()) {
        return res.json({
          conversations: [],
          total: 0,
          page: 1,
          hasMore: false,
        });
      }

      const result = await getVendorConversationsWithMeta({
        vendorId,
        page,
        limit,
        searchQuery,
      });

      return res.json(result);
    } catch (error: any) {
      return handlePrismaError(error, 'findMany', 'Conversation', next);
    }
  },
);

// Map vendor to a WhatsApp phone_number_id
vendorsRouter.post('/:id/map-wa-number', requireRole('admin'), async (req, res) => {
  const vendorId = req.params.id;
  const phoneNumberId = req.body?.phoneNumberId as string;
  const wabaId = req.body?.wabaId as string;
  if (!phoneNumberId || !wabaId) return res.status(400).json({ error: 'missing_fields' });
  // Upsert mapping
  const wa = await prisma.whatsAppNumber.upsert({
    where: { phoneNumberId },
    update: { vendorId, wabaId },
    create: { vendorId, phoneNumberId, wabaId }
  });
  res.json(wa);
});

// GET /api/vendors/:id/ai-config - Get complete AI configuration
vendorsRouter.get('/:id/ai-config', requireVendorAccess(req => req.params.id), async (req, res) => {
  try {
    const vendorId = req.params.id;
    
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        businessName: true,
        aiBotName: true,
        aiPersonality: true,
        aiSystemPrompt: true,
        aiProducts: true,
        aiGreeting: true,
        aiClosing: true,
        aiPreparationTimeMinutes: true,
        aiDeliveryInstructions: true,
        aiPickupDeliveryAddress: true,
        aiToneExample: true,
        aiContentResponsibilities: true,
        aiContentConversationRules: true,
        aiContentImportantInstructions: true
      }
    });

    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    res.json({
      vendorId: vendor.id,
      businessName: vendor.businessName,
      ai: {
        botName: vendor.aiBotName,
        personality: vendor.aiPersonality,
        systemPrompt: vendor.aiSystemPrompt,
        products: vendor.aiProducts,
        greeting: vendor.aiGreeting,
        closing: vendor.aiClosing,
        preparationTimeMinutes: vendor.aiPreparationTimeMinutes,
        deliveryInstructions: vendor.aiDeliveryInstructions,
        pickupDeliveryAddress: vendor.aiPickupDeliveryAddress,
        toneExample: vendor.aiToneExample,
        contentResponsibilities: vendor.aiContentResponsibilities,
        contentConversationRules: vendor.aiContentConversationRules,
        contentImportantInstructions: vendor.aiContentImportantInstructions
      }
    });
  } catch (error) {
    console.error('Error fetching AI configuration:', error);
    res.status(500).json({ error: 'Failed to fetch AI configuration' });
  }
});

// GET /api/vendors/:id/order-settings - Get order settings
vendorsRouter.get('/:id/order-settings', requireVendorAccess(req => req.params.id), async (req, res) => {
  try {
    const vendorId = req.params.id;
    
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        category: true,
        askForPreferredDeliveryDate: true,
        orderPreparationConfig: true,
        orderPrefix: true,
        minimumOrderValue: true,
        aiPreparationTimeMinutes: true // For backward compatibility
      }
    });

    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    res.json({
      category: vendor.category,
      askForPreferredDeliveryDate: vendor.askForPreferredDeliveryDate ?? false,
      orderPreparationConfig: vendor.orderPreparationConfig,
      orderPrefix: vendor.orderPrefix,
      minimumOrderValue: vendor.minimumOrderValue,
      // Backward compatibility
      aiPreparationTimeMinutes: vendor.aiPreparationTimeMinutes
    });
  } catch (error) {
    console.error('Error fetching order settings:', error);
    res.status(500).json({ error: 'Failed to fetch order settings' });
  }
});

// PUT /api/vendors/:id/order-settings - Update order settings
vendorsRouter.put('/:id/order-settings', requireVendorAccess(req => req.params.id), settingsRateLimit, asyncHandlerWithContext(async (req: any, res: any) => {
  const vendorId = req.params.id;
  const validated = orderSettingsSchema.parse(req.body);

  // Validate orderPreparationConfig if provided
  if (validated.orderPreparationConfig) {
    const config = validated.orderPreparationConfig as any;
    if (!config.type) {
      throw createValidationError('orderPreparationConfig.type is required', 'orderPreparationConfig.type');
    }
    
    const validTypes = ['after_order', 'fixed_minutes', 'variable', 'ready_to_ship'];
    if (!validTypes.includes(config.type)) {
      throw createValidationError(
        `orderPreparationConfig.type must be one of: ${validTypes.join(', ')}`,
        'orderPreparationConfig.type'
      );
    }
    
    if (config.type === 'fixed_minutes' && !config.fixedMinutes) {
      throw createValidationError(
        'orderPreparationConfig.fixedMinutes is required for fixed_minutes type',
        'orderPreparationConfig.fixedMinutes'
      );
    }
  }

  const updateData: any = {};
  if (validated.category !== undefined) updateData.category = validated.category;
  if (validated.askForPreferredDeliveryDate !== undefined) {
    updateData.askForPreferredDeliveryDate = validated.askForPreferredDeliveryDate;
  }
  if (validated.orderPreparationConfig !== undefined) {
    updateData.orderPreparationConfig = validated.orderPreparationConfig;
  }
  if (validated.orderPrefix !== undefined) {
    updateData.orderPrefix = validated.orderPrefix;
  }
  if (validated.minimumOrderValue !== undefined) {
    updateData.minimumOrderValue = validated.minimumOrderValue;
  }

  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: updateData,
    select: {
      id: true,
      category: true,
      askForPreferredDeliveryDate: true,
      orderPreparationConfig: true,
      orderPrefix: true,
      minimumOrderValue: true,
    }
  });

  res.json({
    id: vendor.id,
    category: vendor.category,
    askForPreferredDeliveryDate: vendor.askForPreferredDeliveryDate,
    orderPreparationConfig: vendor.orderPreparationConfig,
    orderPrefix: vendor.orderPrefix,
    minimumOrderValue: vendor.minimumOrderValue,
  });
}));

// GET /api/vendors/:id/customer-insights - Get customer insights for vendor
vendorsRouter.get('/:id/customer-insights', requireVendorAccess(req => req.params.id), async (req, res) => {
  try {
    const vendorId = req.params.id;
    const { customerId } = req.query;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId query parameter is required' });
    }

    const insights = await prisma.customerInsights.findUnique({
      where: {
        customerId_vendorId: {
          customerId: customerId as string,
          vendorId
        }
      }
    });

    if (!insights) {
      return res.json({
        customerId,
        vendorId,
        insights: null,
        message: 'No insights found for this customer-vendor pair'
      });
    }

    // Parse JSON fields if they exist
    const whatsappLocation = insights.whatsappLocation 
      ? (typeof insights.whatsappLocation === 'string' 
          ? JSON.parse(insights.whatsappLocation) 
          : insights.whatsappLocation)
      : undefined;
    
    const specialOccasions = insights.specialOccasions
      ? (typeof insights.specialOccasions === 'string'
          ? JSON.parse(insights.specialOccasions)
          : insights.specialOccasions)
      : undefined;

    res.json({
      customerId,
      vendorId,
      insights: {
        customerName: insights.customerName,
        alternativePhoneNumber: insights.alternativePhoneNumber,
        email: insights.email,
        preferredLanguage: insights.preferredLanguage,
        basicDetails: insights.basicDetails,
        purchaseHistory: insights.purchaseHistory,
        preferences: insights.preferences,
        communicationStyle: insights.communicationStyle,
        currentOrder: insights.currentOrder,
        primaryDeliveryAddress: insights.primaryDeliveryAddress,
        deliveryAddress: insights.deliveryAddress,
        deliveryInstructions: insights.deliveryInstructions,
        whatsappLocation: whatsappLocation,
        specialRequests: insights.specialRequests,
        specialOccasions: specialOccasions,
        dietaryRestrictions: insights.dietaryRestrictions,
        paymentPreferences: insights.paymentPreferences,
        lastUpdated: insights.lastUpdated,
        createdAt: insights.createdAt
      }
    });
  } catch (error) {
    console.error('Error fetching customer insights:', error);
    res.status(500).json({ error: 'Failed to fetch customer insights' });
  }
});

// Validation schemas for dashboard stats endpoint
const DashboardStatsParamsSchema = z.object({
  id: z.string().min(1, 'Vendor ID is required'),
});

const DashboardStatsQuerySchema = z
  .object({
    dateRange: z
      .enum(['thisWeek', 'thisMonth', 'last3Months', 'last6Months', 'thisFinancialYear', 'custom'])
      .optional()
      .default('thisMonth'),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD').optional(),
  })
  .refine(
    (data) => {
      // If custom, both startDate and endDate are required
      if (data.dateRange === 'custom') {
        return data.startDate !== undefined && data.endDate !== undefined;
      }
      return true;
    },
    {
      message: 'startDate and endDate are required when dateRange is custom',
    }
  )
  .refine(
    (data) => {
      // Validate date range doesn't exceed 1 year
      if (data.startDate && data.endDate) {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        const maxEnd = new Date(start);
        maxEnd.setFullYear(maxEnd.getFullYear() + 1);
        return end <= maxEnd;
      }
      return true;
    },
    {
      message: 'Date range cannot exceed 1 year',
    }
  );

// GET /api/vendors/:id/dashboard-stats - Get comprehensive dashboard statistics
vendorsRouter.get(
  '/:id/dashboard-stats',
  requireVendorAccess((req) => req.params.id),
  dashboardStatsRateLimit,
  asyncHandlerWithContext(async (req: any, res: any) => {
    // Validate request parameters and query
    let validatedParams: z.infer<typeof DashboardStatsParamsSchema>;
    let validatedQuery: z.infer<typeof DashboardStatsQuerySchema>;

    try {
      validatedParams = DashboardStatsParamsSchema.parse(req.params);
      validatedQuery = DashboardStatsQuerySchema.parse(req.query);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw createValidationError(
          error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
          'request',
          req.query
        );
      }
      throw error;
    }

    const vendorId = validatedParams.id;
    const dateRangePreset = validatedQuery.dateRange as DateRangePreset;
    const startDate = validatedQuery.startDate;
    const endDate = validatedQuery.endDate;

    // Get dashboard stats with caching
    const stats = await getDashboardStats(vendorId, dateRangePreset, startDate, endDate);

    res.json(stats);
  }, ErrorType.BUSINESS_LOGIC, ErrorSeverity.MEDIUM)
);

// ============================================
// SETTINGS VERIFICATION ROUTES
// ============================================

/**
 * POST /api/vendors/:id/verify-phone/send
 * Send phone verification code for settings update
 */
vendorsRouter.post(
  '/:id/verify-phone/send',
  requireVendorAccess(req => req.params.id),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const vendorId = req.params.id;
    const validated = phoneVerificationSendSchema.parse(req.body);
    
    const result = await sendPhoneVerificationCode(vendorId, validated.newPhoneNumber);
    
    res.json({
      sessionInfo: result.sessionInfo,
      expiresIn: 300, // 5 minutes
    });
  })
);

/**
 * POST /api/vendors/:id/verify-phone/confirm
 * Confirm phone verification code
 */
vendorsRouter.post(
  '/:id/verify-phone/confirm',
  requireVendorAccess(req => req.params.id),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const vendorId = req.params.id;
    const validated = phoneVerificationConfirmSchema.parse(req.body);
    
    const result = await verifyPhoneChange(vendorId, validated.sessionInfo, validated.code);
    
    res.json({
      success: result.success,
    });
  })
);

/**
 * POST /api/vendors/:id/verify-email/send
 * Send email verification code for settings update
 */
vendorsRouter.post(
  '/:id/verify-email/send',
  requireVendorAccess(req => req.params.id),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const vendorId = req.params.id;
    const validated = emailVerificationSendSchema.parse(req.body);
    
    const result = await sendEmailVerificationCode(vendorId, validated.newEmail);
    
    res.json({
      sessionInfo: result.sessionInfo,
      expiresIn: 600, // 10 minutes
    });
  })
);

/**
 * POST /api/vendors/:id/verify-email/confirm
 * Confirm email verification code
 */
vendorsRouter.post(
  '/:id/verify-email/confirm',
  requireVendorAccess(req => req.params.id),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const vendorId = req.params.id;
    const validated = emailVerificationConfirmSchema.parse(req.body);
    
    const result = await verifyEmailChange(vendorId, validated.sessionInfo, validated.code);
    
    res.json({
      success: result.success,
    });
  })
);

// ============================================
// SETTINGS ROUTES
// ============================================

/**
 * GET /api/vendors/:id/business-info
 * Get business information
 */
vendorsRouter.get(
  '/:id/business-info',
  requireVendorAccess(req => req.params.id),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const vendorId = req.params.id;
    
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        businessName: true,
        phone: true,
        email: true,
        category: true,
        updatedAt: true,
      },
    });
    
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    res.json(vendor);
  })
);

/**
 * PUT /api/vendors/:id/business-info
 * Update business information (name, phone, email, category)
 */
vendorsRouter.put(
  '/:id/business-info',
  requireVendorAccess(req => req.params.id),
  settingsRateLimit,
  asyncHandlerWithContext(async (req: any, res: any) => {
    const vendorId = req.params.id;
    const validated = businessInfoSchema.parse(req.body);
    
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        businessName: validated.businessName,
        phone: validated.phone,
        email: validated.email,
        category: validated.category ?? null,
      },
      select: {
        id: true,
        businessName: true,
        phone: true,
        email: true,
        category: true,
        updatedAt: true,
      },
    });
    
    res.json(vendor);
  })
);

/**
 * GET /api/vendors/:id/notification-settings
 * Get notification settings
 */
vendorsRouter.get(
  '/:id/notification-settings',
  requireVendorAccess(req => req.params.id),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const vendorId = req.params.id;
    
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        notificationSettings: true,
      },
    });
    
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    res.json({
      vendorId: vendor.id,
      notificationSettings: vendor.notificationSettings || {},
    });
  })
);

/**
 * PUT /api/vendors/:id/notification-settings
 * Update notification settings
 */
vendorsRouter.put(
  '/:id/notification-settings',
  requireVendorAccess(req => req.params.id),
  settingsRateLimit,
  asyncHandlerWithContext(async (req: any, res: any) => {
    const vendorId = req.params.id;
    const validated = notificationSettingsSchema.parse(req.body);
    
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        notificationSettings: validated as any,
      },
      select: {
        id: true,
        notificationSettings: true,
        updatedAt: true,
      },
    });
    
    res.json({
      vendorId: vendor.id,
      notificationSettings: vendor.notificationSettings,
    });
  })
);

/**
 * GET /api/vendors/:id/matching-config
 * Get product matching configuration
 */
vendorsRouter.get(
  '/:id/matching-config',
  requireVendorAccess(req => req.params.id),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const vendorId = req.params.id;
    
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        matchingConfig: true,
      },
    });
    
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    res.json({
      vendorId: vendor.id,
      matchingConfig: vendor.matchingConfig || {},
    });
  })
);

/**
 * PUT /api/vendors/:id/matching-config
 * Update product matching configuration
 */
vendorsRouter.put(
  '/:id/matching-config',
  requireVendorAccess(req => req.params.id),
  settingsRateLimit,
  asyncHandlerWithContext(async (req: any, res: any) => {
    const vendorId = req.params.id;
    const validated = matchingConfigSchema.parse(req.body);
    
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        matchingConfig: validated as any,
      },
      select: {
        id: true,
        matchingConfig: true,
        updatedAt: true,
      },
    });
    
    res.json({
      vendorId: vendor.id,
      matchingConfig: vendor.matchingConfig,
    });
  })
);

/**
 * PUT /api/vendors/:id/timezone
 * Update timezone
 */
const linkedAccountOptInSchema = z.object({
  legalName: z.string().min(2),
  businessType: z.string().min(2),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/i),
  gstin: z.string().optional(),
  gstExempt: z.boolean().optional(),
  bankAccountNumber: z.string().min(8),
  bankIfsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i),
  bankAccountHolderName: z.string().min(2),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(10)
});

vendorsRouter.get(
  '/:id/payments/collection',
  requireVendorAccess((req) => req.params.id),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const status = await getLinkedAccountStatus(req.params.id);
    if (!status) return res.status(404).json({ error: 'not_found' });
    res.json(status);
  })
);

vendorsRouter.post(
  '/:id/payments/linked-account',
  requireVendorAccess((req) => req.params.id),
  settingsRateLimit,
  asyncHandlerWithContext(async (req: any, res: any) => {
    const vendorId = req.params.id;
    const body = linkedAccountOptInSchema.parse(req.body);
    const result = await submitLinkedAccountOptIn(vendorId, {
      ...body,
      gstExempt: body.gstExempt ?? false
    });
    res.status(201).json(result);
  }, ErrorType.PAYMENT, ErrorSeverity.MEDIUM)
);

vendorsRouter.delete(
  '/:id/payments/linked-account',
  requireVendorAccess((req) => req.params.id),
  settingsRateLimit,
  asyncHandlerWithContext(async (req: any, res: any) => {
    const result = await clearLinkedAccountOptIn(req.params.id);
    res.json(result);
  }, ErrorType.PAYMENT, ErrorSeverity.MEDIUM)
);

const settlementBankChangeSchema = z.object({
  bankAccountNumber: z.string().min(8),
  bankIfsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i),
  bankAccountHolderName: z.string().min(2),
  sessionInfo: z.string().min(8),
  otp: z.string().min(4)
});

const settlementStatementQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  format: z.enum(['json', 'csv']).optional().default('json')
});

vendorsRouter.get(
  '/:id/payments/settlement/statement',
  requireVendorAccess((req) => req.params.id),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const parsed = settlementStatementQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw createValidationError(parsed.error.errors[0]?.message ?? 'Invalid query', 'query');
    }
    const { year, month, format } = parsed.data;
    if (format === 'csv') {
      const { filename, body } = await getVendorSettlementStatementCsv(req.params.id, year, month);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(body);
      return;
    }
    const statement = await getVendorSettlementStatement(req.params.id, year, month);
    res.json(statement);
  })
);

const platformFeeInvoiceMonthSchema = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/)
});

vendorsRouter.get(
  '/:id/payments/platform-fee-invoices',
  requireVendorAccess((req) => req.params.id),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const invoices = await listVendorPlatformFeeInvoices(req.params.id);
    res.json({ invoices });
  })
);

vendorsRouter.get(
  '/:id/payments/platform-fee-invoices/:invoiceId/pdf',
  requireVendorAccess((req) => req.params.id),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const result = await getPlatformFeeInvoicePdfForVendor({
      vendorId: req.params.id,
      invoiceId: req.params.invoiceId
    });
    if ('redirectUrl' in result) {
      res.redirect(result.redirectUrl);
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  })
);

vendorsRouter.post(
  '/:id/payments/platform-fee-invoices/issue',
  requireRole('admin'),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const body = platformFeeInvoiceMonthSchema.parse(req.body);
    const invoice = await issuePlatformFeeInvoiceForVendor({
      vendorId: req.params.id,
      monthKey: body.monthKey
    });
    res.status(201).json(invoice);
  })
);

vendorsRouter.post(
  '/:id/payments/platform-fee-invoices/:invoiceId/credit-note',
  requireRole('admin'),
  asyncHandlerWithContext(async (req: any, _res: any) => {
    const reason = String(req.body?.reason ?? '').trim();
    await requestPlatformFeeCreditNote({ invoiceId: req.params.invoiceId, reason });
  })
);

vendorsRouter.get(
  '/:id/payments/settlement',
  requireVendorAccess((req) => req.params.id),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const overview = await getVendorSettlementOverview(req.params.id);
    res.json({
      position: {
        balanceMilli: bigintToDecimalString(overview.position.balanceMilli),
        heldMilli: bigintToDecimalString(overview.position.heldMilli),
        reserveMilli: bigintToDecimalString(overview.position.reserveMilli),
        owedMilli: bigintToDecimalString(overview.position.owedMilli),
        releasedMilli: bigintToDecimalString(overview.position.releasedMilli),
        nextReleaseAt: overview.position.nextReleaseAt?.toISOString() ?? null,
        asOf: overview.position.asOf.toISOString()
      },
      awaitingFunding: overview.awaitingFunding.map((row) => ({
        ...row,
        shortfallMilli: bigintToDecimalString(row.shortfallMilli)
      })),
      transfers: overview.transfers
    });
  })
);

vendorsRouter.post(
  '/:id/payments/settlement/bank-change/otp',
  requireVendorAccess((req) => req.params.id),
  settingsRateLimit,
  asyncHandlerWithContext(async (req: any, res: any) => {
    const result = await requestSettlementBankChangeOtp(req.params.id);
    res.status(201).json(result);
  })
);

vendorsRouter.post(
  '/:id/payments/settlement/bank-change',
  requireVendorAccess((req) => req.params.id),
  settingsRateLimit,
  asyncHandlerWithContext(async (req: any, res: any) => {
    const body = settlementBankChangeSchema.parse(req.body);
    const result = await confirmSettlementBankChange(req.params.id, body);
    res.json(result);
  })
);

vendorsRouter.get(
  '/:id/payments/settlement/admin',
  requireRole('admin'),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const view = await getAdminSettlementView(req.params.id);
    res.json(view);
  })
);

vendorsRouter.post(
  '/:id/payments/settlement/freeze',
  requireRole('admin'),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const reason = String(req.body?.reason ?? '').trim();
    await freezeVendorReleases({
      vendorId: req.params.id,
      reason,
      changedBy: req.user?.id ?? 'admin'
    });
    res.status(204).send();
  })
);

vendorsRouter.post(
  '/:id/payments/settlement/unfreeze',
  requireRole('admin'),
  asyncHandlerWithContext(async (req: any, res: any) => {
    await unfreezeVendorReleases({
      vendorId: req.params.id,
      changedBy: req.user?.id ?? 'admin'
    });
    res.status(204).send();
  })
);

vendorsRouter.patch(
  '/:id/payments/settlement/reserve',
  requireRole('admin'),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const rollingReserveBps = Number(req.body?.rollingReserveBps);
    const result = await setVendorRollingReserveBps({
      vendorId: req.params.id,
      rollingReserveBps,
      changedBy: req.user?.id ?? 'admin'
    });
    res.json(result);
  })
);

vendorsRouter.post(
  '/:id/payments/collection/disable',
  requireRole('admin'),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const result = await disableCollectionPreservingLedger({
      vendorId: req.params.id,
      changedBy: req.user?.id ?? 'admin'
    });
    res.json(result);
  })
);

vendorsRouter.post(
  '/:id/payments/offboard',
  requireRole('admin'),
  asyncHandlerWithContext(async (req: any, res: any) => {
    const result = await offboardVendor({
      vendorId: req.params.id,
      changedBy: req.user?.id ?? 'admin'
    });
    res.json(result);
  })
);

vendorsRouter.patch(
  '/:id/payments/settings',
  requireVendorAccess((req) => req.params.id),
  settingsRateLimit,
  asyncHandlerWithContext(async (req: any, res: any) => {
    const vendorId = req.params.id;
    const stored = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { upiVpa: true, upiPayeeName: true }
    });
    if (!stored) return res.status(404).json({ error: 'not_found' });

    const { resolvePaymentSettingsPatch } = await import('../services/payments/vendorUpiSettings.js');
    const resolved = resolvePaymentSettingsPatch(req.body ?? {}, {
      upiVpa: stored.upiVpa,
      upiPayeeName: stored.upiPayeeName
    });
    if (!resolved.ok) {
      throw createValidationError(resolved.message, resolved.field);
    }

    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: resolved.data,
      select: {
        paymentLinkAutoSend: true,
        paymentsManagedByChatlogix: true,
        upiVpa: true,
        upiPayeeName: true
      }
    });
    res.json(vendor);
  })
);

vendorsRouter.put(
  '/:id/timezone',
  requireVendorAccess(req => req.params.id),
  settingsRateLimit,
  asyncHandlerWithContext(async (req: any, res: any) => {
    const vendorId = req.params.id;
    const validated = timezoneSchema.parse(req.body);
    
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        timezone: validated.timezone,
      },
      select: {
        id: true,
        timezone: true,
        updatedAt: true,
      },
    });
    
    res.json({
      vendorId: vendor.id,
      timezone: vendor.timezone,
    });
  })
);


