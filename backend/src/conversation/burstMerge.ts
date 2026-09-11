import { getRedisClient } from '../utils/redis.js';
import { DEFAULT_LOCK_TTL_MS } from './lock.js';

/**
 * Groups same-SQS-batch records by vendorId+customerPhone and concatenates
 * each group's content in chronological order (spec §12 rule 1). Pure,
 * synchronous, no I/O.
 *
 * Dormant at launch: SQS batch size is 1 until "after soak" (§7 step 0's
 * table), so a batch never actually contains two records for the same
 * conversation yet -- this function is exercised once batch size is raised.
 * The active mechanism at launch is the debounce pair below (rule 2).
 */
export function mergeSameBatch(
  records: Array<{ vendorId: string; customerPhone: string; content: string; timestamp: string }>
): Map<string, string> {
  const groups = new Map<string, Array<{ content: string; timestamp: string }>>();

  for (const record of records) {
    const key = `${record.vendorId}:${record.customerPhone}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push({ content: record.content, timestamp: record.timestamp });
    } else {
      groups.set(key, [{ content: record.content, timestamp: record.timestamp }]);
    }
  }

  const merged = new Map<string, string>();
  for (const [key, items] of groups) {
    const sorted = [...items].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    merged.set(key, sorted.map((i) => i.content).join('\n'));
  }

  return merged;
}

export interface BurstStashEntry {
  whatsappMessageId: string;
  content: string;
}

function burstKey(conversationId: string): string {
  return `burst:${conversationId}`;
}

/** Align stash lifetime with the conversation lock so siblings can merge. */
export const BURST_STASH_TTL_MS = DEFAULT_LOCK_TTL_MS;

/**
 * Called by an invocation that FAILED to acquire the conversation lock while
 * another invocation is already processing this conversation. Appends this
 * message to a Redis list for the lock-holder to drain via
 * `collectCoalescedInbound` (also backed by Postgres for durability).
 *
 * Returns true when the stash succeeded — the caller should ACK the SQS
 * message instead of retrying, because the lock-holder will answer for both.
 */
export async function stashForBurstMerge(
  conversationId: string,
  whatsappMessageId: string,
  content: string,
  capMs = BURST_STASH_TTL_MS
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  const payload = JSON.stringify({ whatsappMessageId, content } satisfies BurstStashEntry);
  const key = burstKey(conversationId);
  await client.rpush(key, payload);
  await client.pexpire(key, capMs);
  return true;
}

/**
 * Drains and clears any sibling messages stashed during lock contention.
 */
export async function drainBurstStash(conversationId: string): Promise<BurstStashEntry[]> {
  const client = getRedisClient();
  if (!client) return [];

  const key = burstKey(conversationId);
  const raw = await client.lrange(key, 0, -1);
  if (!raw.length) return [];

  await client.del(key);

  const entries: BurstStashEntry[] = [];
  for (const item of raw) {
    try {
      const parsed = JSON.parse(item) as BurstStashEntry;
      if (parsed.whatsappMessageId && parsed.content) {
        entries.push(parsed);
      }
    } catch {
      // ignore corrupt stash entries
    }
  }
  return entries;
}

/**
 * @deprecated Use `collectCoalescedInbound` — kept for tests migrating off the
 * single-key 400ms stash.
 */
export async function mergeDebounced(conversationId: string, content: string): Promise<string> {
  const stashed = await drainBurstStash(conversationId);
  if (!stashed.length) return content;
  const tail = stashed.map((entry) => entry.content).join('\n');
  return `${content}\n${tail}`;
}
