import { prisma } from '../../db/prisma.js';

/**
 * Picks which of a vendor's WhatsAppNumber rows outbound sends should go out on.
 *
 * Before P2h a vendor had at most one row, so every call site did
 * `findFirst({ where: { vendorId }, orderBy: { createdAt: 'desc' } })` and
 * newest-wins was safe. P2h writes `error`/`disconnected` rows too, so a failed
 * connect attempt can be the newest row while the vendor's working number is
 * older — newest-wins would then send on a dead number.
 */

/** Superset of the fields the ranking reads; every call site selects these. */
export type VendorSendingNumberCandidate = {
  phoneNumberId: string;
  connectStatus: string | null;
  accessTokenEncrypted: string | null;
  createdAt: Date;
};

export const VENDOR_SENDING_NUMBER_SELECT = {
  phoneNumberId: true,
  connectStatus: true,
  accessTokenEncrypted: true,
  createdAt: true
} as const;

/** P2h rows that finished connect and can actually send. */
const SENDABLE_STATUSES = new Set(['live', 'credit_attached']);

/** P2h rows that cannot send; only ever picked when nothing better exists. */
const BROKEN_STATUSES = new Set(['error', 'disconnected']);

const TIER_SENDABLE = 0;
/** Pre-P2h Ibell/Lush shape: no connectStatus, sends on the global token. */
const TIER_LEGACY = 1;
/** `meta_in_progress` and any status added later — may or may not work. */
const TIER_UNPROVEN = 2;
const TIER_BROKEN = 3;

function tierOf(row: VendorSendingNumberCandidate): number {
  const status = row.connectStatus ?? null;
  if (status && SENDABLE_STATUSES.has(status)) return TIER_SENDABLE;
  if (!status && !row.accessTokenEncrypted) return TIER_LEGACY;
  if (status && BROKEN_STATUSES.has(status)) return TIER_BROKEN;
  return TIER_UNPROVEN;
}

/**
 * Best sending row out of an already-loaded set, newest-first within a tier so
 * a vendor holding a single legacy row keeps the pre-P2h result.
 */
export function pickVendorSendingNumber<T extends VendorSendingNumberCandidate>(
  rows: readonly T[]
): T | null {
  let best: T | null = null;
  let bestTier = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    const tier = tierOf(row);
    if (tier < bestTier || (tier === bestTier && best !== null && row.createdAt > best.createdAt)) {
      best = row;
      bestTier = tier;
    }
  }

  return best;
}

export async function resolveVendorSendingNumber(
  vendorId: string
): Promise<VendorSendingNumberCandidate | null> {
  const rows = await prisma.whatsAppNumber.findMany({
    where: { vendorId },
    select: VENDOR_SENDING_NUMBER_SELECT
  });
  return pickVendorSendingNumber(rows);
}

export async function resolveVendorSendingPhoneNumberId(
  vendorId: string
): Promise<string | undefined> {
  const row = await resolveVendorSendingNumber(vendorId);
  return row?.phoneNumberId;
}
