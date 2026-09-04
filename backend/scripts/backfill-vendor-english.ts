/**
 * Backfill English vendor-display fields for existing rows.
 *
 * Usage:
 *   npm run backfill:vendor-english -- [--dry-run] [--batch-size=100]
 */

import { PrismaClient } from '@prisma/client';
import { needsEnglish, toVendorEnglish } from '../src/utils/vendorEnglish.js';

const prisma = new PrismaClient();

function parseArgs(): { dryRun: boolean; batchSize: number } {
  const args = process.argv.slice(2);
  let dryRun = false;
  let batchSize = 100;
  for (const arg of args) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--batch-size=')) {
      const n = Number.parseInt(arg.split('=')[1] ?? '', 10);
      if (Number.isFinite(n) && n > 0) batchSize = n;
    }
  }
  return { dryRun, batchSize };
}

async function backfillMessages(dryRun: boolean, batchSize: number): Promise<number> {
  let updated = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.message.findMany({
      where: { OR: [{ contentEn: null }, { contentEn: '' }] },
      select: { id: true, content: true },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      if (!needsEnglish(row.content)) continue;
      const contentEn = await toVendorEnglish(row.content);
      if (!contentEn || contentEn === row.content.trim()) continue;

      if (dryRun) {
        console.log(`[dry-run] Message ${row.id}: contentEn="${contentEn.slice(0, 80)}..."`);
      } else {
        await prisma.message.update({
          where: { id: row.id },
          data: { contentEn }
        });
      }
      updated += 1;
    }

    cursor = batch[batch.length - 1]?.id;
    console.log(`Messages batch done — ${updated} updated so far`);
  }

  return updated;
}

async function backfillCustomerInsights(dryRun: boolean, batchSize: number): Promise<number> {
  let updated = 0;
  let cursor: string | undefined;
  const fields = ['customerName', 'deliveryAddress', 'primaryDeliveryAddress'] as const;

  for (;;) {
    const batch = await prisma.customerInsights.findMany({
      select: {
        id: true,
        customerName: true,
        deliveryAddress: true,
        primaryDeliveryAddress: true
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      const data: Partial<Record<(typeof fields)[number], string>> = {};

      for (const field of fields) {
        const value = row[field];
        if (!value || !needsEnglish(value)) continue;
        const english = await toVendorEnglish(value);
        if (english && english !== value.trim()) {
          data[field] = english;
        }
      }

      if (Object.keys(data).length === 0) continue;

      if (dryRun) {
        console.log(`[dry-run] CustomerInsights ${row.id}:`, data);
      } else {
        await prisma.customerInsights.update({ where: { id: row.id }, data });
      }
      updated += 1;
    }

    cursor = batch[batch.length - 1]?.id;
    console.log(`CustomerInsights batch done — ${updated} updated so far`);
  }

  return updated;
}

async function backfillOrders(dryRun: boolean, batchSize: number): Promise<number> {
  let updated = 0;
  let cursor: string | undefined;
  const fields = ['deliveryAddress', 'specialRequests', 'deliveryInstructions'] as const;

  for (;;) {
    const batch = await prisma.order.findMany({
      select: {
        id: true,
        deliveryAddress: true,
        specialRequests: true,
        deliveryInstructions: true
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      const data: Partial<Record<(typeof fields)[number], string>> = {};

      for (const field of fields) {
        const value = row[field];
        if (!value || !needsEnglish(value)) continue;
        const english = await toVendorEnglish(value);
        if (english && english !== value.trim()) {
          data[field] = english;
        }
      }

      if (Object.keys(data).length === 0) continue;

      if (dryRun) {
        console.log(`[dry-run] Order ${row.id}:`, data);
      } else {
        await prisma.order.update({ where: { id: row.id }, data });
      }
      updated += 1;
    }

    cursor = batch[batch.length - 1]?.id;
    console.log(`Orders batch done — ${updated} updated so far`);
  }

  return updated;
}

async function main(): Promise<void> {
  const { dryRun, batchSize } = parseArgs();
  console.log(`Starting vendor-English backfill (dryRun=${dryRun}, batchSize=${batchSize})`);

  const messageCount = await backfillMessages(dryRun, batchSize);
  const insightsCount = await backfillCustomerInsights(dryRun, batchSize);
  const orderCount = await backfillOrders(dryRun, batchSize);

  console.log('\nBackfill complete:');
  console.log(`- Messages contentEn: ${messageCount}`);
  console.log(`- CustomerInsights rows: ${insightsCount}`);
  console.log(`- Order rows: ${orderCount}`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
