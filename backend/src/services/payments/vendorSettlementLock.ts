import type { Prisma } from '@prisma/client';

/** Deterministic int32 for pg_advisory_xact_lock (same pattern as catalog commit). */
function hashToInt32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

export async function lockVendorForSettlement(
  tx: Prisma.TransactionClient,
  vendorId: string
): Promise<void> {
  const lockId = hashToInt32(`settlement:${vendorId}`);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId}::bigint)`;
}
