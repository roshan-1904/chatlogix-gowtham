import { getRedisClient } from '../utils/redis.js';

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

function burstKey(conversationId: string): string {
  return `burst:${conversationId}`;
}

/**
 * Called by an invocation that FAILED to acquire the conversation lock
 * (spec §12 rule 2/4: a sibling invocation is already processing this
 * conversation) -- stashes this message's content, short-TTL, for the
 * lock-holder to pick up via mergeDebounced before it gives up and lets its
 * own SQS message retry normally. Best-effort: if Redis is unavailable, the
 * message still gets a normal SQS retry either way, it just won't merge.
 */
export async function stashForBurstMerge(conversationId: string, content: string, capMs = 400): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  await client.set(burstKey(conversationId), content, 'PX', capMs);
}

/**
 * Called by the invocation that HOLDS the lock, immediately after acquiring
 * it: a single, non-blocking check for content a sibling invocation already
 * stashed (spec §12 rule 2). Never waits -- rule 3 is explicit that nothing
 * pending means proceed immediately with just this message's own content.
 */
export async function mergeDebounced(conversationId: string, content: string): Promise<string> {
  const client = getRedisClient();
  if (!client) return content;

  const key = burstKey(conversationId);
  const pending = await client.get(key);
  if (!pending) return content;

  await client.del(key);
  return `${content}\n${pending}`;
}
