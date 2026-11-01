import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { AddressInfo } from 'node:net';

const vendorFindUnique = vi.fn();
const creditUsageFindMany = vi.fn();
const walletTransactionFindMany = vi.fn();
const conversationCount = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args)
    },
    creditUsage: {
      findMany: (...args: unknown[]) => creditUsageFindMany(...args)
    },
    walletTransaction: {
      findMany: (...args: unknown[]) => walletTransactionFindMany(...args)
    },
    conversation: {
      count: (...args: unknown[]) => conversationCount(...args)
    }
  }
}));

const { adminUsageRouter, formatIstDate, istDayToUtcRange, formatSourceLabel, escapeCsvCell, formatUsageCsv } =
  await import('../adminUsage.js');

let currentUser: { id: string; roles: string[] } | null = { id: 'admin-user-1', roles: ['admin'] };

const app = express();
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!currentUser) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = currentUser;
  next();
});
app.use(
  '/admin/usage',
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.roles?.includes('admin')) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  },
  adminUsageRouter
);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const port = (server.address() as AddressInfo).port;
const baseUrl = `http://127.0.0.1:${port}/admin/usage`;

afterAll(() => {
  server.close();
});

const VENDOR_1 = '00000000-0000-4000-8000-000000000001';
const VENDOR_2 = '00000000-0000-4000-8000-000000000002';

describe('Admin Usage API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = { id: 'admin-user-1', roles: ['admin'] };
  });

  describe('Authentication & Authorization', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      currentUser = null;
      const res = await fetch(baseUrl);
      expect(res.status).toBe(401);
      const data: any = await res.json();
      expect(data.error).toBe('unauthorized');
    });

    it('rejects non-admin users with HTTP 403', async () => {
      currentUser = { id: 'vendor-user-1', roles: ['vendor'] };
      const res = await fetch(baseUrl);
      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error).toBe('forbidden');
    });

    it('rejects non-admin users on vendor drill-down with HTTP 403', async () => {
      currentUser = { id: 'vendor-user-1', roles: ['vendor'] };
      const res = await fetch(`${baseUrl}/${VENDOR_1}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Date Range Validation & IST Calendar Boundaries', () => {
    it('defaults to last 7 days IST when from and to are omitted', async () => {
      creditUsageFindMany.mockResolvedValue([]);
      walletTransactionFindMany.mockResolvedValue([]);
      conversationCount.mockResolvedValue(0);

      const res = await fetch(baseUrl);
      expect(res.status).toBe(200);
      const data: any = await res.json();

      expect(data.from).toBeDefined();
      expect(data.to).toBeDefined();
      expect(new Date(data.from).getTime()).toBeLessThan(new Date(data.to).getTime());

      // Verify Prisma query was called with date boundaries
      expect(creditUsageFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            usageDate: {
              gte: expect.any(Date),
              lte: expect.any(Date)
            }
          })
        })
      );
    });

    it('rejects invalid date parameters with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}?from=invalid-date&to=2026-10-25`);
      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toBe('invalid_date_range');
    });

    it('rejects reversed dates with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}?from=2026-10-25&to=2026-10-18`);
      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toBe('invalid_date_range');
    });

    it('rejects date ranges exceeding 31 calendar days with HTTP 400', async () => {
      // 35 days
      const res = await fetch(`${baseUrl}?from=2026-09-01&to=2026-10-06`);
      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toBe('range_exceeds_31_days');
    });

    it('accepts a valid 31-day range and maps IST midnight accurately', async () => {
      creditUsageFindMany.mockResolvedValue([]);
      walletTransactionFindMany.mockResolvedValue([]);
      conversationCount.mockResolvedValue(0);

      const res = await fetch(`${baseUrl}?from=2026-10-01&to=2026-10-31`);
      expect(res.status).toBe(200);

      // Check IST midnight boundaries: 2026-10-01 00:00:00 IST is 2026-09-30 18:30:00 UTC
      const expectedRange = istDayToUtcRange('2026-10-01');
      expect(expectedRange.start.toISOString()).toBe('2026-09-30T18:30:00.000Z');
      expect(formatIstDate(new Date('2026-09-30T18:30:00.000Z'))).toBe('2026-10-01');

      // 1 ms before IST midnight is still previous day in IST
      expect(formatIstDate(new Date('2026-09-30T18:29:59.999Z'))).toBe('2026-09-30');
    });
  });

  describe('GET /admin/usage — Platform Rollup Aggregations', () => {
    it('correctly aggregates charged amounts, OpenAI costs, trial grants, and other credits', async () => {
      // 1. CreditUsage rows
      creditUsageFindMany.mockResolvedValue([
        {
          vendorId: VENDOR_1,
          source: 'conversation_turn',
          chargedMilli: 390,
          vendor: { businessName: 'Annapoorna Foods' }
        },
        {
          vendorId: VENDOR_1,
          source: 'catalog_import',
          chargedMilli: 2000,
          vendor: { businessName: 'Annapoorna Foods' }
        },
        {
          vendorId: VENDOR_2,
          source: 'conversation_turn',
          chargedMilli: 500,
          vendor: { businessName: 'Isha Bakers' }
        },
        {
          vendorId: VENDOR_2,
          source: 'custom_future_source',
          chargedMilli: 150,
          vendor: { businessName: 'Isha Bakers' }
        }
      ]);

      // 2. Deduction transactions (OpenAI costs)
      walletTransactionFindMany.mockImplementation((args: any) => {
        if (args?.where?.transactionType === 'deduction') {
          return Promise.resolve([
            { amountMilli: 390, metadata: { aiCostMilli: 260 } },
            { amountMilli: 2000, metadata: { aiCostMilli: 1200 } },
            { amountMilli: 500, metadata: { aiCostMilli: 350 } },
            { amountMilli: 150, metadata: null } // Legacy row missing cost
          ]);
        }
        if (args?.where?.transactionType === 'recharge') {
          return Promise.resolve([
            { amountMilli: 50000, metadata: { source: 'trial_grant' } },
            { amountMilli: 20000, metadata: { source: 'admin_recharge' } },
            { amountMilli: 10000, metadata: { source: 'wallet_topup' } }
          ]);
        }
        return Promise.resolve([]);
      });

      // 3. Conversations
      conversationCount.mockResolvedValue(42);

      const res = await fetch(`${baseUrl}?from=2026-10-18&to=2026-10-24`);
      expect(res.status).toBe(200);
      const data: any = await res.json();

      // Total charged: 390 + 2000 + 500 + 150 = 3040 milli
      expect(data.totals.chargedMilli).toBe(3040);

      // Total OpenAI cost: 260 + 1200 + 350 = 1810 milli (null handled safely)
      expect(data.totals.openAiCostMilli).toBe(1810);

      // Trial grants: 50000 milli
      expect(data.totals.trialGrantedMilli).toBe(50000);

      // Other credits: 20000 + 10000 = 30000 milli
      expect(data.totals.otherCreditsMilli).toBe(30000);

      // Meta metrics: 42 conversations, 0 charged
      expect(data.meta.conversationCount).toBe(42);
      expect(data.meta.chargedToVendorsForMetaMilli).toBe(0);

      // bySource breakdown
      expect(data.bySource).toEqual(
        expect.arrayContaining([
          {
            source: 'catalog_import',
            label: 'Catalog import',
            chargedMilli: 2000,
            count: 1
          },
          {
            source: 'conversation_turn',
            label: 'Customer replies',
            chargedMilli: 890,
            count: 2
          },
          {
            source: 'custom_future_source',
            label: 'custom_future_source', // Fallback for unknown source
            chargedMilli: 150,
            count: 1
          }
        ])
      );

      // byVendor breakdown sorted by chargedMilli DESC
      expect(data.byVendor).toHaveLength(2);
      expect(data.byVendor[0].vendorId).toBe(VENDOR_1);
      expect(data.byVendor[0].businessName).toBe('Annapoorna Foods');
      expect(data.byVendor[0].chargedMilli).toBe(2390);
      expect(data.byVendor[0].count).toBe(2);

      expect(data.byVendor[1].vendorId).toBe(VENDOR_2);
      expect(data.byVendor[1].chargedMilli).toBe(650);

      // Pagination
      expect(data.pagination).toEqual({
        page: 1,
        limit: 25,
        totalVendors: 2,
        totalPages: 1
      });
    });

    it('supports vendor pagination with page and limit parameters', async () => {
      const rows = [];
      for (let i = 1; i <= 30; i++) {
        rows.push({
          vendorId: `vendor-${i}`,
          source: 'conversation_turn',
          chargedMilli: i * 100,
          vendor: { businessName: `Shop ${i}` }
        });
      }
      creditUsageFindMany.mockResolvedValue(rows);
      walletTransactionFindMany.mockResolvedValue([]);
      conversationCount.mockResolvedValue(0);

      // Request page 2 with limit 10
      const res = await fetch(`${baseUrl}?from=2026-10-18&to=2026-10-24&page=2&limit=10`);
      expect(res.status).toBe(200);
      const data: any = await res.json();

      expect(data.pagination).toEqual({
        page: 2,
        limit: 10,
        totalVendors: 30,
        totalPages: 3
      });
      expect(data.byVendor).toHaveLength(10);
      // Items 11 to 20 (sorted DESC, so vendor-20 down to vendor-11)
      expect(data.byVendor[0].vendorId).toBe('vendor-20');
      expect(data.byVendor[9].vendorId).toBe('vendor-11');
    });

    it('safely handles empty usage period with zero amounts', async () => {
      creditUsageFindMany.mockResolvedValue([]);
      walletTransactionFindMany.mockResolvedValue([]);
      conversationCount.mockResolvedValue(0);

      const res = await fetch(`${baseUrl}?from=2026-10-18&to=2026-10-24`);
      expect(res.status).toBe(200);
      const data: any = await res.json();

      expect(data.totals).toEqual({
        chargedMilli: 0,
        openAiCostMilli: 0,
        trialGrantedMilli: 0,
        otherCreditsMilli: 0
      });
      expect(data.bySource).toEqual([]);
      expect(data.byVendor).toEqual([]);
      expect(data.meta.conversationCount).toBe(0);
      expect(data.meta.chargedToVendorsForMetaMilli).toBe(0);
    });
  });

  describe('GET /admin/usage/:vendorId — Vendor Usage Drill-down', () => {
    it('returns HTTP 404 when vendor does not exist', async () => {
      vendorFindUnique.mockResolvedValue(null);

      const res = await fetch(`${baseUrl}/non-existent-vendor`);
      expect(res.status).toBe(404);
      const data: any = await res.json();
      expect(data.error).toBe('not_found');
    });

    it('returns vendor totals, daily breakdown, and inspected charges', async () => {
      vendorFindUnique.mockResolvedValue({
        id: VENDOR_1,
        businessName: 'Annapoorna Foods'
      });

      // CreditUsage rows in range (two days: Oct 20 and Oct 21 IST)
      creditUsageFindMany.mockImplementation((args: any) => {
        // Inspection query for selected day
        if (args?.take === 100) {
          return Promise.resolve([
            {
              id: 'cu-1',
              usageDate: new Date('2026-10-21T04:44:00.000Z'), // 10:14 IST
              source: 'conversation_turn',
              chargedMilli: 390,
              externalId: 'ext-turn-1'
            },
            {
              id: 'cu-2',
              usageDate: new Date('2026-10-21T03:30:00.000Z'),
              source: 'outbound_media',
              chargedMilli: 50,
              externalId: 'ext-media-1'
            }
          ]);
        }
        // Range query
        return Promise.resolve([
          {
            id: 'cu-1',
            usageDate: new Date('2026-10-21T04:44:00.000Z'), // Oct 21 IST
            source: 'conversation_turn',
            chargedMilli: 390,
            externalId: 'ext-turn-1'
          },
          {
            id: 'cu-2',
            usageDate: new Date('2026-10-21T03:30:00.000Z'), // Oct 21 IST
            source: 'outbound_media',
            chargedMilli: 50,
            externalId: 'ext-media-1'
          },
          {
            id: 'cu-3',
            usageDate: new Date('2026-10-20T10:00:00.000Z'), // Oct 20 IST
            source: 'conversation_turn',
            chargedMilli: 400,
            externalId: 'ext-turn-2'
          }
        ]);
      });

      let deductionCallCount = 0;
      walletTransactionFindMany.mockImplementation(() => {
        deductionCallCount++;
        if (deductionCallCount === 1) {
          // All deductions in range (260 + 0 + 280 = 540 milli)
          return Promise.resolve([
            { metadata: { aiCostMilli: 260 } },
            { metadata: { aiCostMilli: 0 } },
            { metadata: { aiCostMilli: 280 } }
          ]);
        }
        // Deductions on selected day
        return Promise.resolve([
          {
            metadata: {
              externalId: 'ext-turn-1',
              aiCostMilli: 260
            }
          },
          {
            metadata: {
              externalId: 'ext-media-1',
              aiCostMilli: 0
            }
          }
        ]);
      });

      const res = await fetch(`${baseUrl}/${VENDOR_1}?from=2026-10-18&to=2026-10-24&day=2026-10-21`);
      expect(res.status).toBe(200);
      const data: any = await res.json();

      expect(data.vendorId).toBe(VENDOR_1);
      expect(data.businessName).toBe('Annapoorna Foods');

      // Totals
      expect(data.totals.chargedMilli).toBe(840);
      expect(data.totals.openAiCostMilli).toBe(540);
      expect(data.totals.hasIncompleteCost).toBe(false);

      // bySource
      expect(data.bySource).toEqual([
        {
          source: 'conversation_turn',
          label: 'Customer replies',
          chargedMilli: 790,
          count: 2
        },
        {
          source: 'outbound_media',
          label: 'Product media',
          chargedMilli: 50,
          count: 1
        }
      ]);

      // byDay grouped by IST calendar day
      expect(data.byDay).toEqual([
        { day: '2026-10-21', chargedMilli: 440, count: 2 },
        { day: '2026-10-20', chargedMilli: 400, count: 1 }
      ]);

      // Selected day charges
      expect(data.selectedDay).toBe('2026-10-21');
      expect(data.charges).toHaveLength(2);
      expect(data.charges[0]).toEqual({
        id: 'cu-1',
        time: '2026-10-21T04:44:00.000Z',
        source: 'conversation_turn',
        sourceLabel: 'Customer replies',
        chargedMilli: 390,
        openAiCostMilli: 260 // Matched via externalId
      });
      expect(data.charges[1]).toEqual({
        id: 'cu-2',
        time: '2026-10-21T03:30:00.000Z',
        source: 'outbound_media',
        sourceLabel: 'Product media',
        chargedMilli: 50,
        openAiCostMilli: 0
      });
    });

    it('handles older ledger records without producing fabricated OpenAI costs', async () => {
      vendorFindUnique.mockResolvedValue({
        id: VENDOR_1,
        businessName: 'Annapoorna Foods'
      });

      creditUsageFindMany.mockImplementation((args: any) => {
        if (args?.take === 100) {
          return Promise.resolve([
            {
              id: 'cu-legacy',
              usageDate: new Date('2026-10-21T04:00:00.000Z'),
              source: 'conversation_turn',
              chargedMilli: 390,
              externalId: 'ext-legacy'
            }
          ]);
        }
        return Promise.resolve([
          {
            id: 'cu-legacy',
            usageDate: new Date('2026-10-21T04:00:00.000Z'),
            source: 'conversation_turn',
            chargedMilli: 390,
            externalId: 'ext-legacy'
          }
        ]);
      });

      // Deduction has NO aiCostMilli
      walletTransactionFindMany.mockResolvedValue([
        {
          metadata: {
            externalId: 'ext-legacy'
            // aiCostMilli is omitted/undefined
          }
        }
      ]);

      const res = await fetch(`${baseUrl}/${VENDOR_1}?from=2026-10-18&to=2026-10-24&day=2026-10-21`);
      expect(res.status).toBe(200);
      const data: any = await res.json();

      expect(data.totals.hasIncompleteCost).toBe(true);
      // openAiCostMilli is null, never fabricated
      expect(data.charges[0].openAiCostMilli).toBeNull();
    });

    it('rejects invalid day parameter format with HTTP 400', async () => {
      vendorFindUnique.mockResolvedValue({ id: VENDOR_1, businessName: 'Annapoorna' });

      const res = await fetch(`${baseUrl}/${VENDOR_1}?from=2026-10-18&to=2026-10-24&day=not-a-day`);
      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toBe('invalid_day_format');
    });

    it('caps selected-day charge inspection at 100 records', async () => {
      vendorFindUnique.mockResolvedValue({ id: VENDOR_1, businessName: 'Annapoorna' });

      creditUsageFindMany.mockImplementation((args: any) => {
        if (args?.take === 100) {
          const list = [];
          for (let i = 0; i < 100; i++) {
            list.push({
              id: `cu-${i}`,
              usageDate: new Date('2026-10-21T04:00:00.000Z'),
              source: 'conversation_turn',
              chargedMilli: 100,
              externalId: `ext-${i}`
            });
          }
          return Promise.resolve(list);
        }
        return Promise.resolve([]);
      });
      walletTransactionFindMany.mockResolvedValue([]);

      const res = await fetch(`${baseUrl}/${VENDOR_1}?from=2026-10-18&to=2026-10-24&day=2026-10-21`);
      expect(res.status).toBe(200);
      const data: any = await res.json();

      expect(creditUsageFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100
        })
      );
      expect(data.charges.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Source Labels', () => {
    it('formats known and unknown source labels correctly', () => {
      expect(formatSourceLabel('conversation_turn')).toBe('Customer replies');
      expect(formatSourceLabel('legacy_conversation_turn')).toBe('Customer replies');
      expect(formatSourceLabel('outbound_media')).toBe('Product media');
      expect(formatSourceLabel('catalog_import')).toBe('Catalog import');
      expect(formatSourceLabel('catalog_enhance')).toBe('Catalog enhancer');
      expect(formatSourceLabel('catalog_enhance_transcribe')).toBe('Catalog enhancer');
      expect(formatSourceLabel('sandbox_chat')).toBe('Sandbox');
      expect(formatSourceLabel('sandbox_transcribe')).toBe('Sandbox');
      expect(formatSourceLabel('brand_new_feature_source')).toBe('brand_new_feature_source');
    });
  });

  describe('CSV Export (/admin/usage?format=csv and /admin/usage/export)', () => {
    describe('escapeCsvCell', () => {
      it('returns plain string without quotes if no special characters', () => {
        expect(escapeCsvCell('Annapoorna')).toBe('Annapoorna');
        expect(escapeCsvCell(1234)).toBe('1234');
      });

      it('handles null and undefined', () => {
        expect(escapeCsvCell(null)).toBe('');
        expect(escapeCsvCell(undefined)).toBe('');
      });

      it('quotes string with comma', () => {
        expect(escapeCsvCell('Annapoorna, Inc.')).toBe('"Annapoorna, Inc."');
      });

      it('quotes and doubles internal quotes', () => {
        expect(escapeCsvCell('Sam\'s "Best" Groceries')).toBe('"Sam\'s ""Best"" Groceries"');
      });

      it('quotes string with newlines and carriage returns', () => {
        expect(escapeCsvCell('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
        expect(escapeCsvCell('Line 1\r\nLine 2')).toBe('"Line 1\r\nLine 2"');
      });
    });

    describe('formatUsageCsv', () => {
      it('formats empty vendor list with headers and CRLF line endings', () => {
        const csv = formatUsageCsv([], '2026-10-18', '2026-10-24');
        const lines = csv.split('\r\n');
        expect(lines[0]).toBe('Shop,Vendor ID,Charged (INR),Charges,Top Source,Date Range (IST)');
        expect(lines[1]).toBe('');
      });

      it('formats vendors with INR rupees and escaped fields', () => {
        const vendors = [
          {
            vendorId: 'vend-1',
            businessName: 'Annapoorna, Sweets & Bakery',
            chargedMilli: 840000, // ₹840.00
            count: 310,
            topSource: 'Customer replies'
          },
          {
            vendorId: 'vend-2',
            businessName: 'Super "Store"',
            chargedMilli: 390, // ₹0.39
            count: 1,
            topSource: 'Product media'
          }
        ];
        const csv = formatUsageCsv(vendors, '2026-10-18', '2026-10-24');
        const lines = csv.split('\r\n');
        expect(lines[0]).toBe('Shop,Vendor ID,Charged (INR),Charges,Top Source,Date Range (IST)');
        expect(lines[1]).toBe('"Annapoorna, Sweets & Bakery",vend-1,840.00,310,Customer replies,2026-10-18 to 2026-10-24');
        expect(lines[2]).toBe('"Super ""Store""",vend-2,0.39,1,Product media,2026-10-18 to 2026-10-24');
      });
    });

    describe('HTTP endpoint export behavior', () => {
      it('returns CSV on GET /admin/usage?format=csv with correct headers and attachment filename', async () => {
        creditUsageFindMany.mockResolvedValue([
          {
            vendorId: 'vend-1',
            source: 'conversation_turn',
            chargedMilli: 12500,
            vendor: { businessName: 'Annapoorna Store' }
          }
        ]);
        walletTransactionFindMany.mockResolvedValue([]);
        conversationCount.mockResolvedValue(5);

        const res = await fetch(`${baseUrl}?from=2026-10-18&to=2026-10-24&format=csv`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/csv');
        expect(res.headers.get('content-disposition')).toBe(
          'attachment; filename="chatlogix-usage-2026-10-18-to-2026-10-24.csv"'
        );

        const text = await res.text();
        const lines = text.split('\r\n');
        expect(lines[0]).toBe('Shop,Vendor ID,Charged (INR),Charges,Top Source,Date Range (IST)');
        expect(lines[1]).toBe('Annapoorna Store,vend-1,12.50,1,Customer replies,2026-10-18 to 2026-10-24');
      });

      it('returns CSV on GET /admin/usage/export with identical behavior', async () => {
        creditUsageFindMany.mockResolvedValue([
          {
            vendorId: 'vend-1',
            source: 'catalog_import',
            chargedMilli: 50000,
            vendor: { businessName: 'Sri Krishna' }
          }
        ]);
        walletTransactionFindMany.mockResolvedValue([]);
        conversationCount.mockResolvedValue(0);

        const res = await fetch(`${baseUrl}/export?from=2026-10-18&to=2026-10-24`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/csv');
        expect(res.headers.get('content-disposition')).toContain('chatlogix-usage-2026-10-18-to-2026-10-24.csv');

        const text = await res.text();
        expect(text).toContain('Sri Krishna,vend-1,50.00,1,Catalog import,2026-10-18 to 2026-10-24');
      });

      it('exports ALL matching vendors regardless of page or limit query parameters', async () => {
        // Create 3 vendors with charges
        creditUsageFindMany.mockResolvedValue([
          { vendorId: 'v1', source: 'conversation_turn', chargedMilli: 3000, vendor: { businessName: 'Vendor 1' } },
          { vendorId: 'v2', source: 'conversation_turn', chargedMilli: 2000, vendor: { businessName: 'Vendor 2' } },
          { vendorId: 'v3', source: 'conversation_turn', chargedMilli: 1000, vendor: { businessName: 'Vendor 3' } }
        ]);
        walletTransactionFindMany.mockResolvedValue([]);
        conversationCount.mockResolvedValue(0);

        // Call with limit=1, page=1
        const res = await fetch(`${baseUrl}?from=2026-10-18&to=2026-10-24&format=csv&limit=1&page=1`);
        expect(res.status).toBe(200);

        const text = await res.text();
        const lines = text.trim().split('\r\n');
        // Header + 3 vendor rows = 4 lines total
        expect(lines.length).toBe(4);
        expect(lines[1]).toContain('Vendor 1,v1,3.00');
        expect(lines[2]).toContain('Vendor 2,v2,2.00');
        expect(lines[3]).toContain('Vendor 3,v3,1.00');
      });

      it('handles empty data range by returning headers only with 200 OK', async () => {
        creditUsageFindMany.mockResolvedValue([]);
        walletTransactionFindMany.mockResolvedValue([]);
        conversationCount.mockResolvedValue(0);

        const res = await fetch(`${baseUrl}?from=2026-10-18&to=2026-10-24&format=csv`);
        expect(res.status).toBe(200);

        const text = await res.text();
        const lines = text.trim().split('\r\n');
        expect(lines.length).toBe(1);
        expect(lines[0]).toBe('Shop,Vendor ID,Charged (INR),Charges,Top Source,Date Range (IST)');
      });

      it('returns 400 when date range exceeds 31 calendar days', async () => {
        const res = await fetch(`${baseUrl}?from=2026-09-01&to=2026-10-20&format=csv`);
        expect(res.status).toBe(400);
        const data = (await res.json()) as { error: string };
        expect(data.error).toBe('range_exceeds_31_days');
      });
    });
  });
});
