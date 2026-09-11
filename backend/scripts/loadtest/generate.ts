/**
 * Load-test traffic generator (docs/LOAD_TESTING.md §6.5).
 *
 * Signs Meta-shaped webhook payloads with the real WHATSAPP_APP_SECRET and
 * POSTs them to the real webhook at a paced rate.
 *
 * Rate defaults to 1.5 msg/s, NOT the 10 msg/s originally specified: the AWS
 * account's Lambda concurrent-executions quota is 10 (docs/LOAD_TESTING.md §0),
 * which caps real pipeline throughput near 1-2 msg/s. Driving faster just
 * builds a backlog and turns every latency measurement into queue wait. Raise
 * this once the quota increase lands.
 *
 * Usage:
 *   npm run loadtest:generate -- --preflight        11 conversations, one per language
 *   npm run loadtest:generate                       the full 1,200-message run
 *   npm run loadtest:generate -- --rate 2           override messages/second
 *   npm run loadtest:generate -- --dry-run          print the schedule, send nothing
 *
 * Requires:
 *   LOADTEST_WEBHOOK_URL   e.g. https://<api-id>.execute-api.ap-south-1.amazonaws.com/prod/webhook
 *   WHATSAPP_APP_SECRET    the same secret the webhook Lambda verifies against
 */
import { createHmac } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { LOADTEST_DIR, MANIFEST_PATH, SENT_LOG_PATH, type Manifest } from './config.js';
import { buildSchedule, type ScheduledMessage } from './schedule.js';

interface Args {
  preflight: boolean;
  dryRun: boolean;
  rate: number;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const valueOf = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const rateArg = valueOf('--rate');
  const limitArg = valueOf('--limit');
  return {
    preflight: argv.includes('--preflight'),
    dryRun: argv.includes('--dry-run'),
    rate: rateArg ? Number(rateArg) : Number(process.env.LOADTEST_RATE || '1.5'),
    limit: limitArg ? Number(limitArg) : null
  };
}

function buildPayload(message: ScheduledMessage): Record<string, unknown> {
  const { conversation, text, whatsappMessageId } = message;
  const waId = conversation.customerPhone.replace(/\D/g, '');
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: `LOADTEST-ENTRY-${conversation.index}`,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: waId,
                phone_number_id: conversation.phoneNumberId
              },
              contacts: [{ profile: { name: `Loadtest ${conversation.index}` }, wa_id: waId }],
              messages: [
                {
                  from: conversation.customerPhone,
                  id: whatsappMessageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: text }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

let logQueue: Promise<void> = Promise.resolve();
function logSent(record: Record<string, unknown>): void {
  logQueue = logQueue
    .then(() => appendFile(SENT_LOG_PATH, `${JSON.stringify(record)}\n`, 'utf8'))
    .catch((err) => console.error('[generate] failed to write sent log:', err));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const webhookUrl = process.env.LOADTEST_WEBHOOK_URL;
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!webhookUrl) throw new Error('LOADTEST_WEBHOOK_URL is required (the API Gateway webhook endpoint)');
  if (!appSecret && !args.dryRun) {
    throw new Error('WHATSAPP_APP_SECRET is required — the webhook Lambda verifies the signature and has no bypass flag');
  }

  const manifest: Manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));

  let conversations = manifest.conversations;
  if (args.preflight) {
    // One conversation per language, so a human can eyeball every script.
    const seen = new Set<string>();
    conversations = conversations.filter((c) => {
      if (seen.has(c.languageKey)) return false;
      seen.add(c.languageKey);
      return true;
    });
  }
  if (args.limit !== null) {
    conversations = conversations.slice(0, args.limit);
  }

  const schedule = buildSchedule(conversations, args.rate, manifest.runId.slice(0, 8));
  const durationSec = schedule.length > 0 ? schedule[schedule.length - 1]!.atMs / 1000 : 0;

  console.log(`[generate] mode         ${args.preflight ? 'PREFLIGHT' : 'full run'}`);
  console.log(`[generate] runId        ${manifest.runId}`);
  console.log(`[generate] webhook      ${webhookUrl}`);
  console.log(`[generate] conversations ${conversations.length}`);
  console.log(`[generate] messages     ${schedule.length}`);
  console.log(`[generate] rate         ${args.rate} msg/s`);
  console.log(`[generate] duration     ~${Math.round(durationSec)}s`);
  console.log('');

  if (args.dryRun) {
    for (const m of schedule.slice(0, 30)) {
      console.log(
        `[generate]   +${String(Math.round(m.atMs / 1000)).padStart(4)}s  conv=${String(m.conversation.index).padStart(3)}  ` +
          `${m.conversation.languageKey.padEnd(12)} turn=${m.turnIndex + 1}  ${m.text.slice(0, 40)}`
      );
    }
    if (schedule.length > 30) console.log(`[generate]   ... and ${schedule.length - 30} more`);
    console.log('');
    console.log('[generate] DRY RUN — nothing sent.');
    return;
  }

  await mkdir(LOADTEST_DIR, { recursive: true });

  const startedAt = Date.now();
  let sent = 0;
  let failed = 0;
  const statusCounts = new Map<number, number>();

  for (const message of schedule) {
    const due = startedAt + message.atMs;
    const wait = due - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

    const rawBody = Buffer.from(JSON.stringify(buildPayload(message)), 'utf8');
    const signature = `sha256=${createHmac('sha256', appSecret!).update(rawBody).digest('hex')}`;

    const sentAt = new Date().toISOString();
    const t0 = Date.now();
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
        body: rawBody
      });
      const ackMs = Date.now() - t0;
      statusCounts.set(res.status, (statusCounts.get(res.status) ?? 0) + 1);
      if (res.ok) sent += 1;
      else failed += 1;

      logSent({
        at: sentAt,
        whatsappMessageId: message.whatsappMessageId,
        conversationIndex: message.conversation.index,
        languageKey: message.conversation.languageKey,
        expectedDetection: message.conversation.expectedDetection,
        expectsTranslation: message.conversation.expectsTranslation,
        turn: message.turnIndex + 1,
        customerPhone: message.conversation.customerPhone,
        vendorId: message.conversation.vendorId,
        phoneNumberId: message.conversation.phoneNumberId,
        text: message.text,
        status: res.status,
        ackMs
      });

      if (!res.ok) {
        const body = await res.text();
        console.warn(`[generate] ${res.status} on ${message.whatsappMessageId}: ${body.slice(0, 200)}`);
      }
    } catch (err) {
      failed += 1;
      logSent({
        at: sentAt,
        whatsappMessageId: message.whatsappMessageId,
        conversationIndex: message.conversation.index,
        languageKey: message.conversation.languageKey,
        turn: message.turnIndex + 1,
        text: message.text,
        error: String(err)
      });
      console.warn(`[generate] send failed for ${message.whatsappMessageId}: ${err}`);
    }

    const done = sent + failed;
    if (done % 50 === 0 || done === schedule.length) {
      const elapsed = (Date.now() - startedAt) / 1000;
      console.log(
        `[generate] ${String(done).padStart(4)}/${schedule.length}  ` +
          `${elapsed.toFixed(0)}s  effective ${(done / Math.max(elapsed, 1)).toFixed(2)} msg/s  ok=${sent} failed=${failed}`
      );
    }
  }

  await logQueue;

  console.log('');
  console.log(`[generate] finished in ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
  console.log(`[generate] accepted ${sent}, failed ${failed}`);
  for (const [status, count] of [...statusCounts].sort((a, b) => a[0] - b[0])) {
    console.log(`[generate]   HTTP ${status}: ${count}`);
  }
  console.log(`[generate] sent log ${SENT_LOG_PATH}`);
  console.log('');
  console.log('[generate] wait for the text queue to drain to zero before running the report —');
  console.log('[generate] non-English messages keep their Lambda open past the SLA clock.');
}

main().catch((err) => {
  console.error('[generate] failed:', err);
  process.exitCode = 1;
});
