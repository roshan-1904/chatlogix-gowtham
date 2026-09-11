/**
 * Shared constants and manifest types for the load-test harness
 * (docs/LOAD_TESTING.md §6).
 *
 * The two phone prefixes are the cleanup contract: every row the harness
 * creates is reachable from a vendor or customer whose phone starts with one of
 * them, and everything else cascades (Conversation, Message, Order,
 * MessageProcessing, CreditUsage, WalletTransaction and CustomerInsights all
 * declare onDelete: Cascade against Vendor or Customer in schema.prisma).
 */
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';

// These scripts construct PrismaClient directly rather than importing
// src/db/prisma.ts (which would pull in config/env.ts and require the full
// pipeline env just to run a report). @prisma/client does NOT read .env on its
// own — only the Prisma CLI does — so load it here. config.ts is imported by
// every script that touches the database or the webhook, so this is the one
// place that covers them all.
for (const candidate of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', 'backend', '.env')
]) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}

/**
 * Both prefixes use country code +999, which ITU-T E.164 leaves UNASSIGNED.
 *
 * This is a safety property, not a cosmetic choice. The earlier values were
 * `+919800` and `+919900` — those are live Indian mobile ranges, so a synthetic
 * customer could have collided with a real subscriber. If the response
 * dispatcher ever runs against the real Graph API (i.e. WHATSAPP_GRAPH_BASE_URL
 * is not pointed at the mock), it would have sent real WhatsApp messages to a
 * stranger. +999 cannot route to any subscriber anywhere.
 *
 * Do not "fix" these to look like realistic Indian numbers.
 */
/** Vendors created by seed.ts. */
export const VENDOR_PHONE_PREFIX = '+99910';
/** Customers created implicitly by the pipeline when the generator sends turn 1. */
export const CUSTOMER_PHONE_PREFIX = '+99900';

export const VENDOR_COUNT = 10;

export const LOADTEST_DIR = path.resolve(process.env.LOADTEST_DIR || path.join(process.cwd(), '.loadtest'));
export const MANIFEST_PATH = path.join(LOADTEST_DIR, 'manifest.json');
export const RESULT_PATH = path.join(LOADTEST_DIR, 'report.json');
export const POOL_SAMPLES_PATH = path.join(LOADTEST_DIR, 'pool-samples.jsonl');
export const SENT_LOG_PATH = path.join(LOADTEST_DIR, 'sent.jsonl');

export interface ManifestVendor {
  id: string;
  businessName: string;
  phone: string;
  phoneNumberId: string;
}

export interface ManifestConversation {
  /** 0-based index across all 200 conversations. */
  index: number;
  languageKey: string;
  expectedDetection: string;
  expectsTranslation: boolean;
  customerPhone: string;
  vendorId: string;
  phoneNumberId: string;
  turns: string[];
}

export interface Manifest {
  runId: string;
  createdAt: string;
  vendorPhonePrefix: string;
  customerPhonePrefix: string;
  vendors: ManifestVendor[];
  conversations: ManifestConversation[];
}

/** Deterministic so cleanup can find customers even if a run dies mid-flight. */
export function customerPhoneFor(index: number): string {
  return `${CUSTOMER_PHONE_PREFIX}${String(index).padStart(4, '0')}`;
}

export function vendorPhoneFor(index: number): string {
  return `${VENDOR_PHONE_PREFIX}${String(index).padStart(4, '0')}`;
}

export function phoneNumberIdFor(index: number): string {
  return `LOADTEST-PN-${String(index).padStart(3, '0')}`;
}
