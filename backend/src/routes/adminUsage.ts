import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const adminUsageRouter = Router();

export const IST_TIMEZONE = 'Asia/Kolkata';
const MS_PER_MINUTE = 60 * 1000;
const IST_OFFSET_MS = (5 * 60 + 30) * MS_PER_MINUTE; // +05:30 (19,800,000 ms)

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class RangeExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RangeExceededError';
  }
}

export const SOURCE_LABELS: Record<string, string> = {
  conversation_turn: 'Customer replies',
  legacy_conversation_turn: 'Customer replies',
  outbound_media: 'Product media',
  catalog_import: 'Catalog import',
  catalog_enhance: 'Catalog enhancer',
  catalog_enhance_transcribe: 'Catalog enhancer',
  sandbox_chat: 'Sandbox',
  sandbox_transcribe: 'Sandbox'
};

export function formatSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/** Escapes a CSV cell according to RFC 4180 rules. */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface UsageCsvVendorRow {
  vendorId: string;
  businessName: string;
  chargedMilli: number;
  count: number;
  topSource: string;
}

/** Formats vendors usage data into an RFC 4180 compliant CSV string. */
export function formatUsageCsv(
  vendors: UsageCsvVendorRow[],
  fromStr: string,
  toStr: string
): string {
  const dateRangeLabel = `${fromStr} to ${toStr}`;
  const header = ['Shop', 'Vendor ID', 'Charged (INR)', 'Charges', 'Top Source', 'Date Range (IST)'];
  const lines: string[] = [header.join(',')];

  for (const v of vendors) {
    const chargedInr = (v.chargedMilli / 1000).toFixed(2);
    lines.push(
      [
        escapeCsvCell(v.businessName || 'Unknown Vendor'),
        escapeCsvCell(v.vendorId),
        escapeCsvCell(chargedInr),
        escapeCsvCell(v.count),
        escapeCsvCell(v.topSource || '—'),
        escapeCsvCell(dateRangeLabel)
      ].join(',')
    );
  }

  return lines.join('\r\n') + '\r\n';
}

/** Formats a UTC timestamp into YYYY-MM-DD in IST. */
export function formatIstDate(date: Date): string {
  const istTime = new Date(date.getTime() + IST_OFFSET_MS);
  const y = istTime.getUTCFullYear();
  const m = String(istTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(istTime.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Converts an IST calendar date string YYYY-MM-DD into start & end UTC Dates. */
export function istDayToUtcRange(dayStr: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayStr.trim());
  if (!match) throw new ValidationError(`Invalid day string: ${dayStr}`);
  const [_, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);

  // 00:00:00.000 IST -> UTC = Date.UTC(...) - IST_OFFSET_MS
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - IST_OFFSET_MS);
  // 23:59:59.999 IST -> UTC = Date.UTC(...) - IST_OFFSET_MS
  const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - IST_OFFSET_MS);
  return { start, end };
}

/** Default range: last 7 calendar days in IST (6 days ago 00:00 IST to today 23:59:59.999 IST). */
export function getDefaultDateRange(): { fromDate: Date; toDate: Date; fromStr: string; toStr: string } {
  const now = new Date();
  const todayIst = formatIstDate(now);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayIst)!;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const sevenDaysAgoIst = new Date(Date.UTC(year, month - 1, day - 6, 0, 0, 0, 0));
  const fromStr = `${sevenDaysAgoIst.getUTCFullYear()}-${String(sevenDaysAgoIst.getUTCMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgoIst.getUTCDate()).padStart(2, '0')}`;
  const toStr = todayIst;

  const { start: fromDate } = istDayToUtcRange(fromStr);
  const { end: toDate } = istDayToUtcRange(toStr);
  return { fromDate, toDate, fromStr, toStr };
}

/**
 * Validates and parses `from` and `to` query parameters.
 * Enforces maximum 31 calendar days.
 */
export function parseUsageDateRange(
  fromParam?: unknown,
  toParam?: unknown
): { fromDate: Date; toDate: Date; fromIso: string; toIso: string } {
  if (fromParam === undefined && toParam === undefined) {
    const def = getDefaultDateRange();
    return {
      fromDate: def.fromDate,
      toDate: def.toDate,
      fromIso: def.fromDate.toISOString(),
      toIso: def.toDate.toISOString()
    };
  }

  if (typeof fromParam !== 'string' || typeof toParam !== 'string') {
    throw new ValidationError('from and to query parameters must be strings');
  }

  const fromTrimmed = fromParam.trim();
  const toTrimmed = toParam.trim();
  if (!fromTrimmed || !toTrimmed) {
    throw new ValidationError('from and to query parameters cannot be empty');
  }

  let fromDate: Date;
  let toDate: Date;

  if (/^\d{4}-\d{2}-\d{2}$/.test(fromTrimmed)) {
    try {
      fromDate = istDayToUtcRange(fromTrimmed).start;
    } catch {
      throw new ValidationError(`Invalid from date: ${fromTrimmed}`);
    }
  } else {
    fromDate = new Date(fromTrimmed);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(toTrimmed)) {
    try {
      toDate = istDayToUtcRange(toTrimmed).end;
    } catch {
      throw new ValidationError(`Invalid to date: ${toTrimmed}`);
    }
  } else {
    toDate = new Date(toTrimmed);
  }

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    throw new ValidationError('Invalid from or to date parameter');
  }

  if (fromDate > toDate) {
    throw new ValidationError('from date must be before or equal to to date');
  }

  const maxMs = 31 * 24 * 60 * 60 * 1000;
  // 1 second buffer for inclusive millisecond boundary
  if (toDate.getTime() - fromDate.getTime() > maxMs + 1000) {
    throw new RangeExceededError('Date range cannot exceed 31 calendar days');
  }

  return {
    fromDate,
    toDate,
    fromIso: fromDate.toISOString(),
    toIso: toDate.toISOString()
  };
}

/** Fetches and calculates platform usage data for the specified date range. */
export async function fetchPlatformUsageData(fromQuery?: unknown, toQuery?: unknown) {
  const dateRange = parseUsageDateRange(fromQuery, toQuery);
  const { fromDate, toDate, fromIso, toIso } = dateRange;

  const [creditUsageRows, deductions, recharges, conversationCount] = await Promise.all([
    prisma.creditUsage.findMany({
      where: {
        usageDate: {
          gte: fromDate,
          lte: toDate
        }
      },
      select: {
        vendorId: true,
        source: true,
        chargedMilli: true,
        vendor: {
          select: {
            businessName: true
          }
        }
      }
    }),
    prisma.walletTransaction.findMany({
      where: {
        transactionType: 'deduction',
        transactionDate: {
          gte: fromDate,
          lte: toDate
        }
      },
      select: {
        amountMilli: true,
        metadata: true
      }
    }),
    prisma.walletTransaction.findMany({
      where: {
        transactionType: 'recharge',
        transactionDate: {
          gte: fromDate,
          lte: toDate
        }
      },
      select: {
        amountMilli: true,
        metadata: true
      }
    }),
    prisma.conversation.count({
      where: {
        createdAt: {
          gte: fromDate,
          lte: toDate
        }
      }
    })
  ]);

  // 1. Totals
  const totalChargedMilli = creditUsageRows.reduce((sum, r) => sum + r.chargedMilli, 0);

  let openAiCostMilli = 0;
  for (const tx of deductions) {
    if (tx.metadata && typeof tx.metadata === 'object' && !Array.isArray(tx.metadata)) {
      const cost = (tx.metadata as Record<string, unknown>).aiCostMilli;
      const num = Number(cost);
      if (Number.isFinite(num)) {
        openAiCostMilli += num;
      }
    }
  }

  let trialGrantedMilli = 0;
  let otherCreditsMilli = 0;
  for (const tx of recharges) {
    const meta =
      tx.metadata && typeof tx.metadata === 'object' && !Array.isArray(tx.metadata)
        ? (tx.metadata as Record<string, unknown>)
        : undefined;
    const source = typeof meta?.source === 'string' ? meta.source.trim() : '';
    if (source === 'trial_grant') {
      trialGrantedMilli += tx.amountMilli;
    } else {
      otherCreditsMilli += tx.amountMilli;
    }
  }

  // 2. bySource aggregation
  const bySourceMap = new Map<string, { chargedMilli: number; count: number }>();
  for (const row of creditUsageRows) {
    const cur = bySourceMap.get(row.source) ?? { chargedMilli: 0, count: 0 };
    cur.chargedMilli += row.chargedMilli;
    cur.count += 1;
    bySourceMap.set(row.source, cur);
  }

  const bySource = Array.from(bySourceMap.entries())
    .map(([source, stats]) => ({
      source,
      label: formatSourceLabel(source),
      chargedMilli: stats.chargedMilli,
      count: stats.count
    }))
    .sort((a, b) => b.chargedMilli - a.chargedMilli);

  // 3. byVendor aggregation
  interface VendorAggregate {
    vendorId: string;
    businessName: string;
    chargedMilli: number;
    count: number;
    sourceCounts: Map<string, number>;
  }

  const byVendorMap = new Map<string, VendorAggregate>();
  for (const row of creditUsageRows) {
    let cur = byVendorMap.get(row.vendorId);
    if (!cur) {
      cur = {
        vendorId: row.vendorId,
        businessName: row.vendor?.businessName ?? 'Unknown Vendor',
        chargedMilli: 0,
        count: 0,
        sourceCounts: new Map<string, number>()
      };
      byVendorMap.set(row.vendorId, cur);
    }
    cur.chargedMilli += row.chargedMilli;
    cur.count += 1;
    cur.sourceCounts.set(row.source, (cur.sourceCounts.get(row.source) ?? 0) + 1);
  }

  const allVendors = Array.from(byVendorMap.values())
    .map((v) => {
      let topSource = '—';
      let maxCount = -1;
      for (const [src, cnt] of v.sourceCounts.entries()) {
        if (cnt > maxCount) {
          maxCount = cnt;
          topSource = formatSourceLabel(src);
        }
      }
      return {
        vendorId: v.vendorId,
        businessName: v.businessName,
        chargedMilli: v.chargedMilli,
        count: v.count,
        topSource
      };
    })
    .sort((a, b) => b.chargedMilli - a.chargedMilli);

  return {
    fromDate,
    toDate,
    fromIso,
    toIso,
    totalChargedMilli,
    openAiCostMilli,
    trialGrantedMilli,
    otherCreditsMilli,
    bySource,
    allVendors,
    conversationCount
  };
}

function sendUsageCsv(res: any, data: Awaited<ReturnType<typeof fetchPlatformUsageData>>) {
  const fromYmd = formatIstDate(data.fromDate);
  const toYmd = formatIstDate(data.toDate);
  const csvBody = formatUsageCsv(data.allVendors, fromYmd, toYmd);
  const filename = `chatlogix-usage-${fromYmd}-to-${toYmd}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csvBody);
}

// GET /api/admin/usage/export - Platform usage CSV export
adminUsageRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    try {
      const data = await fetchPlatformUsageData(req.query.from, req.query.to);
      return sendUsageCsv(res, data);
    } catch (err) {
      if (err instanceof RangeExceededError) {
        return res.status(400).json({ error: 'range_exceeds_31_days', message: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: 'invalid_date_range', message: err.message });
      }
      throw err;
    }
  })
);

// GET /api/admin/usage - Platform usage rollup (JSON or CSV if format=csv)
adminUsageRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    let data: Awaited<ReturnType<typeof fetchPlatformUsageData>>;
    try {
      data = await fetchPlatformUsageData(req.query.from, req.query.to);
    } catch (err) {
      if (err instanceof RangeExceededError) {
        return res.status(400).json({ error: 'range_exceeds_31_days', message: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: 'invalid_date_range', message: err.message });
      }
      throw err;
    }

    if (req.query.format === 'csv' || req.query.export === 'csv') {
      return sendUsageCsv(res, data);
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
    const totalVendors = data.allVendors.length;
    const totalPages = Math.ceil(totalVendors / limit) || 1;
    const paginatedVendors = data.allVendors.slice((page - 1) * limit, page * limit);

    return res.json({
      from: data.fromIso,
      to: data.toIso,
      totals: {
        chargedMilli: data.totalChargedMilli,
        openAiCostMilli: Math.round(data.openAiCostMilli * 10_000) / 10_000,
        trialGrantedMilli: data.trialGrantedMilli,
        otherCreditsMilli: data.otherCreditsMilli
      },
      bySource: data.bySource,
      byVendor: paginatedVendors,
      pagination: {
        page,
        limit,
        totalVendors,
        totalPages
      },
      meta: {
        conversationCount: data.conversationCount,
        chargedToVendorsForMetaMilli: 0
      }
    });
  })
);

// GET /api/admin/usage/:vendorId - Vendor usage drill-down
adminUsageRouter.get(
  '/:vendorId',
  asyncHandler(async (req, res) => {
    const vendorId = req.params.vendorId;

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, businessName: true }
    });
    if (!vendor) {
      return res.status(404).json({ error: 'not_found' });
    }

    let dateRange: ReturnType<typeof parseUsageDateRange>;
    try {
      dateRange = parseUsageDateRange(req.query.from, req.query.to);
    } catch (err) {
      if (err instanceof RangeExceededError) {
        return res.status(400).json({ error: 'range_exceeds_31_days', message: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: 'invalid_date_range', message: err.message });
      }
      throw err;
    }

    const { fromDate, toDate, fromIso, toIso } = dateRange;

    const [usageRows, deductions] = await Promise.all([
      prisma.creditUsage.findMany({
        where: {
          vendorId: vendor.id,
          usageDate: {
            gte: fromDate,
            lte: toDate
          }
        },
        select: {
          id: true,
          usageDate: true,
          source: true,
          chargedMilli: true,
          externalId: true
        },
        orderBy: {
          usageDate: 'desc'
        }
      }),
      prisma.walletTransaction.findMany({
        where: {
          vendorId: vendor.id,
          transactionType: 'deduction',
          transactionDate: {
            gte: fromDate,
            lte: toDate
          }
        },
        select: {
          metadata: true
        }
      })
    ]);

    // 1. Totals
    const chargedMilli = usageRows.reduce((sum, r) => sum + r.chargedMilli, 0);

    let openAiCostMilli = 0;
    let hasIncompleteCost = false;
    if (deductions.length === 0 && usageRows.length > 0) {
      hasIncompleteCost = true;
    }

    for (const tx of deductions) {
      const meta =
        tx.metadata && typeof tx.metadata === 'object' && !Array.isArray(tx.metadata)
          ? (tx.metadata as Record<string, unknown>)
          : undefined;
      const cost = meta?.aiCostMilli;
      const num = Number(cost);
      if (Number.isFinite(num)) {
        openAiCostMilli += num;
      } else {
        hasIncompleteCost = true;
      }
    }

    // 2. bySource
    const bySourceMap = new Map<string, { chargedMilli: number; count: number }>();
    for (const row of usageRows) {
      const cur = bySourceMap.get(row.source) ?? { chargedMilli: 0, count: 0 };
      cur.chargedMilli += row.chargedMilli;
      cur.count += 1;
      bySourceMap.set(row.source, cur);
    }

    const bySource = Array.from(bySourceMap.entries())
      .map(([source, stats]) => ({
        source,
        label: formatSourceLabel(source),
        chargedMilli: stats.chargedMilli,
        count: stats.count
      }))
      .sort((a, b) => b.chargedMilli - a.chargedMilli);

    // 3. byDay (grouped by IST calendar day)
    const byDayMap = new Map<string, { chargedMilli: number; count: number }>();
    for (const row of usageRows) {
      const day = formatIstDate(row.usageDate);
      const cur = byDayMap.get(day) ?? { chargedMilli: 0, count: 0 };
      cur.chargedMilli += row.chargedMilli;
      cur.count += 1;
      byDayMap.set(day, cur);
    }

    const byDay = Array.from(byDayMap.entries())
      .map(([day, stats]) => ({
        day,
        chargedMilli: stats.chargedMilli,
        count: stats.count
      }))
      .sort((a, b) => b.day.localeCompare(a.day));

    // 4. Selected day charge inspection (max 100 rows)
    let selectedDay: string | null = null;
    if (typeof req.query.day === 'string' && req.query.day.trim()) {
      const dayStr = req.query.day.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) {
        return res.status(400).json({ error: 'invalid_day_format', message: 'day must be in YYYY-MM-DD format' });
      }
      selectedDay = dayStr;
    } else {
      // Default to first day with charges, or toDate day
      selectedDay = byDay[0]?.day ?? formatIstDate(toDate);
    }

    let dayStart: Date;
    let dayEnd: Date;
    try {
      const range = istDayToUtcRange(selectedDay);
      dayStart = range.start;
      dayEnd = range.end;
    } catch {
      return res.status(400).json({ error: 'invalid_day_format', message: 'Invalid day parameter' });
    }

    const [dayCharges, dayDeductions] = await Promise.all([
      prisma.creditUsage.findMany({
        where: {
          vendorId: vendor.id,
          usageDate: {
            gte: dayStart,
            lte: dayEnd
          }
        },
        orderBy: { usageDate: 'desc' },
        take: 100,
        select: {
          id: true,
          usageDate: true,
          source: true,
          chargedMilli: true,
          externalId: true
        }
      }),
      prisma.walletTransaction.findMany({
        where: {
          vendorId: vendor.id,
          transactionType: 'deduction',
          transactionDate: {
            gte: dayStart,
            lte: dayEnd
          }
        },
        select: {
          metadata: true
        }
      })
    ]);

    const ledgerCostByExternalId = new Map<string, number>();
    for (const d of dayDeductions) {
      const meta =
        d.metadata && typeof d.metadata === 'object' && !Array.isArray(d.metadata)
          ? (d.metadata as Record<string, unknown>)
          : undefined;
      if (typeof meta?.externalId === 'string' && meta.externalId) {
        const num = Number(meta.aiCostMilli);
        if (Number.isFinite(num)) {
          ledgerCostByExternalId.set(meta.externalId, num);
        }
      }
    }

    const charges = dayCharges.map((ch) => {
      const cost = ch.externalId ? ledgerCostByExternalId.get(ch.externalId) : undefined;
      return {
        id: ch.id,
        time: ch.usageDate.toISOString(),
        source: ch.source,
        sourceLabel: formatSourceLabel(ch.source),
        chargedMilli: ch.chargedMilli,
        openAiCostMilli: cost !== undefined ? cost : null
      };
    });

    return res.json({
      vendorId: vendor.id,
      businessName: vendor.businessName,
      from: fromIso,
      to: toIso,
      totals: {
        chargedMilli,
        openAiCostMilli: Math.round(openAiCostMilli * 10_000) / 10_000,
        hasIncompleteCost
      },
      bySource,
      byDay,
      selectedDay,
      charges
    });
  })
);
