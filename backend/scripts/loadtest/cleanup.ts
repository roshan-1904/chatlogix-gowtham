/**
 * Removes load-test data (docs/LOAD_TESTING.md §6.4).
 *
 * Dry-run by default — pass --confirm to actually delete.
 *
 * Almost everything cascades: Conversation, Order, CreditUsage,
 * MessageProcessing, CustomerInsights, WalletTransaction, WhatsAppNumber and
 * Product all declare onDelete: Cascade against Vendor, and Message /
 * ConversationMemory cascade from Conversation. So deleting the test vendors
 * and the test customers is sufficient — the explicit counts below exist to
 * report what went, not because each needs its own delete.
 *
 * Usage:
 *   npm run loadtest:cleanup                    dry run
 *   npm run loadtest:cleanup -- --confirm       delete everything
 *   npm run loadtest:cleanup -- --confirm --keep-vendors
 *                                               delete conversation data but keep
 *                                               vendors, catalogs and numbers, and
 *                                               top the wallets back up. Use this
 *                                               between ramp steps so each run
 *                                               starts from the same baseline
 *                                               without a full re-seed.
 */
import { PrismaClient } from '@prisma/client';
import { CUSTOMER_PHONE_PREFIX, VENDOR_PHONE_PREFIX } from './config.js';

const prisma = new PrismaClient();

const confirm = process.argv.includes('--confirm');
const keepVendors = process.argv.includes('--keep-vendors');

const WALLET_TOPUP_PAISE = 1_000_000;

const vendorWhere = { phone: { startsWith: VENDOR_PHONE_PREFIX } };
const customerWhere = { phone: { startsWith: CUSTOMER_PHONE_PREFIX } };
/** Anything hanging off a test vendor, regardless of which customer it involves. */
const byVendor = { vendor: vendorWhere };
const byVendorConversation = { conversation: { vendor: vendorWhere } };

async function counts(): Promise<Record<string, number>> {
  const [
    vendors,
    customers,
    whatsAppNumbers,
    products,
    conversations,
    messages,
    messageProcessing,
    orders,
    creditUsage,
    walletTransactions,
    customerInsights,
    conversationMemory
  ] = await Promise.all([
    prisma.vendor.count({ where: vendorWhere }),
    prisma.customer.count({ where: customerWhere }),
    prisma.whatsAppNumber.count({ where: byVendor }),
    prisma.product.count({ where: byVendor }),
    prisma.conversation.count({ where: byVendor }),
    prisma.message.count({ where: byVendorConversation }),
    prisma.messageProcessing.count({ where: byVendor }),
    prisma.order.count({ where: byVendor }),
    prisma.creditUsage.count({ where: byVendor }),
    prisma.walletTransaction.count({ where: byVendor }),
    prisma.customerInsights.count({ where: byVendor }),
    prisma.conversationMemory.count({ where: { conversation: { vendor: vendorWhere } } })
  ]);

  return {
    vendors,
    customers,
    whatsAppNumbers,
    products,
    conversations,
    messages,
    messageProcessing,
    orders,
    creditUsage,
    walletTransactions,
    customerInsights,
    conversationMemory
  };
}

function report(label: string, rows: Record<string, number>): void {
  console.log(`[cleanup] ${label}`);
  const width = Math.max(...Object.keys(rows).map((k) => k.length));
  for (const [key, value] of Object.entries(rows)) {
    console.log(`[cleanup]   ${key.padEnd(width)}  ${value}`);
  }
}

async function main(): Promise<void> {
  console.log(`[cleanup] vendor prefix   ${VENDOR_PHONE_PREFIX}`);
  console.log(`[cleanup] customer prefix ${CUSTOMER_PHONE_PREFIX}`);
  console.log('');

  const before = await counts();
  report('rows currently matching:', before);
  console.log('');

  if (!confirm) {
    console.log('[cleanup] DRY RUN — nothing deleted. Re-run with --confirm to delete.');
    if (keepVendors) {
      console.log('[cleanup] --keep-vendors would preserve vendors, numbers, products; wallets reset to ' + WALLET_TOPUP_PAISE);
    }
    return;
  }

  // Deleting customers takes their conversations (and every message, order and
  // memory beneath them) with it. Do this first either way, so --keep-vendors
  // and the full path share one code route.
  const deletedCustomers = await prisma.customer.deleteMany({ where: customerWhere });
  console.log(`[cleanup] deleted ${deletedCustomers.count} customers (conversations, messages, orders cascade)`);

  if (keepVendors) {
    // A conversation started by a non-test customer against a test vendor
    // would survive the delete above; clear those too so the baseline is clean.
    const strays = await prisma.conversation.deleteMany({ where: byVendor });
    if (strays.count > 0) {
      console.log(`[cleanup] deleted ${strays.count} stray conversations still attached to test vendors`);
    }

    const toppedUp = await prisma.vendor.updateMany({
      where: vendorWhere,
      data: { walletBalance: WALLET_TOPUP_PAISE, registrationStatus: 'approved', trialExpiresAt: null }
    });
    console.log(`[cleanup] kept ${toppedUp.count} vendors, wallets reset to ${WALLET_TOPUP_PAISE} paise`);
  } else {
    const deletedVendors = await prisma.vendor.deleteMany({ where: vendorWhere });
    console.log(`[cleanup] deleted ${deletedVendors.count} vendors (numbers, products, wallet rows cascade)`);
  }

  console.log('');
  const after = await counts();
  report('rows remaining:', after);

  const leftovers = Object.entries(after).filter(([key, value]) => {
    if (keepVendors && ['vendors', 'whatsAppNumbers', 'products'].includes(key)) return false;
    return value > 0;
  });

  if (leftovers.length > 0) {
    console.warn('');
    console.warn('[cleanup] WARNING: some rows survived — a cascade may be missing:');
    for (const [key, value] of leftovers) {
      console.warn(`[cleanup]   ${key} = ${value}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('[cleanup] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
