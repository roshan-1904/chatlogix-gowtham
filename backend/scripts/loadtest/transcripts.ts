/**
 * Dumps the conversations produced by a load-test run as readable transcripts.
 *
 * The per-language aggregates in report.ts tell you what a run cost and how
 * fast it was; this tells you what the assistant actually *said*. That is the
 * half of a preflight a human has to eyeball — whether the reply came back in
 * the customer's script, whether the product matched, whether the order was
 * created, and whether `contentEn` gives the vendor a usable English view.
 *
 * Usage:
 *   npm run loadtest:transcripts                  every conversation with messages
 *   npm run loadtest:transcripts -- --lang ta     one language
 *   npm run loadtest:transcripts -- --limit 3     first N conversations
 *   npm run loadtest:transcripts -- --summary     one line per conversation
 */
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { CUSTOMER_PHONE_PREFIX, MANIFEST_PATH, VENDOR_PHONE_PREFIX, type Manifest } from './config.js';

const prisma = new PrismaClient();

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const langFilter = argValue('--lang');
const limitArg = argValue('--limit');
const summaryOnly = process.argv.includes('--summary');

const RULE = '═'.repeat(100);
const THIN = '─'.repeat(100);

async function main(): Promise<void> {
  let languageByPhone = new Map<string, string>();
  if (existsSync(MANIFEST_PATH)) {
    const manifest: Manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
    languageByPhone = new Map(manifest.conversations.map((c) => [c.customerPhone, c.languageKey]));
  }

  const conversations = await prisma.conversation.findMany({
    where: {
      vendor: { phone: { startsWith: VENDOR_PHONE_PREFIX } },
      customer: { phone: { startsWith: CUSTOMER_PHONE_PREFIX } },
      messages: { some: {} }
    },
    select: {
      id: true,
      createdAt: true,
      aiPaused: true,
      customer: { select: { phone: true } },
      vendor: { select: { businessName: true } },
      messages: {
        orderBy: { timestamp: 'asc' },
        select: {
          senderType: true,
          content: true,
          contentEn: true,
          timestamp: true,
          aiCostUsd: true,
          aiPromptTokens: true,
          aiCompletionTokens: true,
          status: true,
          failureReason: true
        }
      },
      orders: {
        select: { orderNumber: true, status: true, totalAmount: true, items: true, deliveryAddress: true }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  const insights = await prisma.customerInsights.findMany({
    where: { vendor: { phone: { startsWith: VENDOR_PHONE_PREFIX } } },
    select: {
      preferredLanguage: true,
      customerName: true,
      deliveryAddress: true,
      primaryDeliveryAddress: true,
      currentOrder: true,
      customer: { select: { phone: true } }
    }
  });
  const insightByPhone = new Map(insights.map((i) => [i.customer.phone, i]));

  let filtered = conversations;
  if (langFilter) {
    filtered = filtered.filter((c) => languageByPhone.get(c.customer.phone) === langFilter);
  }
  if (limitArg) {
    filtered = filtered.slice(0, Number(limitArg));
  }

  if (filtered.length === 0) {
    console.log('No load-test conversations with messages found.');
    console.log(`Looked for vendors starting ${VENDOR_PHONE_PREFIX} and customers starting ${CUSTOMER_PHONE_PREFIX}.`);
    return;
  }

  console.log('');
  console.log(RULE);
  console.log(`LOAD TEST TRANSCRIPTS — ${filtered.length} conversation(s) with messages`);
  console.log(RULE);

  if (summaryOnly) {
    console.log('');
    console.log(
      'lang'.padEnd(13) + 'customer'.padEnd(14) + 'msgs'.padStart(5) + 'cust'.padStart(6) + 'asst'.padStart(6) +
        'contentEn'.padStart(11) + 'orders'.padStart(8) + 'detected'.padStart(10)
    );
    console.log(THIN);
    for (const c of filtered) {
      const lang = languageByPhone.get(c.customer.phone) ?? '?';
      const cust = c.messages.filter((m) => m.senderType === 'customer').length;
      const asst = c.messages.filter((m) => m.senderType === 'assistant').length;
      const withEn = c.messages.filter((m) => m.contentEn).length;
      console.log(
        lang.padEnd(13) +
          c.customer.phone.padEnd(14) +
          String(c.messages.length).padStart(5) +
          String(cust).padStart(6) +
          String(asst).padStart(6) +
          String(withEn).padStart(11) +
          String(c.orders.length).padStart(8) +
          (insightByPhone.get(c.customer.phone)?.preferredLanguage ?? '-').padStart(10)
      );
    }
    console.log('');
    return;
  }

  for (const c of filtered) {
    const lang = languageByPhone.get(c.customer.phone) ?? 'unknown';
    const insight = insightByPhone.get(c.customer.phone);

    console.log('');
    console.log(RULE);
    console.log(`${lang.toUpperCase()}   ${c.customer.phone}   ${c.vendor.businessName}`);
    console.log(
      `detected language: ${insight?.preferredLanguage ?? '-'}` +
        `   name: ${insight?.customerName ?? '-'}` +
        `   aiPaused: ${c.aiPaused}`
    );
    console.log(RULE);

    let turn = 0;
    for (const m of c.messages) {
      const isCustomer = m.senderType === 'customer';
      if (isCustomer) turn += 1;
      const who = isCustomer ? `CUSTOMER turn ${turn}` : 'ASSISTANT';
      console.log('');
      console.log(`  ${who}`);
      console.log(`    ${m.content}`);
      if (m.contentEn) {
        console.log(`    [en] ${m.contentEn}`);
      }
      if (!isCustomer && (m.aiPromptTokens || m.aiCompletionTokens)) {
        console.log(
          `    [tokens ${m.aiPromptTokens}/${m.aiCompletionTokens}  cost $${(m.aiCostUsd ?? 0).toFixed(5)}  status ${m.status}]`
        );
      }
      // On an unmocked run every assistant message is expected to be 'failed':
      // the reply generated fine, but the dispatcher could not deliver it to a
      // +999 number via the real Graph API. Printing the reason keeps that
      // distinguishable from a genuine pipeline failure.
      if (m.failureReason) {
        console.log(`    [failureReason] ${m.failureReason}`);
      }
    }

    if (c.orders.length > 0) {
      console.log('');
      console.log(`  ORDERS (${c.orders.length})`);
      for (const o of c.orders) {
        console.log(`    ${o.orderNumber}  ${o.status}  total ₹${(o.totalAmount / 100).toFixed(2)}`);
        console.log(`    items: ${JSON.stringify(o.items)}`);
        if (o.deliveryAddress) console.log(`    address: ${o.deliveryAddress}`);
      }
    } else {
      console.log('');
      console.log('  ORDERS: none created');
    }

    const address = insight?.primaryDeliveryAddress ?? insight?.deliveryAddress;
    if (address) {
      console.log(`  captured address: ${address}`);
    }
  }

  console.log('');
}

main()
  .catch((err) => {
    console.error('[transcripts] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
