/**
 * Runtime sampler for a load-test run (docs/LOAD_TESTING.md §6.6).
 *
 * Samples once a second for the duration of the run and appends JSONL:
 *   - SQS depth on the text, response and DLQ queues (the backlog signal that
 *     says whether the offered rate is above what the concurrency quota can
 *     absorb)
 *   - Postgres connection counts from pg_stat_activity
 *   - PgBouncer SHOW POOLS, if PGBOUNCER_ADMIN_URL is set
 *
 * On PgBouncer: as of 2026-09-11 the Lambdas connect to Postgres directly on
 * port 5432, so PgBouncer is NOT in the request path and there is nothing for
 * it to report (docs/LOAD_TESTING.md §0). This sampler skips it unless you
 * explicitly point it at an admin connection, and warns so a run doesn't
 * silently record an empty pool table as though it were meaningful.
 *
 * Run alongside the generator:
 *   npm run loadtest:sample
 * Stop with Ctrl-C, or pass --duration <seconds>.
 */
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import { PrismaClient } from '@prisma/client';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { LOADTEST_DIR, POOL_SAMPLES_PATH } from './config.js';

const INTERVAL_MS = Number(process.env.LOADTEST_SAMPLE_INTERVAL_MS || '1000');

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const durationArg = argValue('--duration');
const DURATION_SEC = durationArg ? Number(durationArg) : null;

const region = process.env.AWS_REGION || 'ap-south-1';
const sqs = new SQSClient({ region, endpoint: process.env.AWS_SQS_ENDPOINT || undefined });
const prisma = new PrismaClient();

const QUEUES: Array<{ label: string; url: string | undefined }> = [
  { label: 'text', url: process.env.TEXT_QUEUE_URL || process.env.INCOMING_QUEUE_URL },
  { label: 'response', url: process.env.RESPONSE_QUEUE_URL },
  { label: 'textDlq', url: process.env.TEXT_DLQ_URL }
];

async function queueDepths(): Promise<Record<string, { visible: number; inFlight: number } | null>> {
  const out: Record<string, { visible: number; inFlight: number } | null> = {};
  await Promise.all(
    QUEUES.map(async ({ label, url }) => {
      if (!url) {
        out[label] = null;
        return;
      }
      try {
        const res = await sqs.send(
          new GetQueueAttributesCommand({
            QueueUrl: url,
            AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible']
          })
        );
        out[label] = {
          visible: Number(res.Attributes?.ApproximateNumberOfMessages ?? 0),
          inFlight: Number(res.Attributes?.ApproximateNumberOfMessagesNotVisible ?? 0)
        };
      } catch {
        out[label] = null;
      }
    })
  );
  return out;
}

interface PgActivityRow {
  total: bigint;
  active: bigint;
  idle: bigint;
  idle_in_transaction: bigint;
}

async function pgActivity(): Promise<Record<string, number> | null> {
  try {
    const rows = await prisma.$queryRaw<PgActivityRow[]>`
      SELECT
        count(*)                                                        AS total,
        count(*) FILTER (WHERE state = 'active')                        AS active,
        count(*) FILTER (WHERE state = 'idle')                          AS idle,
        count(*) FILTER (WHERE state = 'idle in transaction')           AS idle_in_transaction
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      total: Number(row.total),
      active: Number(row.active),
      idle: Number(row.idle),
      idleInTransaction: Number(row.idle_in_transaction)
    };
  } catch {
    return null;
  }
}

let maxConnections: number | null = null;
async function readMaxConnections(): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<Array<{ setting: string }>>`SELECT setting FROM pg_settings WHERE name = 'max_connections'`;
    maxConnections = rows[0] ? Number(rows[0].setting) : null;
  } catch {
    maxConnections = null;
  }
}

let writeQueue: Promise<void> = Promise.resolve();
function persist(sample: unknown): void {
  writeQueue = writeQueue
    .then(() => appendFile(POOL_SAMPLES_PATH, `${JSON.stringify(sample)}\n`, 'utf8'))
    .catch((err) => console.error('[sample] write failed:', err));
}

let stopped = false;
let peakVisible = 0;
let peakPgActive = 0;
let samples = 0;

async function tick(): Promise<void> {
  const [queues, pg] = await Promise.all([queueDepths(), pgActivity()]);
  const at = new Date().toISOString();

  if (queues.text) peakVisible = Math.max(peakVisible, queues.text.visible);
  if (pg) peakPgActive = Math.max(peakPgActive, pg.active);
  samples += 1;

  persist({ at, queues, pg });

  const textDepth = queues.text ? `${queues.text.visible}/${queues.text.inFlight}` : 'n/a';
  const pgDesc = pg ? `${pg.active} active, ${pg.total} total` : 'n/a';
  process.stdout.write(`\r[sample] ${samples}s  text q (visible/inflight) ${textDepth}  pg ${pgDesc}       `);
}

async function main(): Promise<void> {
  await mkdir(LOADTEST_DIR, { recursive: true });
  await readMaxConnections();

  console.log(`[sample] interval ${INTERVAL_MS}ms  output ${POOL_SAMPLES_PATH}`);
  console.log(`[sample] postgres max_connections: ${maxConnections ?? 'unreadable from here'}`);
  if (!process.env.PGBOUNCER_ADMIN_URL) {
    console.log('[sample] PgBouncer not sampled — it is not in the Lambda path today (see LOAD_TESTING.md §0).');
    console.log('[sample] Set PGBOUNCER_ADMIN_URL only once DATABASE_URL is cut over to port 6432.');
  }
  for (const { label, url } of QUEUES) {
    if (!url) console.log(`[sample] queue '${label}' not configured — set its *_QUEUE_URL to sample it`);
  }
  console.log('');

  const startedAt = Date.now();
  while (!stopped) {
    await tick();
    if (DURATION_SEC !== null && (Date.now() - startedAt) / 1000 >= DURATION_SEC) break;
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }

  await writeQueue;
  console.log('');
  console.log(`[sample] ${samples} samples over ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
  console.log(`[sample] peak text-queue backlog: ${peakVisible}`);
  console.log(`[sample] peak postgres active connections: ${peakPgActive}${maxConnections ? ` of ${maxConnections}` : ''}`);
  if (peakVisible > 20) {
    console.log('[sample] NOTE: a persistent backlog means the offered rate exceeded what the');
    console.log('[sample] concurrency quota can absorb — latency numbers from this run include queue wait.');
  }
}

process.on('SIGINT', () => {
  stopped = true;
});

main()
  .catch((err) => {
    console.error('[sample] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
