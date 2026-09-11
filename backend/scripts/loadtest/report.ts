/**
 * Assembles the load-test result set, broken down by language
 * (docs/LOAD_TESTING.md §6.7 and §8).
 *
 * Joins four sources:
 *   .loadtest/sent.jsonl        what the generator sent, with expected language
 *   .loadtest/cassettes.jsonl   every LLM call, tagged by type — this is what
 *                               separates translation cost from generation cost
 *   .loadtest/meta-sends.jsonl  what the mock Graph API actually received, for
 *                               true end-to-end delivery accounting
 *   Postgres                    MessageProcessing / Message / CustomerInsights
 *
 * Run after the text queue has drained to zero:
 *   npm run loadtest:report
 */
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CUSTOMER_PHONE_PREFIX,
  MANIFEST_PATH,
  POOL_SAMPLES_PATH,
  RESULT_PATH,
  SENT_LOG_PATH,
  VENDOR_PHONE_PREFIX,
  type Manifest
} from './config.js';
import { LANGUAGE_PROFILES } from './fixtures/languages.js';

const prisma = new PrismaClient();

const LOADTEST_DIR = path.dirname(SENT_LOG_PATH);
const CASSETTE_PATH = path.join(LOADTEST_DIR, 'cassettes.jsonl');
const META_SENDS_PATH = path.join(LOADTEST_DIR, 'meta-sends.jsonl');

/**
 * Mirrors backend/src/utils/costCalculator.ts:33-41. Duplicated so the report
 * runs without the full pipeline env (importing costCalculator pulls in the
 * logger and therefore config/env, which requires RESPONSE_QUEUE_URL et al).
 * The OpenAI dashboard total for the run window is the authority; this is the
 * per-language attribution that the dashboard cannot give you.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4.1': { input: 2.0 / 1_000_000, output: 8.0 / 1_000_000 },
  'gpt-4.1-mini': { input: 0.4 / 1_000_000, output: 1.6 / 1_000_000 },
  'gpt-4.1-nano': { input: 0.1 / 1_000_000, output: 0.4 / 1_000_000 },
  'gpt-4o': { input: 2.5 / 1_000_000, output: 10.0 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  'text-embedding-3-small': { input: 0.02 / 1_000_000, output: 0 }
};

function costOf(model: string, promptTokens = 0, completionTokens = 0): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4.1-mini']!;
  return promptTokens * pricing.input + completionTokens * pricing.output;
}

async function readJsonl<T>(file: string): Promise<T[]> {
  if (!existsSync(file)) return [];
  const raw = await readFile(file, 'utf8');
  const out: T[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      /* skip partial lines */
    }
  }
  return out;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

interface SentRecord {
  whatsappMessageId: string;
  conversationIndex: number;
  languageKey: string;
  expectedDetection: string;
  expectsTranslation: boolean;
  turn: number;
  customerPhone: string;
  text: string;
  status?: number;
  ackMs?: number;
  error?: string;
}

interface Cassette {
  callType: string;
  model: string;
  latencyMs: number;
  status: number;
  promptTokens?: number;
  completionTokens?: number;
}

interface LanguageStats {
  language: string;
  label: string;
  sent: number;
  accepted: number;
  processed: number;
  queued: number;
  failed: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  latencyMean: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  costPerMessageUsd: number;
  contentEnPopulated: number;
  detectionCorrect: number;
  detectionObserved: Record<string, number>;
}

async function main(): Promise<void> {
  const manifest: Manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const sent = await readJsonl<SentRecord>(SENT_LOG_PATH);
  const cassettes = await readJsonl<Cassette>(CASSETTE_PATH);
  const metaSends = await readJsonl<{ kind: string; text?: string; rejectedWith?: number }>(META_SENDS_PATH);

  if (sent.length === 0) {
    throw new Error(`No sent log at ${SENT_LOG_PATH} — run the generator first.`);
  }

  const sentIds = sent.map((s) => s.whatsappMessageId);
  const byId = new Map(sent.map((s) => [s.whatsappMessageId, s]));

  const processing = await prisma.messageProcessing.findMany({
    where: { whatsappMessageId: { in: sentIds } },
    select: {
      whatsappMessageId: true,
      status: true,
      latencyMs: true,
      promptTokens: true,
      completionTokens: true,
      model: true,
      errorClass: true
    }
  });

  const inboundMessages = await prisma.message.findMany({
    where: { whatsappMessageId: { in: sentIds } },
    select: { whatsappMessageId: true, contentEn: true, aiCostUsd: true }
  });

  const insights = await prisma.customerInsights.findMany({
    where: { vendor: { phone: { startsWith: VENDOR_PHONE_PREFIX } } },
    select: { preferredLanguage: true, customer: { select: { phone: true } } }
  });
  const detectedByPhone = new Map(insights.map((i) => [i.customer.phone, i.preferredLanguage ?? 'unknown']));

  const processingById = new Map(processing.map((p) => [p.whatsappMessageId, p]));
  const inboundById = new Map(inboundMessages.map((m) => [m.whatsappMessageId!, m]));

  // ------------------------------------------------------------ per language

  const stats: LanguageStats[] = [];
  for (const profile of LANGUAGE_PROFILES) {
    const records = sent.filter((s) => s.languageKey === profile.key);
    if (records.length === 0) continue;

    const latencies: number[] = [];
    let queued = 0;
    let failed = 0;
    let processed = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let costUsd = 0;
    let contentEnPopulated = 0;

    for (const record of records) {
      const p = processingById.get(record.whatsappMessageId);
      if (p) {
        processed += 1;
        // 'queued' is the terminal success state — pipeline.ts:150 sets it the
        // moment the reply is on its way, deliberately independent of whether
        // the wallet debit succeeded (that is tracked by debitedAt, and the
        // §19.1 sweep recovers failures).
        if (p.status === 'queued') queued += 1;
        if (p.errorClass) failed += 1;
        if (typeof p.latencyMs === 'number') latencies.push(p.latencyMs);
        promptTokens += p.promptTokens;
        completionTokens += p.completionTokens;
        costUsd += costOf(p.model ?? 'gpt-4.1-mini', p.promptTokens, p.completionTokens);
      }
      const inbound = inboundById.get(record.whatsappMessageId);
      if (inbound?.contentEn) contentEnPopulated += 1;
    }

    // Detection accuracy is per conversation, not per message.
    const phones = new Set(records.map((r) => r.customerPhone));
    const detectionObserved: Record<string, number> = {};
    let detectionCorrect = 0;
    for (const phone of phones) {
      const detected = detectedByPhone.get(phone) ?? 'missing';
      detectionObserved[detected] = (detectionObserved[detected] ?? 0) + 1;
      if (detected === profile.expectedDetection) detectionCorrect += 1;
    }

    stats.push({
      language: profile.key,
      label: profile.label,
      sent: records.length,
      accepted: records.filter((r) => r.status === 200).length,
      processed,
      queued,
      failed,
      latencyP50: Math.round(percentile(latencies, 50)),
      latencyP95: Math.round(percentile(latencies, 95)),
      latencyP99: Math.round(percentile(latencies, 99)),
      latencyMean: Math.round(mean(latencies)),
      promptTokens,
      completionTokens,
      costUsd,
      costPerMessageUsd: records.length > 0 ? costUsd / records.length : 0,
      contentEnPopulated,
      detectionCorrect,
      detectionObserved
    });
  }

  // ------------------------------------------------------------ LLM call mix

  const callTypes = new Map<string, { calls: number; promptTokens: number; completionTokens: number; costUsd: number; latencies: number[] }>();
  for (const c of cassettes) {
    if (c.status !== 200) continue;
    const entry = callTypes.get(c.callType) ?? { calls: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, latencies: [] };
    entry.calls += 1;
    entry.promptTokens += c.promptTokens ?? 0;
    entry.completionTokens += c.completionTokens ?? 0;
    entry.costUsd += costOf(c.model, c.promptTokens ?? 0, c.completionTokens ?? 0);
    entry.latencies.push(c.latencyMs);
    callTypes.set(c.callType, entry);
  }

  const nonEnglishSent = sent.filter((s) => s.expectsTranslation).length;
  const translationCalls = callTypes.get('translation')?.calls ?? 0;

  // ------------------------------------------------------------------ output

  const totalSent = sent.length;
  const totalQueued = stats.reduce((sum, s) => sum + s.queued, 0);
  const totalCost = stats.reduce((sum, s) => sum + s.costUsd, 0);
  const cassetteCost = [...callTypes.values()].reduce((sum, v) => sum + v.costUsd, 0);
  const deliveries = metaSends.filter((m) => m.kind === 'send' && !m.rejectedWith).length;
  const metaRejections = metaSends.filter((m) => m.rejectedWith).length;

  const line = '─'.repeat(112);

  console.log('');
  console.log(`LOAD TEST REPORT   runId ${manifest.runId}`);
  console.log(line);
  console.log(`messages sent        ${totalSent}`);
  console.log(`webhook accepted     ${sent.filter((s) => s.status === 200).length}`);
  console.log(`reached 'queued'     ${totalQueued}  (${((totalQueued / totalSent) * 100).toFixed(1)}% end-to-end success)`);
  console.log(`replies at mock Meta ${deliveries}${metaRejections > 0 ? `  (${metaRejections} rejected by the mock)` : ''}`);
  console.log('');

  console.log('PER LANGUAGE');
  console.log(line);
  console.log(
    'lang'.padEnd(13) +
      'sent'.padStart(6) +
      'queued'.padStart(8) +
      'p50'.padStart(8) +
      'p95'.padStart(8) +
      'p99'.padStart(8) +
      '$/msg'.padStart(11) +
      'tok in/out'.padStart(16) +
      'contentEn'.padStart(11) +
      'detect'.padStart(9)
  );
  console.log(line);
  for (const s of stats) {
    const conversations = Object.values(s.detectionObserved).reduce((a, b) => a + b, 0);
    console.log(
      s.language.padEnd(13) +
        String(s.sent).padStart(6) +
        String(s.queued).padStart(8) +
        `${s.latencyP50}ms`.padStart(8) +
        `${s.latencyP95}ms`.padStart(8) +
        `${s.latencyP99}ms`.padStart(8) +
        `$${s.costPerMessageUsd.toFixed(5)}`.padStart(11) +
        `${s.promptTokens}/${s.completionTokens}`.padStart(16) +
        String(s.contentEnPopulated).padStart(11) +
        `${s.detectionCorrect}/${conversations}`.padStart(9)
    );
  }
  console.log('');

  const english = stats.find((s) => s.language === 'en');
  if (english && english.costPerMessageUsd > 0) {
    console.log('COST MULTIPLIER vs ENGLISH');
    console.log(line);
    for (const s of stats) {
      if (s.language === 'en') continue;
      const multiple = s.costPerMessageUsd / english.costPerMessageUsd;
      console.log(`  ${s.language.padEnd(13)} ${multiple.toFixed(2)}x   ${s.label}`);
    }
    console.log('');
  }

  console.log('LLM CALLS BY TYPE');
  console.log(line);
  console.log('type'.padEnd(16) + 'calls'.padStart(8) + 'per msg'.padStart(10) + 'mean ms'.padStart(10) + 'tok in/out'.padStart(18) + 'cost'.padStart(12));
  console.log(line);
  for (const [type, v] of [...callTypes].sort((a, b) => b[1].calls - a[1].calls)) {
    console.log(
      type.padEnd(16) +
        String(v.calls).padStart(8) +
        (v.calls / totalSent).toFixed(2).padStart(10) +
        String(Math.round(mean(v.latencies))).padStart(10) +
        `${v.promptTokens}/${v.completionTokens}`.padStart(18) +
        `$${v.costUsd.toFixed(4)}`.padStart(12)
    );
  }
  console.log('');

  console.log('FINDINGS');
  console.log(line);

  if (cassettes.length === 0) {
    console.log('NO LLM PROXY DATA — cassette log is empty.');
    console.log('  The processor called OpenAI directly, so this report cannot attribute cost');
    console.log('  by call type. The per-language costs below come from MessageProcessing token');
    console.log('  counts, which record LLM-1 and LLM-2 ONLY. Translation, product-match and');
    console.log('  embedding calls really happened but are NOT counted — true cost is higher.');
    console.log('  To attribute them, set OPENAI_BASE_URL on the processor Lambda to a reachable');
    console.log('  llmProxy in record mode (see LOAD_TESTING.md §6a).');
  } else if (nonEnglishSent > 0) {
    const ratio = translationCalls / nonEnglishSent;
    console.log(`translation calls per non-English message: ${ratio.toFixed(2)}`);
    if (ratio > 1.05) {
      console.log('  → above 1.0: the duplicate ensureMessageContentEn call');
      console.log('    (webhookEventProcessor.ts:443 and pipeline.ts:278) is firing twice.');
      console.log('    See LOAD_TESTING.md §4.3.');
    } else {
      console.log('  → at or below 1.0: the webhook translation is landing before the pipeline checks.');
    }
    console.log('  Note assistant-reply translations (pipeline.ts:140) are counted here too.');
  }

  const anyLatency = stats.some((s) => s.latencyMean > 0);
  if (!anyLatency) {
    console.log('');
    console.log('NO LATENCY DATA — MessageProcessing.latencyMs is never written.');
    console.log('  The column exists in schema.prisma:191 but nothing in backend/src/conversation');
    console.log('  populates it; the pipeline emits LatencyMs as a metric instead (pipeline.ts:488).');
    console.log('  Read percentiles from CloudWatch namespace ChatLogix/ConversationParity.');
  }

  const detectionMisses = stats.filter((s) => {
    const total = Object.values(s.detectionObserved).reduce((a, b) => a + b, 0);
    return total > 0 && s.detectionCorrect < total;
  });
  if (detectionMisses.length > 0) {
    console.log('');
    console.log('language detection mismatches:');
    for (const s of detectionMisses) {
      console.log(`  ${s.language}: observed ${JSON.stringify(s.detectionObserved)} (expected all '${LANGUAGE_PROFILES.find((p) => p.key === s.language)?.expectedDetection}')`);
    }
  }

  console.log('');
  console.log(`cost from MessageProcessing tokens: $${totalCost.toFixed(4)}`);
  console.log(`cost from LLM proxy cassettes:      $${cassetteCost.toFixed(4)}`);
  console.log('  The cassette figure includes translation and product-match calls that');
  console.log('  MessageProcessing does not attribute. Cross-check both against the OpenAI');
  console.log('  dashboard for the run window — that is the authority.');

  if (existsSync(POOL_SAMPLES_PATH)) {
    const samples = await readJsonl<{ queues?: { text?: { visible: number } }; pg?: { active: number } }>(POOL_SAMPLES_PATH);
    const peakBacklog = Math.max(0, ...samples.map((s) => s.queues?.text?.visible ?? 0));
    const peakPg = Math.max(0, ...samples.map((s) => s.pg?.active ?? 0));
    console.log('');
    console.log(`peak text-queue backlog: ${peakBacklog}`);
    console.log(`peak postgres active connections: ${peakPg}`);
    if (peakBacklog > 20) {
      console.log('  → a sustained backlog means the offered rate exceeded what the Lambda');
      console.log('    concurrency quota can absorb; these latency numbers include queue wait.');
    }
  }

  await writeFile(
    RESULT_PATH,
    `${JSON.stringify(
      {
        runId: manifest.runId,
        generatedAt: new Date().toISOString(),
        totals: { sent: totalSent, queued: totalQueued, deliveries, metaRejections, costUsd: totalCost, cassetteCostUsd: cassetteCost },
        perLanguage: stats,
        callTypes: Object.fromEntries(
          [...callTypes].map(([type, v]) => [
            type,
            { calls: v.calls, perMessage: v.calls / totalSent, meanLatencyMs: Math.round(mean(v.latencies)), promptTokens: v.promptTokens, completionTokens: v.completionTokens, costUsd: v.costUsd }
          ])
        ),
        translationCallsPerNonEnglishMessage: nonEnglishSent > 0 ? translationCalls / nonEnglishSent : null
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  console.log('');
  console.log(`[report] written to ${RESULT_PATH}`);
}

main()
  .catch((err) => {
    console.error('[report] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
