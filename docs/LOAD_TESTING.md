# Load testing the message pipeline

How we generate synthetic WhatsApp traffic against the real production stack to find
the throughput ceiling of the inbound message pipeline, measure real per-message cost
and latency, and identify the first component to fail under load.

**Status:** harness ready (2026-09-11, `backend/scripts/loadtest/`). Phase 0 done
(quota 1000; PgBouncer 6432; all five Lambdas reserved — 132 total). Phase 1
(calibration) not yet run.
**Target environment:** production. It currently has no real vendors or customers, so
it is effectively a staging environment with production topology — real API Gateway,
real Lambda, real Postgres, real ElastiCache, real OpenAI.

> ## ⚠ Remaining risk: PgBouncer pool size under load
>
> Measured 2026-09-11 in account `987272474004` / `ap-south-1` (PgBouncer cutover
> confirmed same day on all five Lambdas):
>
> ```
> Lambda concurrent executions : 1000   (raised from 10 on 2026-09-11)
> Reserved concurrency (total)   : 132 across all five functions (see table below)
> Prisma connection_limit      : 1 per container
> PgBouncer                    : in the Lambda path (DATABASE_URL → port 6432) ✓
> Postgres max_connections     : 100
> ```
>
> The raw-Postgres failure mode (1000 containers × 1 connection = 100 `max_connections`)
> is **closed** — transaction pooling multiplexes many Lambda clients onto fewer backends.
>
> What remains before Phase 2:
>
> 1. **Confirm PgBouncer `default_pool_size`** via `SHOW CONFIG` / `SHOW POOLS` under load —
>    `setup-pgbouncer.sh` suggested 15; that becomes the new knee, not `max_connections`.
>
> Phase 1 at 1.5–2 msg/s stays safe regardless (~9–18 concurrent containers).
>
> ### Reservation audit (2026-09-11, all five set same day)
>
> All five functions set `connection_limit=1` / `pool_timeout=3`. Re-apply reserved
> concurrency manually in AWS (`put-function-concurrency` per function).
>
> | Function | Reserved | Max DB connections it can open |
> |---|---:|---:|
> | `chatlogix-incoming-response-generator` | **80** | 80 |
> | `chatlogix-webhook-handler` | **30** | 30 |
> | `chatlogix-whatsapp-response-dispatcher` | **15** | 15 |
> | `chatlogix-media-fetcher` | **5** | 5 |
> | `chatlogix-order-recovery` | **2** | 2 |
> | **Total** | **132** | 132 (868 left in unreserved pool at quota 1000) |
>
> With PgBouncer in the path, the ceiling is governed by pool size and transaction hold
> time, not raw `max_connections`. §9's bottleneck ranking and §8's extrapolation should be
> re-measured under load.

---

## 0. Deployed configuration (ground truth)

Measured from AWS on 2026-09-11. **Several values drift from the spec and from
`CLAUDE.md`.** Re-verify before each run.

| Setting | Spec / code says | Actually deployed |
|---|---|---|
| Lambda account concurrency | 1000 (AWS default) | 1000 ✓ (raised from 10 on 2026-09-11) |
| Reserved concurrency | — | **132 total** — webhook 30, processor 80, dispatcher 15, media-fetcher 5, order-recovery 2 |
| Postgres `max_connections` | — | **100** |
| Processor timeout | 60s | **300s** |
| Processor memory | 1536 MB | 2048 MB |
| Processor runtime | — | `nodejs22.x` |
| Text queue batch size | 1 | 1 ✓ |
| Text queue visibility timeout | 360s | **1800s** |
| Text queue `maxReceiveCount` | 3 | **5** |
| `DATABASE_CONNECTION_LIMIT` | 1 | 1 ✓ |
| `DATABASE_POOL_TIMEOUT` | 3 | 3 ✓ |
| `DATABASE_URL` target | PgBouncer, port 6432 | **PgBouncer, port 6432** ✓ (cutover 2026-09-11) |
| `CLOUDWATCH_METRICS_ENABLED` | — | `true` — but see the IAM note below |

### PgBouncer is in the Lambda path

All five functions' `DATABASE_URL` points at `…@172.26.12.247:6432/chatlogix?schema=public&pgbouncer=true`
(verified via AWS CLI 2026-09-11 after cutover). Port 6432 is PgBouncer in transaction-pooling
mode; Postgres still listens on 5432 for direct connections (migrations, PM2, admin).

The `pgbouncer=true` flag tells Prisma to disable prepared statements — required for
transaction pooling.

**Still to confirm under load:** PgBouncer's `default_pool_size` (setup script suggested
15). That value — not `max_connections` — is now the primary database-side knee. Use
`samplePools.ts` / `SHOW POOLS` during Phase 1 to measure `cl_active`, `sv_active`, and
`cl_waiting`.

> **Unrelated security finding:** both 5432 and 6432 on the database host answer from the
> public internet. Production Postgres should not be publicly reachable — it wants a
> security-group or firewall rule restricting it to the Lambda egress and the app hosts.
> Out of scope for load testing, but worth its own ticket.

### `CLOUDWATCH_METRICS_ENABLED=true` does nothing — the IAM role lacks the permission

Setting the env var is necessary but not sufficient. Every metric publish fails:

```
AccessDenied: User: arn:aws:sts::987272474004:assumed-role/chatlogix-lambda-role/
chatlogix-incoming-response-generator is not authorized to perform:
cloudwatch:PutMetricData
```

The `ChatLogix/ConversationParity` namespace is **empty** — `list-metrics` returns `[]`.
The pipeline logs `metric:LatencyMs` to Pino, then throws away the CloudWatch write and
logs `cloudwatch_metric_publish_failed` next to it.

Two consequences: percentile dashboards and alarms cannot be built until
`cloudwatch:PutMetricData` is added to `chatlogix-lambda-role`, and every failed publish
costs an SDK round trip inside the invocation.

**Until that is fixed, latency comes from CloudWatch Logs, not metrics.** The
`stage: handler_start` and `stage: response_queue_published` lines both carry `traceId`
(the `wamid`), so a Logs Insights query gives exact per-message latency that joins to
`sent.jsonl` for language:

```
fields @timestamp, traceId, msg
| filter msg = "stage: handler_start" or msg = "stage: response_queue_published"
| stats earliest(@timestamp) as t0, latest(@timestamp) as t1, count(*) as n by traceId
```

### Lock TTL aligned with Lambda timeout (fixed 2026-09-12)

`conversation/lock.ts` now sets **300s** (`DEFAULT_LOCK_TTL_MS`), matching the deployed
processor Lambda timeout. Previously 60s allowed concurrent processing of one
conversation when an invocation outlived its lock.

### Whole-batch redelivery on three event source mappings

| Mapping | Batch size | `ReportBatchItemFailures` |
|---|---|---|
| text-queue → processor | 1 | ✓ enabled |
| media-fetch-queue → media fetcher | 10 | ✓ enabled |
| **audio-queue → processor** | 10 | ✗ **absent** |
| **image-queue → processor** | 10 | ✗ **absent** |
| **response-queue → dispatcher** | 10 | ✗ **absent** |

Without partial-failure reporting, one failed record redelivers the whole batch of 10.
On the dispatcher that means **duplicate WhatsApp sends to real customers** whenever any
record in a batch fails.

Note also that audio and image queues at batch size 10 make `mergeSameBatch`
(`burstMerge.ts:13`) live for those paths, contrary to its "dormant at launch" comment.

---

## 1. What is real and what is mocked

Everything on the hot path is real except the WhatsApp Business API.

| Component | Real / mocked | Why |
|---|---|---|
| API Gateway + `chatlogix-webhook-handler` | Real | Includes HMAC signature verification and the webhook's own DB writes |
| Postgres + PgBouncer | Real | The DB is the prime bottleneck suspect; a fenced pool would measure the fence, not the system |
| Redis (ElastiCache) | Real | Conversation locks fail closed; cannot be stubbed |
| SQS (text + response queues) | Real | Queue depth and message age are primary diagnostics |
| `chatlogix-incoming-response-generator` | Real | The system under test |
| OpenAI (LLM-1, LLM-2, translation, embeddings) | Real in Phase 1 | Real latency drives Lambda concurrency, which drives DB pressure |
| `chatlogix-whatsapp-response-dispatcher` | Real | Has no rate limiter or retry; its behavior under load is a finding |
| **WhatsApp Graph API** | **Mocked** | We cannot receive 1000s of real WhatsApp messages, and must not send to real numbers |

### Why OpenAI stays real

Mocking the LLM would hide the two most likely failure modes: real completion latency
(which sets Lambda concurrency via Little's law, which sets PgBouncer client-connection
demand) and 429 handling. LLM-1 and LLM-2 have **no retry and no backoff** — a 429
throws, the record lands in `batchItemFailures`, SQS redelivers twice more, and the
message hits the DLQ. That behavior needs to be observed, not mocked away.

Phase 1 still records every LLM exchange so later phases can replay them for free. See
§6.2.

---

## 2. Phase plan

| Phase | Rate | Volume | Purpose | Blocked on quota? | Approx OpenAI cost |
|---|---|---|---|---|---|
| **0. Quota request** | — | — | Raise Lambda concurrent executions from 10 toward 1000; PgBouncer cutover; reserve all five Lambdas | **Done** (quota 1000 + PgBouncer 6432 + reserved 132, 2026-09-11) | $0 |
| **1. Calibration** | **1.5–2 msg/s × ~10–13 min** | 1,200 | Real cost/message **per language**, latency percentiles, LLM-2 trigger rate, translation duplication | **No** — runs today | $10–25 (see §4.4) |
| **2. Concurrency ramp** | Pre-seeded queue, stepped reserved concurrency | ~15,000 | Throughput-vs-concurrency curve; locate the knee | **Yes** | ~$150 real, $0 on replay |
| **3. Ceiling / cascade** | 1000 msg/s ingress, unthrottled | up to 60,000 | Confirm the failure mode and the order of collapse | **Yes** | ~$600 real, $0 on replay |

Phase 0 is **done** (quota 1000, PgBouncer cutover, all five Lambdas reserved at 132
total — all 2026-09-11).

Phase 1 is otherwise independent of quota. Its cost, latency, and language findings need
1,200 messages under clean conditions, not high throughput, so it runs today at a reduced
rate. What it loses at 1.5–2 msg/s is the connection-pool pressure measurement, which is
meaningless at 10 concurrent executions anyway.

Phase 1 remains the gate for the others: its cost numbers decide whether Phases 2 and 3
run against real OpenAI or recorded cassettes. The Phase 2/3 estimates assume a
multilingual mix and are therefore several times higher than an English-only projection.

---

## 3. Phase 1 specification

**1,200 messages: 200 conversations × 6 turns, paced at 1.5–2 msg/s for ~10–13 minutes.**

> Originally specified at 10 msg/s × 120s. Revised down because the account's Lambda
> concurrency quota of 10 caps real throughput at ~1–2 msg/s (see the banner at the top).
> Driving 10 msg/s would build a backlog and turn every latency measurement into queue
> wait time. Restore 10 msg/s once Phase 0 lands.
>
> Start the run at 1.5 msg/s and watch `ApproximateNumberOfMessagesVisible` on the text
> queue. If it stays near zero the system is keeping up and the numbers are clean; if it
> climbs monotonically, drop the rate until it doesn't.

### Traffic shape

Six turns per conversation, not 1,200 one-shots. Cost per message is **not flat** —
`prefetch.ts` pulls conversation memory and message history into the LLM-1 prompt, so a
6th-turn message carries materially more prompt tokens than a 1st-turn message. Measuring
single-turn conversations would under-report cost per message and cause every later
projection to be wrong.

Each conversation follows a realistic order arc so cart operations and LLM-2 actually
fire rather than every message taking the cheap no-op path:

1. Greeting
2. Browse / product question
3. Add an item
4. Modify quantity
5. Provide delivery address
6. Confirm order

Turns 3–6 produce mutating cart ops, which forces `shouldRunLlm2` to return true
(`backend/src/conversation/llm/llm2.ts:27-33`). Expect an LLM-2 trigger rate near 60–70%
on this profile. Turn 5 additionally produces a `set_field` address op, which triggers
translation on non-English traffic (§4.2).

### Pacing

Each conversation gets a start offset and a fixed inter-turn gap sized to the run
duration — roughly 90–120s at the revised rate, versus the ~17s a 120s run would have
used. That places turn N+1 well after turn N's reply, and comfortably clear of both the
400ms burst-merge window (`burstMerge.ts:49`) and the 300s conversation lock TTL
(`conversation/lock.ts`). No coordination between generator workers is needed.

The longer gap has a useful side effect: prefetch cache entries will expire between
turns, so more turns hit Postgres instead of Redis. That is closer to real traffic than a
tightly packed run would be, and it gives the DB more exercise at a rate the concurrency
quota can actually sustain.

At any instant the offered load is spread across distinct conversations, so Redis lock
contention should be effectively zero. If `LockContention` is non-zero in Phase 1, the
pacing is wrong and the run is invalid.

### Test data

- 10 vendors, each with a `WhatsAppNumber` row mapping a synthetic `phoneNumberId`
- A plausible product catalog per vendor, **with product names in the regional languages
  being tested**, not English-only (§4.3)
- Wallet credits on every vendor — otherwise `canProcessMessage` short-circuits at
  `pipeline.ts:297` and you measure the guard path, not the AI path
- 200 customers on a reserved phone prefix so cleanup is a single predicate

### Message IDs

Every message needs a unique `whatsappMessageId`, formatted `wamid.LOADTEST.<runId>.<seq>`.

This is not optional. A reused ID is dropped by `DuplicateMessageService` (in-process
Set), by the `Message.whatsappMessageId` unique constraint (`schema.prisma:145`), or by
the `messageProcessing.findUnique` idempotency gate (`pipeline.ts:252`), which ACKs
without doing any work. Reuse an ID and you measure the dedup layer.

---

## 4. Multilingual traffic

**This is the highest-value dimension of the test.** Non-English messages do not merely
cost more tokens — they activate code paths that English traffic never touches at all.
An English-only load test would measure a substantially different, and much cheaper,
system than the one we actually run.

### 4.1 Language distribution

`detectLanguageFromText` (`backend/src/conversation/language.ts:19-34`) classifies by
Unicode script and supports Hindi/Devanagari, Tamil, Telugu, Malayalam, Kannada, Bengali,
Gujarati, Punjabi, Odia, and Sinhala. Each conversation holds one language across all six
turns, as a real customer would.

| Language | Script | Conversations | Notes |
|---|---|---|---|
| Tamil (`ta`) | Tamil | 40 | |
| Hindi (`hi`) | Devanagari | 40 | |
| Telugu (`te`) | Telugu | 24 | |
| Malayalam (`ml`) | Malayalam | 24 | |
| Kannada (`kn`) | Kannada | 24 | |
| Bengali (`bn`) | Bengali | 12 | |
| Marathi | Devanagari | 8 | **Detected as `hi`** — shares the Devanagari range |
| Gujarati (`gu`) | Gujarati | 6 | |
| Punjabi (`pa`) | Gurmukhi | 6 | |
| English (`en`) | Latin | 10 | Control group — the cheap path |
| Hinglish / Tanglish | Latin | 6 | **Second control** — see below |
| **Total** | | **200** | |

Two deliberate control groups matter as much as the regional languages:

- **English** establishes the baseline cost that every multiplier is measured against.
- **Latin-script Hinglish/Tanglish** ("2 kg brownie venum") is Hindi or Tamil *language*
  in Latin *script*. `detectLanguageFromText` returns `en` and `needsEnglish` returns
  false (`vendorEnglish.ts:44-53`), so it skips every translation call. It should cost
  roughly the same as English despite not being English. If it doesn't, something in the
  detection logic is wrong.

Worth capturing as a known behavior rather than a bug: Devanagari is tested first in the
detector, so a Marathi message is reported as `hi`, and a message mixing Devanagari with
any other Indian script is also reported as `hi`.

### 4.2 What non-English traffic actually triggers

Per message, comparing an English turn to the same turn in Tamil:

| Work item | English | Tamil | Source |
|---|---|---|---|
| Inbound translation (webhook, fire-and-forget) | — | 1 call | `webhookEventProcessor.ts:443` |
| Inbound translation (pipeline, **awaited**) | — | 1 call | `pipeline.ts:278` |
| LLM-1 | 1 call | 1 call | `llm1.ts:48` |
| AI product matching | **disabled** | enabled | `candidateSearch.ts:39` |
| `set_field` normalization (turn 5) | — | 1 call per field | `pipeline.ts:354` |
| LLM-2 (mutating turns) | 1 call | 1 call | `llm2.ts:27` |
| Assistant-reply translation (**awaited**) | — | 1 call | `pipeline.ts:140` |
| **Total on a turn-5 mutating message** | **2** | **up to 6** | |

On top of the call-count multiplier, Indian scripts tokenize far worse than English under
`o200k_base`. English averages roughly 4 characters per token; Devanagari is closer to
1–2; and Tamil, Telugu, Malayalam, and Kannada frequently approach or exceed one token per
character. Only the customer text multiplies — the English system prompt and compact
catalog do not — but prompt growth compounds across a 6-turn conversation as history
accumulates in the prompt.

> ## ⚠ Measured 2026-09-11: this prediction was wrong
>
> The 11-language preflight (66 messages, real OpenAI, real pipeline) measured the
> multilingual cost multiplier at **1.00–1.06×**, not 4–8×.
>
> | | prompt tokens/msg | $/msg | vs English |
> |---|---|---|---|
> | English | 2,950 | $0.00130 | 1.00× |
> | Tamil | 2,990 | $0.00133 | 1.03× |
> | Malayalam | 2,993 | $0.00134 | 1.03× |
> | Punjabi (worst) | 3,018 | $0.00138 | 1.06× |
>
> **Why the reasoning failed:** the call-count and tokenizer analysis below is correct in
> isolation, but it assumed the customer's text was a meaningful share of the prompt. It
> isn't. Every message carries a fixed ~2,950-token English payload — system prompt,
> compact catalog, conversation history — so a handful of Tamil words tokenizing 3–4×
> worse adds only tens of tokens against a 3,000-token baseline. Total spread across all
> eleven profiles was 68 tokens, or 2.3%.
>
> **What this redirects:** cost optimisation should target the ~3,000-token prompt, not
> multilingual support. Trimming the compact catalog or history window would cut cost
> across every language at once; optimising translation would not.
>
> **Caveat — this is a floor, not the total.** These figures come from
> `MessageProcessing` token counts, which record LLM-1 and LLM-2 only. The translation,
> product-match and embedding calls genuinely happened (`contentEn` was populated for all
> 54 non-English messages) but are not attributed, because the LLM proxy was not in the
> path. The extra-call multiplier in §4.2 is still unmeasured. Re-run with the proxy
> recording to close this.

Original prediction, retained for the reasoning: combined, expect **4–8× the per-message
cost of English**.

### 4.3 The two translation calls are redundant

`ensureMessageContentEn` is invoked on the *same inbound message* twice: once as
fire-and-forget in the webhook (`webhookEventProcessor.ts:443`) and once awaited in the
pipeline (`pipeline.ts:278`). It is idempotent at the database level — it re-reads
`contentEn` and the write is a guarded `updateMany` — but that guard does not prevent a
**duplicate LLM call** if the webhook's translation has not yet landed when the pipeline
checks.

Whether this actually duplicates depends on the gap between webhook and processor, which
is exactly what varies under load. Instrument it: compare the count of translation calls
seen by the LLM proxy against the count of non-English inbound messages. A ratio above
1.0 quantifies the waste, and it may well *improve* under backlog (a longer queue gives
the webhook's call more time to finish first), which would be a counterintuitive and
useful result.

### 4.4 Cost estimate for Phase 1

Roughly 95% of the 1,200 messages are non-English. At 4–8× the English baseline of
~$0.0022, expect **$10–25** for the calibration run rather than the ~$3 an English-only
run would cost. Still trivially affordable, and the reason to measure rather than assume.

### 4.5 Product catalogs must be multilingual

`searchCandidateProducts` enables AI product matching **only** for non-English queries
(`candidateSearch.ts:39`). If test catalogs carry English-only product names while
customers write in Tamil, every product lookup misses, `ProductMatchMiss` fires on
essentially every turn, and the AI matcher runs constantly — measuring a pathological
case rather than a realistic one.

Seed catalogs with product names in the languages being tested so match rates are
realistic. `ProductMatchMiss{language}` then becomes a genuine product-quality signal
rather than an artifact of bad test data.

---

## 5. Required code changes

Two files. Both are additive and default to current production behavior.

### `backend/src/config/env.ts`

Add two optional vars to the Zod schema:

- `WHATSAPP_GRAPH_BASE_URL`
- `WHATSAPP_TYPING_GRAPH_BASE_URL`

Document both in `backend/.env.example`.

### `backend/src/services/whatsappClient.ts`

Lines 5–6 currently hardcode:

```5:7:backend/src/services/whatsappClient.ts
const BASE_URL = 'https://graph.facebook.com/v18.0';
const TYPING_GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const TYPING_TIMEOUT_MS = 800;
```

Both read from env with the current strings as fallback, so unset means production
behavior and there is nothing to remember to revert.

> **Both URLs must be redirected, not just the send URL.** `TYPING_GRAPH_BASE` is used by
> the typing indicator, which fires on the **processor** hot path for every message
> (`whatsappClient.ts:87-103`). If only sends are mocked, every message makes a real
> HTTPS round trip to Meta with a `phone_number_id` Meta does not recognize, behind an
> 800ms timeout. That inflates measured `LatencyMs` by a full network round trip per
> message and would have you diagnosing a bottleneck that is really Meta's rejection
> latency. At high rates it also means thousands of failing requests per second against
> Meta from your app credentials.

Nothing under `backend/src/conversation/` is touched, so
`docs/INCOMING_RESPONSE_GENERATOR_FLOW.md` and its `DOC_SYNC` block remain valid.

---

## 6. Harness components

All under `backend/scripts/loadtest/`. **Built and type-checked; not yet run against
the live pipeline.**

| File | npm script | Purpose |
|---|---|---|
| `mockMetaServer.ts` | `loadtest:mock-meta` | Graph API stand-in |
| `llmProxy.ts` | `loadtest:llm-proxy` | Record/replay OpenAI proxy |
| `seed.ts` | `loadtest:seed` | Vendors, catalogs, manifest |
| `cleanup.ts` | `loadtest:cleanup` | Dry-run by default |
| `generate.ts` | `loadtest:generate` | Paced, HMAC-signed driver |
| `samplePools.ts` | `loadtest:sample` | Queue depth + Postgres activity |
| `report.ts` | `loadtest:report` | Per-language result set |
| `schedule.ts` | — | Send scheduling, unit tested |
| `config.ts` | — | Phone prefixes, paths, manifest types |
| `fixtures/languages.ts` | — | 11 language profiles + turn scripts |
| `fixtures/catalog.ts` | — | 12 products with regional keywords |
| `__tests__/schedule.test.ts` | `test` | Ordering and pacing invariants |

Run artifacts land in `backend/.loadtest/` (gitignored — cassettes contain real model
output and the sent log contains customer-shaped payloads).

> **The regional-language strings in `fixtures/` are LLM-authored and unreviewed by
> native speakers.** They are good enough to exercise script detection, tokenization,
> translation and product matching, so cost and performance findings stand. Do not quote
> a naturalness or quality conclusion from a run until a speaker of each language has
> checked the `turns` arrays.

### 6.1 `mockMetaServer.ts`

Stand-in for the WhatsApp Graph API. Must behave like Meta, not like a happy stub.

- Accepts `POST /:phoneNumberId/messages` for both message sends and the
  typing/read-status body shape
- Returns Meta's real response envelope, including `messages[0].id` — `postToGraph`
  throws if that field is missing (`whatsappClient.ts:30-32`)
- Enforces a configurable per-number throughput cap, default **80 msg/s** (the Cloud API
  default; 1000 msg/s only after Meta upgrades the number)
- Optional 429 and 5xx injection. Worth exercising, because `postToGraph` has no retry
  and no rate limiter (`whatsappClient.ts:13-27`) — a throttle throws and SQS redelivers
- Logs every accepted send, including the reply body, so the report can spot-check that
  regional-language replies came back in the right script

### 6.2 `llmProxy.ts`

Record/replay proxy, wired in via `OPENAI_BASE_URL`. **No code change is needed** for
this — the `openai` v6 SDK reads that env var in its constructor
(`node_modules/openai/client.js:67`), and every call site in the repo constructs the
client with only `apiKey`.

Covers `/v1/chat/completions` and `/v1/embeddings`.

- **Record mode** (Phase 1): forwards to real OpenAI, returns the real response, and
  persists each request/response pair with its observed latency
- **Replay mode** (Phases 2–3, if chosen): matches on a hash of model + messages, falling
  back to a random cassette of the same shape, and reproduces sampled latency

Must preserve the strict `llm1_result` JSON schema and the `usage` token block verbatim —
cost tracking reads `usage`.

Because multilingual traffic routes several *different* call types through the same proxy
(LLM-1, LLM-2, `toVendorEnglish`, product matching, embeddings), the proxy must **tag and
count each type separately**. Classify by model plus system-prompt fingerprint —
`VENDOR_ENGLISH_MODEL` translations are identifiable by the system prompt at
`vendorEnglish.ts:19-28`. Without this breakdown there is no way to attribute cost to
translation versus generation, which is the main thing §4 needs to answer.

> **Replay-mode cost figures are synthetic.** Because replay serves recorded `usage`
> values, a replay run's cost report will look plausible but is a copy of Phase 1's
> numbers. Only the record run's cost is real.

Recording is free, so Phase 1 should always record. It preserves the option to go either
way without a second paid run.

### 6.3 `seed.ts`

Creates vendors, `WhatsAppNumber` rows, multilingual catalogs (§4.5), wallet credits, and
customers. Idempotent. Writes a run manifest JSON — including each conversation's assigned
language — consumed by the generator and by cleanup.

### 6.4 `cleanup.ts`

Dry-run by default; `--confirm` to execute. Deletes in FK-safe order:

`Message` → `MessageProcessing` → `Conversation` → `CustomerInsights` →
`ConversationMemory` → `Order` → `OrderAuditLog` → wallet/credit rows → `Customer` →
`WhatsAppNumber` → `Vendor`

Not safety-critical while production has no real tenants, but required for measurement
hygiene: each run must start from a comparable baseline, and wallet/credit rows otherwise
accumulate across runs.

### 6.5 `generate.ts`

The driver. Signs Meta-shaped payloads with the real `WHATSAPP_APP_SECRET` and POSTs them
to the real API Gateway webhook at the configured rate.

Holds the per-language turn scripts — six turns of realistic order dialogue in each of the
eleven language buckets in §4.1, written in the correct native script so
`detectLanguageFromText` classifies them as intended. Every message carries its expected
language in the manifest so the report can verify detection accuracy.

At 10 msg/s no batching tricks are needed. **For Phase 3 the seeder must use SQS
`SendMessageBatch` directly** — `publishToQueue` sends one message per API call
(`backend/src/queue/sqsClient.ts:27-33`), so driving 1000/s through it would make the
generator the bottleneck rather than the system.

### 6.6 `samplePools.ts`

Samples PgBouncer `SHOW POOLS` every second for the duration of the run and snapshots
`pg_stat_statements` before and after. Preferred over `PRISMA_DEBUG=true`, which is very
verbose and adds latency to the thing being measured.

### 6.7 `report.ts`

Assembles the result set, **broken down by language**. Matches the 1,200 generated wamids
against the mock server's send log to compute a true end-to-end success rate.

---

## 6a. Where the mocks have to run

**The mocks must be reachable from AWS, not from your laptop.** The pipeline executes
inside Lambda, so `http://localhost:8081` is unreachable to it — the mock Graph API and
the LLM proxy have to sit somewhere the functions can resolve, and the override env vars
(`WHATSAPP_GRAPH_BASE_URL`, `WHATSAPP_TYPING_GRAPH_BASE_URL`, `OPENAI_BASE_URL`) have to
be set **on the Lambda functions**, not in `backend/.env`.

Run them on the existing app host (`ap-south-1`, same region as the functions). Same-region
adds a small, consistent hop.

Do **not** tunnel them from a dev machine (cloudflared, ngrok, etc.). Every LLM call would
route Lambda → tunnel → laptop → OpenAI, which injects the laptop's uplink into the exact
latency figure the run exists to measure.

### Preflight without the mocks

A correctness preflight can run before the mocks are hosted, because it validates
behaviour rather than timing. With no overrides set on the Lambdas:

| | Behaviour | Impact |
|---|---|---|
| OpenAI | Real | Desired |
| Typing indicator | Real Meta, rejected (unknown `phone_number_id`) | Inflates latency; no message sent |
| Dispatcher send | Real Meta, rejected (`+999` is unassigned) | DLQ noise; burns concurrency; **no real recipient** |
| Cassette recording | None (proxy unreachable) | Only matters for the measured run |

That is a fair trade for checking language detection, `contentEn`, product matching and
reply generation. It is **not** valid for latency or cost-per-message figures.

> The `+999` prefixes in `config.ts` are what make this safe. With the earlier `+9198…` /
> `+9199…` values — live Indian mobile ranges — an unmocked dispatcher could have sent
> real WhatsApp messages to real strangers.

### Preflight pacing

`buildSchedule` derives the inter-turn gap from the run duration, so a short preflight
gets a short gap: 11 conversations at 1.5 msg/s yields only ~6.5s between turns, which is
less than the 6–9s a multilingual message can take to process. Turn N+1 would arrive
while turn N still holds the conversation lock and you would measure `LockContention`.

Run the preflight at **`--rate 0.4`** (~165s, ~25s gap) instead. The full 1,200-message
run does not have this problem — 200 conversations at 1.5 msg/s gives gaps above 60s,
which `__tests__/schedule.test.ts` asserts.

---

## 7. Run procedure

Set `LOADTEST_WEBHOOK_URL` (the API Gateway webhook endpoint) and `WHATSAPP_APP_SECRET`
before starting — the webhook Lambda verifies the signature and has no bypass flag.

1. **Seed** — `npm run loadtest:seed`, confirm the manifest and the multilingual catalogs
2. **Start mocks** — `npm run loadtest:mock-meta` and `npm run loadtest:llm-proxy`
   (record mode is the default)
3. **Point the pipeline at them** — set `WHATSAPP_GRAPH_BASE_URL`,
   `WHATSAPP_TYPING_GRAPH_BASE_URL`, and `OPENAI_BASE_URL` on the webhook, processor, and
   dispatcher Lambdas. Record the previous values first.
4. **Enable metrics** — set `CLOUDWATCH_METRICS_ENABLED=true` on the processor. It is
   **currently absent** from the deployed env (§0), so metrics default to off and are
   Pino-only. Without this you lose the `LatencyMs` / `Llm1Ms` / `Llm2Ms` percentiles and
   have to reconstruct them from CloudWatch Logs Insights.
5. **Preflight** — `npm run loadtest:generate -- --preflight` sends one full conversation
   per language, 11 conversations. Verify the reply came back in the right script,
   `contentEn` was populated, the detected language matches the manifest, and the product
   matched. This is the step that catches bad turn scripts.
   (`-- --dry-run` prints the schedule without sending anything.)
6. **Reset** — `npm run loadtest:cleanup -- --confirm --keep-vendors`
7. **Run** — start `npm run loadtest:sample`, then `npm run loadtest:generate`.
   ~10–13 minutes at 1.5 msg/s. Watch text-queue depth throughout; a monotonic climb
   means the rate is above what the concurrency quota can absorb and the run should be
   restarted slower.
8. **Settle** — wait for the text queue to drain to zero before collecting. Non-English
   messages hold their Lambda open past the SLA clock (§8), so allow extra settle time.
9. **Report** — `npm run loadtest:report`, then snapshot the OpenAI dashboard for the
   run window

### Aborting

Set the processor Lambda's reserved concurrency to 0 and purge the text queue. Note SQS
allows `PurgeQueue` only once per 60 seconds.

---

## 8. What to measure

| # | Metric | Source |
|---|---|---|
| 1 | Cost per message, **per language** | LLM proxy call log tagged by type (§6.2); cross-check total against the OpenAI dashboard |
| 2 | Latency p50 / p95 / p99, **per language** | `LatencyMs` (CloudWatch, namespace `ChatLogix/ConversationParity`) |
| 3 | LLM-2 trigger rate | `Llm2Skipped` count vs. total messages |
| 4 | Success rate | `MessageProcessing` rows at `status='queued'` vs. 1,200; plus mock-server send log |
| 5 | **PgBouncer multiplexing ratio** | `SHOW POOLS`: `cl_active` vs `sv_active`, and whether `cl_waiting` is ever non-zero |
| 6 | **Peak Lambda concurrent executions** | CloudWatch `ConcurrentExecutions` on the processor |
| 7 | Translation call ratio | Proxy translation-call count ÷ non-English inbound count (§4.3) |
| 8 | `ProductMatchMiss{language}` rate | CloudWatch, emitted at `candidateSearch.ts:45` |
| 9 | Language detection accuracy | Detected language vs. manifest expectation |
| 10 | **Lambda `Duration` vs. `LatencyMs` gap** | CloudWatch — see below |

Metrics 5, 6, and 10 are the ones that matter most for the ceiling, and they are the
least obvious.

### Measured 2026-09-11 (preflight, 66 messages, 1 msg/s, unmocked)

Pipeline latency, `handler_start` → `response_queue_published`, from Logs Insights:

| lang | n | min | p50 | p95 | max | mean |
|---|---|---|---|---|---|---|
| hi | 6 | 2316 | 2647 | 8911 | 8911 | **4942** |
| pa | 6 | 2301 | 3234 | 8687 | 8687 | 4244 |
| te | 6 | 3330 | 3794 | 4849 | 4849 | 3996 |
| latin_mixed | 6 | 1277 | 2610 | 6486 | 6486 | 3492 |
| mr | 6 | 2278 | 3548 | 4642 | 4642 | 3379 |
| ta | 6 | 2242 | 3361 | 4552 | 4552 | 3364 |
| gu | 6 | 2274 | 2532 | 4084 | 4084 | 3016 |
| kn | 6 | 2215 | 2487 | 3717 | 3717 | 2990 |
| bn | 6 | 2368 | 2577 | 3374 | 3374 | 2898 |
| ml | 6 | 1967 | 2530 | 3395 | 3395 | 2732 |
| **en** | 6 | 1213 | 1433 | 3666 | 3666 | **2242** |
| **ALL** | **66** | **1213** | **3234** | **6486** | **8911** | **3390** |

Lambda `Duration` over the same window: mean 4319ms, p50 4102, p95 7668, p99 9854,
max 10079. 66 invocations, **0 errors, 0 throttles**, peak concurrency 5.

**Cost is language-independent; latency is not.** §4.4 measured cost at 1.00–1.06×
English, but latency runs **1.2–2.2× English** — Hindi averages 4942ms against English's
2242ms. The extra LLM round trips in §4.2 are real; they just do not show up in cost
because the token counts are dominated by the fixed ~2,950-token prompt. Latency has no
such fixed floor, so the extra calls land on it directly.

That matters more than the cost finding: at a fixed concurrency budget, throughput is
`concurrency ÷ duration`, so multilingual traffic needs roughly twice the containers per
msg/s — and containers are what exhaust the 100-connection database.

No latency growth across turns (means 3065 / 3526 / 3712 / 3930 / 2504 / 3605 ms for
turns 1–6), so accumulating history is not yet a driver at six turns.

### Why `Duration` and `LatencyMs` diverge on non-English traffic

The SLA clock stops at `publishedAt` (`pipeline.ts:137`), immediately after the response
queue publish. But the assistant-reply translation runs *after* that, at
`pipeline.ts:140`, and it is awaited.

So on non-English traffic the Lambda keeps running — **holding its conversation lock and
its database connection** — for an extra translation round trip that `LatencyMs` does not
capture. Customer-visible latency looks fine while concurrency demand is quietly inflated,
and concurrency demand is what exhausts the connection pool.

Track `Duration − LatencyMs` per language. If that gap is large on regional languages, the
DB ceiling arrives sooner than any latency graph would suggest, and moving line 140 off
the critical path becomes the cheapest available throughput win.

**Measured: the gap is real.** Mean Lambda `Duration` was 4319ms against a mean
`LatencyMs` of 3390ms — **~929ms per message spent after the SLA clock stops**, while
still holding the conversation lock and the database connection. Since only 9 of 11
profiles translate, the true per-multilingual-message gap is higher still.

That is roughly 21% of every invocation doing work the customer is not waiting for, and
it inflates the container count — and therefore the connection count — for no
customer-visible benefit. Making `pipeline.ts:140` fire-and-forget is the cheapest
throughput win available.

### Extrapolating the ceiling

While the concurrency quota is 10, the ceiling is not a mystery to be measured — it is
simply:

```
ceiling ≈ concurrency_quota ÷ mean Lambda Duration
```

So Phase 1's real job on this front is to measure **mean `Duration` per language**
accurately, because that single number combined with whatever quota you end up with
gives the throughput ceiling directly:

```
post-quota ceiling ≈ new_quota ÷ mean Duration
                   ≈ 1000 ÷ 6s  ≈ 165 msg/s   (multilingual, illustrative)
```

That also shows why shaving the per-message duration matters more than any infrastructure
change: at a fixed quota, throughput is purely the inverse of duration. Removing the
duplicate translation call (§4.3) and moving the post-SLA translation off the critical
path would cut duration materially, and therefore raise the ceiling proportionally.

**With the quota raised and PgBouncer in the path** (§0), the relevant limit is now
PgBouncer's `default_pool_size` and transaction hold time, not raw Postgres
`max_connections`. `samplePools.ts` should sample `SHOW POOLS` during Phase 1 to establish
the multiplexing ratio before Phase 2.

**Prediction to test in Phase 1:** English messages ~3s mean `Duration`, multilingual
6–9s. Peak `ConcurrentExecutions` should sit below 10 at 1.5 msg/s; if it pins at 10 with
`Throttles` climbing, the rate is still too high.

---

## 9. Predicted bottlenecks

Ordered by expected point of failure. Every row is code or config in this repo.

Re-ranked 2026-09-11 after the concurrency quota went from 10 to 1000 and PgBouncer
cutover landed (all five Lambdas on 6432).

| Rank | Component | Measured / configured limit | Evidence |
|---|---|---|---|
| **1** | **PgBouncer pool** | `default_pool_size` TBD (setup suggested **15**); transaction hold time sets backend demand | §0 — confirm via `SHOW POOLS` in Phase 1 |
| 2 | Per-message `Duration` | Sets how many containers a given rate needs: containers ≈ rate × duration | §4.2 |
| 3 | OpenAI org rate limit | 1–6 calls/message multilingual, **no retry, no backoff** | `llm1.ts:11,48`, `llm2.ts:10`, `vendorEnglish.ts:78` |
| 4 | Product matcher AI rate limit | **10 calls/min/vendor**, in-memory — non-English only | `productMatcher.ts:102-104` |
| 5 | Redis conversation lock | **300s** TTL matches Lambda timeout ✓ (2026-09-12) | `conversation/lock.ts` |
| 6 | Lambda account concurrency | 1000; all five reserved (132 total) | §0 |
| 7 | SQS batch size | 1 on text; **10** on audio/image/response | §0 |
| 8 | Meta send throughput | 80 msg/s per number by default; no app-side limiter | `whatsappClient.ts:13-27` |

Raw Postgres `max_connections` (100) is no longer rank 1 — PgBouncer multiplexes Lambda
clients. The ranking should be re-validated empirically in Phase 1; ranks 2–8 are
unchanged from the pre-cutover estimate.

Multilingual traffic promotes ranks 2 and 3, because per-message call count roughly
triples.

### Rough ceilings at the current configuration

```
containers needed ≈ rate × mean Duration
  1.5 msg/s × 6s  ≈   9 containers    safe
   10 msg/s × 6s  ≈  60 containers    near the limit
   16 msg/s × 6s  ≈  96 containers    at the limit — connection refusals begin
 1000 msg/s × 6s  ≈ 6000 containers   6x the Lambda quota, 60x the DB
```

With PgBouncer in the path those numbers change completely, because transaction pooling
means a container only holds a backend while a transaction is open — and most of a
message's life is spent waiting on OpenAI, not in a transaction. That is why the cutover
is the highest-leverage change available, and why §8's multiplexing ratio becomes worth
measuring the moment it lands.

### The product matcher's rate limiter gets weaker as you scale

`aiRateLimitMap` is a module-level `Map` (`productMatcher.ts:102`), so in Lambda it is
**per container**, not per vendor. At 30 containers the effective allowance is ~300
calls/min/vendor; at 300 containers it is ~3,000. It therefore throttles hardest at low
concurrency and barely functions at high concurrency — the opposite of what a rate limiter
should do.

Practical consequence for Phase 1: this limiter may bite at 10 msg/s and then appear to
"fix itself" in Phase 3. Do not read that as the system improving. The same applies to
`aiMatchCache` and `normalizedStringCache`, which are per-container and start cold on every
scale-out, so cache hit rates will look worse at high concurrency.

### Expected behavior at high rate

**At the current quota of 10 there is no cascade** — just throttling. Excess load parks
in SQS, `ApproximateAgeOfOldestMessage` climbs, and `Throttles` appears on the Lambda.
Nothing fails; everything queues. With a 1800s visibility timeout and `maxReceiveCount=5`
on the text queue, messages tolerate a long backlog before reaching the DLQ.

**After the quota is raised and PgBouncer is in the path** (both done 2026-09-11), the
predicted cascade is: Lambda concurrency rises → many PgBouncer clients queue (`cl_waiting`
climbs) → backends saturate at `default_pool_size` → Prisma hits `pool_timeout=3` and
throws `P2024` → `batchItemFailures` → SQS redelivers → additional load against an
already-saturated pool → DLQ after `maxReceiveCount=5`. Phase 1 should confirm whether
this knee appears and at what rate.

**Where failures land matters for cost.** Identity resolution, the lock, the idempotency
gate, and the credit guard all run *before* LLM-1, so a database collapse produces cheap
retries. A failure in `persistTurn`, after the LLM has already run, re-runs LLM-1 on each
redelivery — 3× spend per affected message. On multilingual traffic that redelivery also
re-runs the inbound translation.

**A rate-limit failure looks like a system failure.** Because LLM-1 has no backoff, an
OpenAI 429 produces a rising DLQ depth identical in shape to a database collapse. Check
OpenAI 429 counts before concluding the DB failed.

---

## 10. Gotchas that silently invalidate a run

- **Unmocked typing indicator** — adds a failing Meta round trip to every message. §5.
- **Reused `whatsappMessageId`** — messages are ACKed without work by three separate
  dedup layers. §3.
- **English-only catalogs with non-English customers** — AI matching runs on every turn
  and `ProductMatchMiss` saturates. Measures a pathological case. §4.5.
- **Turn scripts in the wrong script** — a Tamil conversation written in Latin
  transliteration is detected as `en` and skips every translation path. Verify detection
  against the manifest. §4.1.
- **Untagged LLM proxy log** — without per-call-type tagging you cannot separate
  translation cost from generation cost, which is the main question §4 exists to answer.
- **Too few distinct conversations** — measures Redis lock contention instead of
  throughput. Verify `LockContention` is ~0.
- **Vendors without wallet credits** — every message takes the `guard_no_credit` path and
  never reaches an LLM.
- **Single-turn conversations** — under-reports cost per message. §3.
- **`CLOUDWATCH_METRICS_ENABLED` unset** — percentiles are lost; only Pino logs remain.
- **Collecting before the queue drains** — in-flight messages are missing from the
  success count. Allow extra settle time for post-SLA translation work. §8.
- **Reading `LatencyMs` alone** — hides the post-publish translation that holds locks and
  connections. Always pair it with Lambda `Duration`. §8.
- **`publishToQueue` used as the Phase 3 seeder** — the generator becomes the bottleneck. §6.5.
- **Stale Lambda env after the run** — unset the three base-URL overrides, or real vendor
  traffic will be routed to a mock. Defaults are safe when unset.

---

## 11. Reference: hot-path facts

Per inbound text message:

- **~4–6 Postgres queries** in the webhook (`ensureConversation`, reply-to lookup,
  `message.create`, `conversation.update`)
- **~12–20 Postgres queries** in the processor (identity, idempotency gate, inbound
  upsert, `aiPaused` check, credit guard, prefetch misses, `persistTurn` transaction)
- **1 LLM-1 call** always, `max_completion_tokens: 400`, `temperature: 0.3`, strict
  `json_schema` (`llm1.ts:48-59`)
- **1 LLM-2 call** when a mutating cart op was applied, `needsVerify` is set, or
  confidence is below `VERIFY_THRESHOLD` (default 0.75). Skipped for `set_field`-only
  turns (`llm2.ts:27-33`)
- **1 embedding call** if the vendor has active FAQs
- **1 typing-indicator call** to Meta, 800ms timeout, non-throwing
- **1 SQS publish** to the response queue, which stops the `LatencyMs` clock
  (`pipeline.ts:137`)

Additionally, **on non-English messages only**:

- **1–2 inbound translation calls** — `gpt-4.1-mini`, `max_completion_tokens: 800`,
  `temperature: 0` (`vendorEnglish.ts:78-85`); see §4.3 on the redundancy
- **1 assistant-reply translation call**, after the SLA clock stops (`pipeline.ts:140`)
- **1 translation call per `set_field`** op on `name`, `address`, `notes`, or
  `delivery_date` (`vendorEnglish.ts:174-195`)
- **AI product matching enabled** (`candidateSearch.ts:39`), rate-limited per container
- **`ProductMatchMiss{language}`** emitted on lookup failure (`candidateSearch.ts:45`)

Model default is `gpt-4.1-mini`, per-vendor overridable. Target cost is **<$0.0022 per
message**; Phase 1 measures the actual, per language.

---

## 12. Progress log

| Date | Milestone |
|---|---|
| 2026-09-11 | Harness built (`backend/scripts/loadtest/`, `npm run loadtest:*`); AWS ground truth measured (§0) |
| 2026-09-11 | Lambda account concurrency quota raised 10 → 1000 (`L-B99A9384`) |
| 2026-09-11 | Processor reserved concurrency set to 80 |
| 2026-09-11 | PgBouncer cutover **done** — all five Lambdas' `DATABASE_URL` on port 6432 (AWS CLI verified) |
| 2026-09-11 | Webhook handler reserved concurrency set to **30** |
| 2026-09-11 | Dispatcher (15), media-fetcher (5), order-recovery (2) reserved — **132 total** |
| 2026-09-12 | Conversation lock TTL raised 60s → **300s** (`DEFAULT_LOCK_TTL_MS`) |
| 2026-09-11 | `chatlogix-lambda-role` granted `cloudwatch:PutMetricData` for `ChatLogix/ConversationParity` |
| 2026-09-11 | `npm run loadtest:probe-pgbouncer` + `samplePools` SHOW POOLS sampling added |
| 2026-09-11 | `CLOUDWATCH_METRICS_ENABLED=true` on processor; IAM `cloudwatch:PutMetricData` still missing |
| — | Phase 1 calibration run (1,200 messages) — **not started** |

**Early-stage note (0–50 vendors):** At typical Starter/Pro usage (~0.002–0.5 msg/s peak),
the stack is comfortably oversized. The load-test plan targets the **1,000-vendor /
~40–60 msg/s** ceiling from `CONVERSATION_PROCESSOR_LAMBDA.md`, not day-one vendor count.

---

## 13. Open items

### Blocking

- [x] ~~File the Lambda concurrency quota increase~~ — **done 2026-09-11**, `L-B99A9384`
      raised from 10 to 1000
- [x] ~~Protect the database before Phase 2 — reserve all five Lambdas~~ — **done 2026-09-11**
      (132 total, set manually in AWS). Still open:
      confirm PgBouncer `default_pool_size` under load (§0)
- [x] ~~Set `CLOUDWATCH_METRICS_ENABLED=true` on the processor~~ — **env var set
      2026-09-11**
- [x] ~~Grant `cloudwatch:PutMetricData` on `chatlogix-lambda-role`~~ — **done 2026-09-11**
      (`scripts/deployment/chatlogix-cloudwatch-custom-metrics.policy.json`). Metrics appear
      after the next processor cold start + message.

### Config decisions before Phase 2

- [x] ~~Cut Lambda `DATABASE_URL` over to PgBouncer on port 6432~~ — **done 2026-09-11** on
      all five functions (AWS CLI verified)
- [ ] Confirm Postgres `max_connections` — `SELECT setting FROM pg_settings WHERE name='max_connections'`;
      `samplePools.ts` already reads and prints it at startup
- [ ] **Confirm the deployed PgBouncer `default_pool_size`** via `SHOW CONFIG` / `SHOW POOLS`
      under Phase 1 load — run `npm run loadtest:probe-pgbouncer` (needs
      `PGBOUNCER_ADMIN_URL` with **postgres** user) or on the DB host:
      `bash scripts/deployment/probe-pgbouncer-on-host.sh`. `samplePools` records
      `cl_waiting` / `sv_active` during Phase 1.
- [ ] **Restrict public access to 5432/6432** on the database host (§0 security note) —
      separate from load testing, but found while verifying reachability

### Correctness fixes surfaced by this work

- [x] ~~Lock TTL vs. Lambda timeout~~ — **fixed 2026-09-12**, `DEFAULT_LOCK_TTL_MS` = 300s
- [ ] **Add `ReportBatchItemFailures`** to the audio-queue, image-queue, and
      response-queue event source mappings. At batch size 10 without it, one failure
      redelivers all 10 — on the dispatcher that means duplicate customer sends (§0)

### Analysis

- [x] ~~Confirm the processor Lambda's SQS trigger batch size and visibility timeout~~ —
      measured 2026-09-11: batch size 1, visibility 1800s, `maxReceiveCount` 5 (§0)
- [ ] Decide real vs. replay for Phases 2–3, using Phase 1's per-language cost figures
- [ ] Consider adding OpenAI retry/backoff to `llm1.ts` and `llm2.ts` regardless of load
      testing — the current behavior drops customer messages to the DLQ on any transient
      429
- [ ] If §8 confirms a large `Duration − LatencyMs` gap, evaluate moving the assistant
      translation at `pipeline.ts:140` off the critical path (fire-and-forget, or a
      separate queue) to release the lock and DB connection sooner
- [ ] If §4.3 confirms duplicate translation calls, drop one of the two
      `ensureMessageContentEn` invocations
- [ ] Reconsider whether `productMatcher`'s per-container rate limiter should be
      Redis-backed, given it inverts under scale
