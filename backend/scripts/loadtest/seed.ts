/**
 * Seeds load-test vendors, WhatsApp number mappings and multilingual catalogs,
 * then writes the run manifest (docs/LOAD_TESTING.md §6.3).
 *
 * Idempotent — safe to re-run. Customers are deliberately NOT pre-created: the
 * pipeline's own `ensureConversation` upsert should create them on turn 1, so
 * the run exercises that path. Cleanup still finds them, because the generator
 * derives customer phones deterministically from CUSTOMER_PHONE_PREFIX.
 *
 * Run: npm run loadtest:seed
 */
import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  LOADTEST_DIR,
  MANIFEST_PATH,
  VENDOR_COUNT,
  CUSTOMER_PHONE_PREFIX,
  VENDOR_PHONE_PREFIX,
  customerPhoneFor,
  phoneNumberIdFor,
  vendorPhoneFor,
  type Manifest,
  type ManifestConversation,
  type ManifestVendor
} from './config.js';
import { LANGUAGE_PROFILES, TOTAL_CONVERSATIONS, TOTAL_MESSAGES } from './fixtures/languages.js';
import { SEED_PRODUCTS, keywordsFor } from './fixtures/catalog.js';

const prisma = new PrismaClient();

/**
 * Generous on purpose. `canProcessMessage` rejects any vendor whose balance
 * cannot cover a worst-case assistant turn at their markup (~414 milli at the
 * default 50%), and a guard rejection would make every message take the
 * `guard_no_credit` path and never reach an LLM — the run would look healthy
 * and measure nothing. ₹10,000 buys ~24,000 turns, far past the 1,000-message
 * ramp.
 */
const WALLET_BALANCE_MILLI = 10_000_000;

async function seedVendor(index: number): Promise<ManifestVendor> {
  const phone = vendorPhoneFor(index);
  const phoneNumberId = phoneNumberIdFor(index);
  const businessName = `Loadtest Bakery ${String(index).padStart(2, '0')}`;

  const vendor = await prisma.vendor.upsert({
    where: { phone },
    update: {
      // Reset the things a previous run may have drained or changed.
      walletBalanceMilli: WALLET_BALANCE_MILLI,
      registrationStatus: 'approved',
      trialExpiresAt: null
    },
    create: {
      businessName,
      phone,
      email: `loadtest-${index}@example.invalid`,
      subscriptionPlan: 'starter',
      subscriptionStatus: 'active',
      registrationStatus: 'approved',
      walletBalanceMilli: WALLET_BALANCE_MILLI,
      // Leave aiModel on its gpt-4.1-mini default so the run measures the
      // production model rather than an override.
      aiBotName: 'Loadtest Assistant',
      category: 'bakery',
      orderPrefix: `LT${String(index).padStart(2, '0')}`,
      timezone: 'Asia/Kolkata'
    },
    select: { id: true, businessName: true, phone: true }
  });

  await prisma.whatsAppNumber.upsert({
    where: { phoneNumberId },
    update: { vendorId: vendor.id },
    create: {
      vendorId: vendor.id,
      phoneNumberId,
      wabaId: `LOADTEST-WABA-${String(index).padStart(3, '0')}`
    }
  });

  for (const product of SEED_PRODUCTS) {
    await prisma.product.upsert({
      where: { vendorId_name: { vendorId: vendor.id, name: product.name } },
      update: {
        keywords: keywordsFor(product),
        basePrice: product.basePrice,
        isActive: true,
        inStock: true
      },
      create: {
        vendorId: vendor.id,
        name: product.name,
        category: product.category,
        basePrice: product.basePrice,
        baseUnit: product.baseUnit,
        baseQuantity: product.baseQuantity,
        keywords: keywordsFor(product),
        isActive: true,
        inStock: true
      }
    });
  }

  return { id: vendor.id, businessName: vendor.businessName, phone: vendor.phone, phoneNumberId };
}

/**
 * Expands the language distribution into 200 concrete conversations, spreading
 * each language across all vendors so no single vendor carries one script.
 * That matters for the product matcher's per-vendor AI rate limit
 * (productMatcher.ts:102-104).
 */
function planConversations(vendors: ManifestVendor[]): ManifestConversation[] {
  const conversations: ManifestConversation[] = [];
  let index = 0;

  for (const profile of LANGUAGE_PROFILES) {
    for (let n = 0; n < profile.conversations; n += 1) {
      const vendor = vendors[index % vendors.length]!;
      conversations.push({
        index,
        languageKey: profile.key,
        expectedDetection: profile.expectedDetection,
        expectsTranslation: profile.expectsTranslation,
        customerPhone: customerPhoneFor(index),
        vendorId: vendor.id,
        phoneNumberId: vendor.phoneNumberId,
        turns: [...profile.turns]
      });
      index += 1;
    }
  }

  return conversations;
}

async function main(): Promise<void> {
  console.log(`[seed] creating ${VENDOR_COUNT} vendors, ${SEED_PRODUCTS.length} products each`);

  const vendors: ManifestVendor[] = [];
  for (let i = 0; i < VENDOR_COUNT; i += 1) {
    const vendor = await seedVendor(i);
    vendors.push(vendor);
    console.log(`[seed]   ${vendor.phone}  ${vendor.phoneNumberId}  ${vendor.id}`);
  }

  const conversations = planConversations(vendors);

  const manifest: Manifest = {
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    vendorPhonePrefix: VENDOR_PHONE_PREFIX,
    customerPhonePrefix: CUSTOMER_PHONE_PREFIX,
    vendors,
    conversations
  };

  await mkdir(LOADTEST_DIR, { recursive: true });
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const byLanguage = new Map<string, number>();
  for (const c of conversations) {
    byLanguage.set(c.languageKey, (byLanguage.get(c.languageKey) ?? 0) + 1);
  }

  console.log('');
  console.log(`[seed] runId        ${manifest.runId}`);
  console.log(`[seed] manifest     ${MANIFEST_PATH}`);
  console.log(`[seed] conversations ${TOTAL_CONVERSATIONS}  messages ${TOTAL_MESSAGES}`);
  console.log('[seed] distribution:');
  for (const [key, count] of byLanguage) {
    console.log(`[seed]   ${key.padEnd(12)} ${count}`);
  }
  console.log('');
  console.log('[seed] next: start the mocks, then run the preflight');
  console.log('[seed]   npm run loadtest:mock-meta');
  console.log('[seed]   npm run loadtest:llm-proxy');
  console.log('[seed]   npm run loadtest:generate -- --preflight');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
