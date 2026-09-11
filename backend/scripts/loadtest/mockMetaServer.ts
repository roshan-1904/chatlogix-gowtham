/**
 * Mock WhatsApp Graph API for load testing (docs/LOAD_TESTING.md §6.1).
 *
 * Stands in for graph.facebook.com so a load test can drive the real pipeline
 * without sending real WhatsApp messages. Point BOTH Graph base URLs at it:
 *
 *   WHATSAPP_GRAPH_BASE_URL=http://localhost:8081/v18.0
 *   WHATSAPP_TYPING_GRAPH_BASE_URL=http://localhost:8081/v21.0
 *
 * Deliberately behaves like Meta rather than like a happy stub: it enforces a
 * per-number throughput cap (the Cloud API default is 80 msg/s) and can inject
 * 429s and 5xx. That matters because `services/whatsappClient.ts#postToGraph`
 * has no retry and no rate limiter — a throttle throws and SQS redelivers, and
 * we want to observe that under load rather than discover it in production.
 *
 * Standalone on purpose: no imports from src/, so it boots without DATABASE_URL
 * or any other pipeline env.
 *
 * Run: npm run loadtest:mock-meta
 */
import express from 'express';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.MOCK_META_PORT || '8081');
/** Per-phoneNumberId sends per second. 0 disables the cap. Meta's default is 80. */
const SEND_RATE_LIMIT = Number(process.env.MOCK_META_SEND_RATE_LIMIT || '80');
/** Probability [0,1] of returning a synthetic 500, independent of the rate cap. */
const ERROR_RATE = Number(process.env.MOCK_META_ERROR_RATE || '0');
/** Probability [0,1] of returning a synthetic 429, independent of the rate cap. */
const THROTTLE_RATE = Number(process.env.MOCK_META_THROTTLE_RATE || '0');
/** Artificial delay per request, to model Meta's own latency. */
const LATENCY_MS = Number(process.env.MOCK_META_LATENCY_MS || '0');
const LOG_PATH = path.resolve(
  process.env.MOCK_META_LOG || path.join(process.cwd(), '.loadtest', 'meta-sends.jsonl')
);

interface SendRecord {
  at: string;
  kind: 'send' | 'typing';
  phoneNumberId: string;
  to?: string;
  type?: string;
  text?: string;
  wamid?: string;
  /** Set only when we rejected the call. */
  rejectedWith?: number;
  contextMessageId?: string;
}

const stats = {
  startedAt: new Date().toISOString(),
  sends: 0,
  typing: 0,
  throttled429: 0,
  errored500: 0,
  malformed: 0
};

/** Sliding one-second window of send timestamps, keyed by phoneNumberId. */
const sendWindows = new Map<string, number[]>();

function overRateLimit(phoneNumberId: string): boolean {
  if (SEND_RATE_LIMIT <= 0) return false;
  const now = Date.now();
  const cutoff = now - 1000;
  const window = (sendWindows.get(phoneNumberId) ?? []).filter((t) => t > cutoff);
  if (window.length >= SEND_RATE_LIMIT) {
    sendWindows.set(phoneNumberId, window);
    return true;
  }
  window.push(now);
  sendWindows.set(phoneNumberId, window);
  return false;
}

let logQueue: Promise<void> = Promise.resolve();
function log(record: SendRecord): void {
  // Serialize appends so concurrent requests can't interleave partial lines.
  logQueue = logQueue
    .then(() => appendFile(LOG_PATH, `${JSON.stringify(record)}\n`, 'utf8'))
    .catch((err) => {
      console.error('[mock-meta] failed to write send log:', err);
    });
}

function makeWamid(): string {
  return `wamid.MOCK.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
}

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/_loadtest/stats', (_req, res) => {
  res.json({ ...stats, logPath: LOG_PATH, config: { SEND_RATE_LIMIT, ERROR_RATE, THROTTLE_RATE, LATENCY_MS } });
});

app.post('/_loadtest/reset', (_req, res) => {
  stats.sends = 0;
  stats.typing = 0;
  stats.throttled429 = 0;
  stats.errored500 = 0;
  stats.malformed = 0;
  stats.startedAt = new Date().toISOString();
  sendWindows.clear();
  res.json({ ok: true });
});

/**
 * Matches both `${BASE_URL}/${phoneNumberId}/messages` shapes, since the two
 * configured base URLs carry different API versions (v18.0 for sends, v21.0
 * for the typing indicator).
 */
app.post('/:version/:phoneNumberId/messages', async (req, res) => {
  if (LATENCY_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
  }

  const { phoneNumberId } = req.params;
  const body = req.body ?? {};

  // The typing indicator posts `status: 'read'` with a typing_indicator block
  // (whatsappClient.ts:87-92) rather than a message payload.
  const isTyping = body.status === 'read' || Boolean(body.typing_indicator);

  if (isTyping) {
    stats.typing += 1;
    log({
      at: new Date().toISOString(),
      kind: 'typing',
      phoneNumberId,
      contextMessageId: body.message_id
    });
    return res.json({ success: true });
  }

  if (body.messaging_product !== 'whatsapp' || !body.to) {
    stats.malformed += 1;
    return res.status(400).json({
      error: { message: 'Mock: expected messaging_product=whatsapp and a `to` field', type: 'GraphMethodException', code: 100 }
    });
  }

  if (THROTTLE_RATE > 0 && Math.random() < THROTTLE_RATE) {
    stats.throttled429 += 1;
    log({ at: new Date().toISOString(), kind: 'send', phoneNumberId, to: body.to, rejectedWith: 429 });
    return res.status(429).json({
      error: { message: 'Mock: injected rate limit', type: 'OAuthException', code: 130429 }
    });
  }

  if (ERROR_RATE > 0 && Math.random() < ERROR_RATE) {
    stats.errored500 += 1;
    log({ at: new Date().toISOString(), kind: 'send', phoneNumberId, to: body.to, rejectedWith: 500 });
    return res.status(500).json({
      error: { message: 'Mock: injected server error', type: 'GraphMethodException', code: 1 }
    });
  }

  if (overRateLimit(phoneNumberId)) {
    stats.throttled429 += 1;
    log({ at: new Date().toISOString(), kind: 'send', phoneNumberId, to: body.to, rejectedWith: 429 });
    return res.status(429).json({
      error: {
        message: `Mock: exceeded ${SEND_RATE_LIMIT} msg/s for phone_number_id ${phoneNumberId}`,
        type: 'OAuthException',
        code: 130429
      }
    });
  }

  const wamid = makeWamid();
  stats.sends += 1;
  log({
    at: new Date().toISOString(),
    kind: 'send',
    phoneNumberId,
    to: body.to,
    type: body.type,
    // Captured so the report can verify replies came back in the right script.
    text: body.text?.body ?? body.interactive?.body?.text,
    wamid
  });

  // Shape must match Meta's: postToGraph throws if messages[0].id is missing
  // (whatsappClient.ts:30-32).
  return res.json({
    messaging_product: 'whatsapp',
    contacts: [{ input: body.to, wa_id: String(body.to).replace(/\D/g, '') }],
    messages: [{ id: wamid, message_status: 'accepted' }]
  });
});

app.use((req, res) => {
  console.warn(`[mock-meta] unmatched ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: { message: 'Mock: no such Graph route', code: 404 } });
});

async function main(): Promise<void> {
  await mkdir(path.dirname(LOG_PATH), { recursive: true });
  app.listen(PORT, () => {
    console.log(`[mock-meta] listening on http://localhost:${PORT}`);
    console.log(`[mock-meta] send log: ${LOG_PATH}`);
    console.log(`[mock-meta] rate limit: ${SEND_RATE_LIMIT || 'disabled'} msg/s per phone_number_id`);
    if (ERROR_RATE > 0 || THROTTLE_RATE > 0) {
      console.log(`[mock-meta] injection: ${THROTTLE_RATE * 100}% 429, ${ERROR_RATE * 100}% 500`);
    }
    console.log('[mock-meta] point the pipeline at:');
    console.log(`  WHATSAPP_GRAPH_BASE_URL=http://localhost:${PORT}/v18.0`);
    console.log(`  WHATSAPP_TYPING_GRAPH_BASE_URL=http://localhost:${PORT}/v21.0`);
  });
}

main().catch((err) => {
  console.error('[mock-meta] failed to start:', err);
  process.exit(1);
});
