import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import {
  checkAuditTableExists,
  type StaffAuditLogEntry,
} from './adminSupportService.js';

export interface ComputedAlert {
  id: string;
  type: 'low_wallet' | 'failing_replies' | 'whatsapp_dropped' | 'fx_stale';
  severity: 'warning' | 'error' | 'info';
  vendorId?: string | null;
  businessName?: string;
  summary: string;
  targetLink: string;
  evaluatedAt: string;
}

export interface TrialClockRow {
  vendorId: string;
  businessName: string;
  registrationStatus: string;
  trialGrantedMilli: number;
  walletBalanceMilli: number;
  trialExpiresAt: string;
  isPastExpiry: boolean;
  caption: string;
}

// In-memory audit log store (used for test harnesses or when table is not yet migrated)
const inMemoryAuditLogs: StaffAuditLogEntry[] = [];

export function clearInMemoryAuditStoreForTest(): void {
  inMemoryAuditLogs.length = 0;
}

export function seedInMemoryAuditLogForTest(entry: StaffAuditLogEntry): void {
  inMemoryAuditLogs.push(entry);
}

export function recordInMemoryAuditLog(entry: Omit<StaffAuditLogEntry, 'id' | 'createdAt'>): StaffAuditLogEntry {
  const item: StaffAuditLogEntry = {
    id: (globalThis as any).crypto?.randomUUID?.() || `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...entry,
    createdAt: new Date().toISOString(),
  };
  inMemoryAuditLogs.unshift(item);
  return item;
}

/**
 * Evaluates platform-level and shop-level alert rules in memory.
 * Completely non-destructive: does not write to the database.
 */
export async function evaluateComputedAlerts(): Promise<ComputedAlert[]> {
  const now = new Date();
  const nowIso = now.toISOString();
  const alerts: ComputedAlert[] = [];

  try {
    // 1. Low Wallet Alert: walletBalanceMilli < 20000 (₹20.00)
    const lowWalletVendors = await prisma.vendor.findMany({
      where: {
        walletBalanceMilli: { lt: 20000 },
      },
      select: {
        id: true,
        businessName: true,
        walletBalanceMilli: true,
      },
      take: 50,
    });

    for (const v of lowWalletVendors) {
      const balanceRupees = (v.walletBalanceMilli / 1000).toFixed(2);
      alerts.push({
        id: `low_wallet-${v.id}`,
        type: 'low_wallet',
        severity: 'warning',
        vendorId: v.id,
        businessName: v.businessName,
        summary: `Balance is ₹${balanceRupees} (evaluated now)`,
        targetLink: `/vendors`,
        evaluatedAt: nowIso,
      });
    }

    // 2. Failing Replies Alert: >= 3 failed assistant messages in last 24 hours per shop
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const failedMessages = await prisma.message.findMany({
      where: {
        status: 'failed',
        senderType: 'assistant',
        timestamp: { gte: last24h },
      },
      select: {
        conversation: {
          select: {
            vendorId: true,
            vendor: { select: { id: true, businessName: true } },
          },
        },
      },
      take: 500,
    });

    const failedCountsByVendor = new Map<string, { vendorId: string; businessName: string; count: number }>();
    for (const msg of failedMessages) {
      const vId = msg.conversation?.vendorId;
      if (!vId) continue;
      const existing = failedCountsByVendor.get(vId) ?? {
        vendorId: vId,
        businessName: msg.conversation?.vendor?.businessName ?? 'Unknown Vendor',
        count: 0,
      };
      existing.count += 1;
      failedCountsByVendor.set(vId, existing);
    }

    for (const item of failedCountsByVendor.values()) {
      if (item.count >= 3) {
        alerts.push({
          id: `failing_replies-${item.vendorId}`,
          type: 'failing_replies',
          severity: 'error',
          vendorId: item.vendorId,
          businessName: item.businessName,
          summary: `${item.count} failed outbound replies in last 24h`,
          targetLink: `/reliability?vendorId=${item.vendorId}`,
          evaluatedAt: nowIso,
        });
      }
    }

    // 3. WhatsApp Dropped Alert: connectStatus in 'disconnected' or 'error'
    const droppedWhatsApps = await prisma.whatsAppNumber.findMany({
      where: {
        connectStatus: { in: ['disconnected', 'error'] },
      },
      select: {
        vendorId: true,
        connectStatus: true,
        vendor: { select: { id: true, businessName: true } },
      },
      take: 50,
    });

    for (const wa of droppedWhatsApps) {
      alerts.push({
        id: `whatsapp_dropped-${wa.vendorId}`,
        type: 'whatsapp_dropped',
        severity: 'warning',
        vendorId: wa.vendorId,
        businessName: wa.vendor?.businessName ?? 'Unknown Vendor',
        summary: `WhatsApp connection status is ${wa.connectStatus}`,
        targetLink: `/vendors`,
        evaluatedAt: nowIso,
      });
    }

    // 4. FX Stale Alert: platform usdToInrFetchedAt null or >48 hours old
    const platformSettings = await prisma.platformSettings.findFirst({
      select: { usdToInrFetchedAt: true },
    });

    const staleCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    if (!platformSettings?.usdToInrFetchedAt || platformSettings.usdToInrFetchedAt < staleCutoff) {
      alerts.push({
        id: 'fx_stale-platform',
        type: 'fx_stale',
        severity: 'warning',
        vendorId: null,
        businessName: 'Platform',
        summary: 'USD/INR FX rate has not refreshed in >48h',
        targetLink: '/billing',
        evaluatedAt: nowIso,
      });
    }
  } catch (err) {
    logger.error({ err }, 'Error evaluating computed alerts');
  }

  return alerts;
}

/**
 * Retrieves and formats trial clocks based on filter ('next7' | 'past' | 'all')
 */
export async function getTrialClocks(filter: 'next7' | 'past' | 'all' = 'next7'): Promise<TrialClockRow[]> {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let whereClause: any = { trialExpiresAt: { not: null } };

  if (filter === 'next7') {
    whereClause = {
      trialExpiresAt: {
        gte: now,
        lte: sevenDaysFromNow,
      },
    };
  } else if (filter === 'past') {
    whereClause = {
      trialExpiresAt: {
        lt: now,
      },
    };
  }

  const vendors = await prisma.vendor.findMany({
    where: whereClause,
    select: {
      id: true,
      businessName: true,
      registrationStatus: true,
      trialGrantedMilli: true,
      walletBalanceMilli: true,
      trialExpiresAt: true,
    },
    orderBy: {
      trialExpiresAt: 'asc',
    },
    take: 100,
  });

  return vendors.map((v) => {
    const expiresAt = v.trialExpiresAt!;
    const isPast = expiresAt < now;
    let caption = '';

    if (v.registrationStatus === 'approved') {
      caption = 'Expiry does not stop replies. This shop is approved.';
    } else if (isPast) {
      caption = 'Replies are blocked until the shop is approved.';
    } else {
      caption = 'Replies stop at this time if the shop is still not approved.';
    }

    return {
      vendorId: v.id,
      businessName: v.businessName,
      registrationStatus: v.registrationStatus,
      trialGrantedMilli: v.trialGrantedMilli ?? 0,
      walletBalanceMilli: v.walletBalanceMilli,
      trialExpiresAt: expiresAt.toISOString(),
      isPastExpiry: isPast,
      caption,
    };
  });
}

/**
 * Fetches staff audit logs with filters and search
 */
export async function listAuditLogs(params: {
  vendorId?: string;
  action?: string;
  search?: string;
  limit?: number;
  page?: number;
}): Promise<{
  supported: boolean;
  status?: string;
  message?: string;
  items: StaffAuditLogEntry[];
  count: number;
  page: number;
  limit: number;
}> {
  const limit = Math.min(Math.max(params.limit || 50, 1), 100);
  const page = Math.max(params.page || 1, 1);
  const tableExists = await checkAuditTableExists();

  if (!tableExists && inMemoryAuditLogs.length === 0) {
    return {
      supported: false,
      status: 'pending_migration',
      message: 'StaffAuditLog persistence requires schema migration approval (Decision 3).',
      items: [],
      count: 0,
      page,
      limit,
    };
  }

  let logs = [...inMemoryAuditLogs];

  if (params.action && params.action !== 'all') {
    logs = logs.filter((l) => l.action === params.action);
  }

  if (params.vendorId) {
    logs = logs.filter((l) => l.vendorId === params.vendorId);
  }

  if (params.search) {
    const q = params.search.toLowerCase();
    logs = logs.filter(
      (l) => l.summary.toLowerCase().includes(q) || l.actorId.toLowerCase().includes(q)
    );
  }

  logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const startIndex = (page - 1) * limit;
  const items = logs.slice(startIndex, startIndex + limit);

  return {
    supported: true,
    items,
    count: logs.length,
    page,
    limit,
  };
}
