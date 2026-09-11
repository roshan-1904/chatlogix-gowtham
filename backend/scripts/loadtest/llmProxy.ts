/**
 * Record/replay OpenAI proxy for load testing (docs/LOAD_TESTING.md §6.2).
 *
 * Wired in with a single env var — no code change is needed, because the
 * `openai` v6 SDK reads OPENAI_BASE_URL in its constructor and every call site
 * in this repo constructs the client with only `apiKey`:
 *
 *   OPENAI_BASE_URL=http://localhost:8082/v1
 *
 * Two modes:
 *   record  Forwards to real OpenAI, returns the real response, and persists
 *           each request/response pair with its observed latency. Phase 1 runs
 *           in this mode so the run is fully real while still producing a
 *           cassette library as a byproduct.
 *   replay  Serves recorded cassettes back with sampled latency. Everything
 *           downstream of the LLM stays real (DB writes, cart engine, order
 *           creation, response queue), so this measures infrastructure at zero
 *           marginal cost.
 *
 * NOTE: replay-mode cost figures are synthetic. The `usage` block is replayed
 * verbatim from the recording, so a replay run's cost report looks plausible
 * but is a copy of Phase 1's numbers. Only the record run's cost is real.
 *
 * Standalone on purpose: no imports from src/, so it boots without DATABASE_URL.
 *
 * Run: npm run loadtest:llm-proxy          (record, the default)
 *      LLM_PROXY_MODE=replay npm run loadtest:llm-proxy
 */
import express from 'express';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.LLM_PROXY_PORT || '8082');
const MODE = (process.env.LLM_PROXY_MODE || 'record') as 'record' | 'replay';
const UPSTREAM = process.env.LLM_PROXY_UPSTREAM || 'https://api.openai.com';
const CASSETTE_PATH = path.resolve(
  process.env.LLM_PROXY_CASSETTES || path.join(process.cwd(), '.loadtest', 'cassettes.jsonl')
);
/** Multiplier on replayed latency, for modelling a faster or slower model. */
const REPLAY_LATENCY_SCALE = Number(process.env.LLM_PROXY_LATENCY_SCALE || '1');

/**
 * Which pipeline call this is. Attributing cost to translation vs. generation
 * is the main question §4 of the load-test doc exists to answer, so every
 * cassette carries this tag.
 */
type CallType = 'llm1' | 'llm2' | 'translation' | 'product_match' | 'embedding' | 'other';

interface Cassette {
  callType: CallType;
  endpoint: string;
  model: string;
  hash: string;
  latencyMs: number;
  status: number;
  response: any;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** Marker from vendorEnglish.ts:20 — the first line of the translation system prompt. */
const TRANSLATION_MARKER = 'Translate the following WhatsApp message into English for a vendor dashboard';
/** Marker from productMatcher.ts:323 — the AI multilingual matching prompt. */
const PRODUCT_MATCH_MARKER = 'Find the best matching product from the catalog';

function classify(endpoint: string, body: any): CallType {
  if (endpoint.includes('/embeddings')) return 'embedding';

  const schemaName = body?.response_format?.json_schema?.name;
  if (schemaName === 'llm1_result') return 'llm1';
  if (schemaName === 'llm2_result') return 'llm2';

  const systemContent = (body?.messages ?? [])
    .filter((m: any) => m?.role === 'system')
    .map((m: any) => (typeof m?.content === 'string' ? m.content : ''))
    .join('\n');

  if (systemContent.includes(TRANSLATION_MARKER)) return 'translation';
  if (systemContent.includes(PRODUCT_MATCH_MARKER)) return 'product_match';

  return 'other';
}

function hashRequest(endpoint: string, body: any): string {
  const canonical = JSON.stringify({
    endpoint,
    model: body?.model,
    messages: body?.messages,
    input: body?.input,
    schema: body?.response_format?.json_schema?.name
  });
  return createHash('sha256').update(canonical).digest('hex');
}

const stats: Record<CallType, { calls: number; promptTokens: number; completionTokens: number; totalLatencyMs: number }> = {
  llm1: { calls: 0, promptTokens: 0, completionTokens: 0, totalLatencyMs: 0 },
  llm2: { calls: 0, promptTokens: 0, completionTokens: 0, totalLatencyMs: 0 },
  translation: { calls: 0, promptTokens: 0, completionTokens: 0, totalLatencyMs: 0 },
  product_match: { calls: 0, promptTokens: 0, completionTokens: 0, totalLatencyMs: 0 },
  embedding: { calls: 0, promptTokens: 0, completionTokens: 0, totalLatencyMs: 0 },
  other: { calls: 0, promptTokens: 0, completionTokens: 0, totalLatencyMs: 0 }
};
let upstreamErrors = 0;
let replayMisses = 0;

function recordStats(callType: CallType, latencyMs: number, usage: any): void {
  const s = stats[callType];
  s.calls += 1;
  s.totalLatencyMs += latencyMs;
  s.promptTokens += usage?.prompt_tokens ?? 0;
  s.completionTokens += usage?.completion_tokens ?? 0;
}

// ---------------------------------------------------------------- record mode

let writeQueue: Promise<void> = Promise.resolve();
function persist(cassette: Cassette): void {
  writeQueue = writeQueue
    .then(() => appendFile(CASSETTE_PATH, `${JSON.stringify(cassette)}\n`, 'utf8'))
    .catch((err) => console.error('[llm-proxy] failed to persist cassette:', err));
}

async function forward(endpoint: string, req: express.Request): Promise<{ status: number; body: any; latencyMs: number }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json'
  };
  // Pass the SDK's own credentials straight through, so the proxy never needs
  // its own key.
  for (const name of ['authorization', 'openai-organization', 'openai-project', 'openai-beta']) {
    const value = req.header(name);
    if (value) headers[name] = value;
  }

  const startedAt = Date.now();
  const upstreamRes = await fetch(`${UPSTREAM}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(req.body)
  });
  const latencyMs = Date.now() - startedAt;
  const text = await upstreamRes.text();

  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: { message: 'Proxy: upstream returned non-JSON', raw: text.slice(0, 500) } };
  }
  return { status: upstreamRes.status, body, latencyMs };
}

// ---------------------------------------------------------------- replay mode

const byHash = new Map<string, Cassette>();
const byType = new Map<CallType, Cassette[]>();

async function loadCassettes(): Promise<number> {
  if (!existsSync(CASSETTE_PATH)) {
    throw new Error(
      `Replay mode needs cassettes but none were found at ${CASSETTE_PATH}. ` +
        'Run the proxy in record mode first (LLM_PROXY_MODE=record).'
    );
  }
  const raw = await readFile(CASSETTE_PATH, 'utf8');
  let count = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let cassette: Cassette;
    try {
      cassette = JSON.parse(line);
    } catch {
      continue;
    }
    if (cassette.status !== 200) continue; // never replay a recorded failure
    byHash.set(cassette.hash, cassette);
    const bucket = byType.get(cassette.callType) ?? [];
    bucket.push(cassette);
    byType.set(cassette.callType, bucket);
    count += 1;
  }
  return count;
}

function pickCassette(hash: string, callType: CallType, model: string): Cassette | null {
  const exact = byHash.get(hash);
  if (exact) return exact;

  // Prompts carry conversation history, so exact hits are rare beyond first
  // turns. Fall back to any recording of the same call type — same response
  // shape, which is what the pipeline actually parses.
  const bucket = byType.get(callType);
  if (!bucket || bucket.length === 0) return null;

  replayMisses += 1;
  const sameModel = bucket.filter((c) => c.model === model);
  const pool = sameModel.length > 0 ? sameModel : bucket;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

// -------------------------------------------------------------------- server

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/_loadtest/stats', (_req, res) => {
  const summary = Object.fromEntries(
    (Object.keys(stats) as CallType[]).map((t) => [
      t,
      {
        ...stats[t],
        meanLatencyMs: stats[t].calls > 0 ? Math.round(stats[t].totalLatencyMs / stats[t].calls) : 0
      }
    ])
  );
  res.json({ mode: MODE, cassettePath: CASSETTE_PATH, upstreamErrors, replayMisses, byCallType: summary });
});

app.post('/_loadtest/reset', (_req, res) => {
  for (const key of Object.keys(stats) as CallType[]) {
    stats[key] = { calls: 0, promptTokens: 0, completionTokens: 0, totalLatencyMs: 0 };
  }
  upstreamErrors = 0;
  replayMisses = 0;
  res.json({ ok: true });
});

async function handle(endpoint: string, req: express.Request, res: express.Response): Promise<void> {
  const body = req.body ?? {};
  const callType = classify(endpoint, body);
  const model = body?.model ?? 'unknown';

  if (body?.stream) {
    // Nothing in the pipeline streams today; if that changes the proxy needs
    // real SSE support rather than a silent wrong answer.
    res.status(400).json({ error: { message: 'Proxy: streaming is not supported' } });
    return;
  }

  if (MODE === 'record') {
    try {
      const { status, body: responseBody, latencyMs } = await forward(endpoint, req);
      if (status !== 200) upstreamErrors += 1;

      persist({
        callType,
        endpoint,
        model,
        hash: hashRequest(endpoint, body),
        latencyMs,
        status,
        response: responseBody,
        promptTokens: responseBody?.usage?.prompt_tokens,
        completionTokens: responseBody?.usage?.completion_tokens,
        totalTokens: responseBody?.usage?.total_tokens
      });

      if (status === 200) recordStats(callType, latencyMs, responseBody?.usage);
      res.status(status).json(responseBody);
    } catch (err) {
      upstreamErrors += 1;
      console.error('[llm-proxy] upstream call failed:', err);
      res.status(502).json({ error: { message: 'Proxy: upstream request failed', detail: String(err) } });
    }
    return;
  }

  const cassette = pickCassette(hashRequest(endpoint, body), callType, model);
  if (!cassette) {
    res.status(503).json({
      error: { message: `Proxy: no cassette available for callType=${callType}. Record a run that exercises this path first.` }
    });
    return;
  }

  const delay = Math.round(cassette.latencyMs * REPLAY_LATENCY_SCALE);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

  recordStats(callType, delay, cassette.response?.usage);
  res.status(200).json(cassette.response);
}

app.post('/v1/chat/completions', (req, res) => {
  void handle('/v1/chat/completions', req, res);
});

app.post('/v1/embeddings', (req, res) => {
  void handle('/v1/embeddings', req, res);
});

app.use((req, res) => {
  console.warn(`[llm-proxy] unmatched ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: { message: 'Proxy: unhandled OpenAI route' } });
});

async function main(): Promise<void> {
  await mkdir(path.dirname(CASSETTE_PATH), { recursive: true });

  if (MODE === 'replay') {
    const loaded = await loadCassettes();
    const perType = (Object.keys(stats) as CallType[])
      .map((t) => `${t}=${byType.get(t)?.length ?? 0}`)
      .join(' ');
    console.log(`[llm-proxy] replay mode, ${loaded} cassettes loaded (${perType})`);
  } else {
    console.log(`[llm-proxy] record mode, forwarding to ${UPSTREAM}`);
    console.log('[llm-proxy] this run makes REAL OpenAI calls and will incur cost');
  }

  app.listen(PORT, () => {
    console.log(`[llm-proxy] listening on http://localhost:${PORT}`);
    console.log(`[llm-proxy] cassettes: ${CASSETTE_PATH}`);
    console.log(`[llm-proxy] point the pipeline at: OPENAI_BASE_URL=http://localhost:${PORT}/v1`);
  });
}

main().catch((err) => {
  console.error('[llm-proxy] failed to start:', err);
  process.exit(1);
});
