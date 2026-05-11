# WhatsApp Conversation Parity Implementation Plan

## Purpose

Define the business logic and delivery plan required to make the ChatLogix Conversation page reflect WhatsApp conversations with high fidelity, so vendors do not miss customer context (reactions, media, quoted replies, and status changes).

## Problem Statement

Current conversation handling is text-first and does not consistently preserve all WhatsApp message details. This causes information loss in the UI and can reduce order and support quality.

## Goals

- Capture and persist all customer-visible WhatsApp conversation events that matter to vendors.
- Render conversations in `frontend_v2/apps/web-vendor` with WhatsApp-like fidelity for key message types.
- Preserve backward compatibility for existing conversation flows.
- Introduce measurable exit criteria to declare rollout complete.

## Non-Goals (Phase 1)

- Perfect visual clone of WhatsApp Web.
- End-to-end encryption guarantees beyond WhatsApp platform constraints.
- Migration of deprecated `frontend/` app.
- Message edit and "delete for everyone" handling. WhatsApp supports both; they are deferred to a follow-up phase. The schema should leave room for them (e.g., `editedAt`, `deletedAt`) but the ingestion and UI work is out of scope here.

## Current Capability Summary

- Inbound parsing supports only a narrow set of message types (`text`, `audio`, `image`, `document`) and does not model all event categories.
- Webhook processing currently skips unsupported media/event types in primary flow.
- `Message` persistence is limited (no dedicated reaction model, no durable media metadata model, no delivery/read state timeline).
- Conversation UI rendering is text-oriented; message type rendering does not yet cover full media/reaction parity.

## Target Business Logic

### 1) Canonical Message Event Ingestion

Every inbound WhatsApp webhook event should be normalized into one of:

- `message_created` (text/media/interactive/location/contact/sticker/video/audio/document)
- `message_reaction_added`
- `message_reaction_removed`
- `message_status_updated` (sent/delivered/read/failed when available)
- `message_context_linked` (quoted/replied-to linkage)

Store the raw webhook payload for traceability and debugging.

### 2) Message Identity and Linking

Each message must keep an immutable external provider ID (`whatsappMessageId`), mapped to internal `Message.id`. This applies to **both inbound and outbound** messages — outbound IDs are returned by the WhatsApp Send Messages API response and must be persisted by the response worker at send time, not retrofitted.

This is required to reliably:

- attach reactions to the correct message
- apply status updates to the correct message (inbound and outbound delivery/read states)
- link quoted/reply context

**Idempotency reconciliation.** `DuplicateMessageService` already dedupes inbound webhooks by `whatsappMessageId`. The new persistence path adopts the same key as its idempotency guarantee — there is one source of truth, not two. The duplicate check moves into the ingestion writer (DB-level unique constraint on `whatsappMessageId`) and `DuplicateMessageService` is either deleted or repurposed as a thin pre-queue cache to avoid hot DB writes on bursts.

### 3) Media Handling Logic

For media events:

1. Persist placeholder message immediately (`processing` state).
2. Queue async media fetch job using WhatsApp media ID.
3. Retrieve media securely from WhatsApp API.
4. Store media in durable storage (with controlled access URL). WhatsApp-hosted media URLs expire (~30 days), so the canonical URL on the `Message` row must point at our storage, never at WhatsApp's CDN.
5. Update message metadata (`mediaUrl`, `mimeType`, filename, duration, dimensions, caption).
6. Mark state as `ready` or `failed` with retry policy.

**Retention.** Default media retention is 12 months from message timestamp, enforced via S3 lifecycle rules. Beyond that, the row remains but `mediaUrl` returns a tombstone state in the API and the UI renders a "media expired" placeholder. Retention is configurable per vendor for compliance customers.

**Outbound parity.** The same media model applies to outbound (vendor → customer) messages: when our worker sends a media message, it must persist the resulting WhatsApp `messageId` and a pointer to the source media so status webhooks can link back.

### 4) Reaction Logic

- Reactions are idempotent upserts keyed by `(messageId, reactor)`. WhatsApp allows only one active reaction per user per message, so a new emoji from the same reactor must replace the existing row, not insert a second one. The `emoji` field is mutable.
- Reaction removal sets the active row inactive (soft-delete) rather than hard-deleting, so the chip can disappear in UI while audit history is preserved.
- A separate `MessageReactionHistory` (or append-only audit row) captures every add/change/remove event with timestamp for analytics and dispute resolution.
- UI shows aggregated reaction chips and counts per message based on currently active rows only.

### 5) Conversation Read Model for UI

The conversation messages API returns a normalized, enriched message shape covering identity, media, reactions, quoted reply, and status. **See Phase 3 §"Enriched Message DTO" for the canonical schema.**

### 6) Rendering Rules (Vendor UI)

The vendor UI renders nine message types via a per-type dispatcher: `text`, `image`, `video`, `audio`, `document`, `location`, `sticker`, `contact`, `interactive`. Each has its own component handling layout and interaction; a shared shell handles alignment, status indicator, reaction chips, timestamp, and quoted-reply preview. **See Phase 4 §"Component Layout" and §"Locked Decisions" for per-type design choices** (e.g., custom lightbox for image/video, custom audio player without waveform, address card for location).

## Implementation Plan

## Phase 0 - Foundation and Contracts

- Finalize normalized event schema and message DTO contract.
- Define migration strategy for existing rows.
- Add OpenAPI contract updates for enriched message responses.
- Decide on `MessageType` representation: widen the existing Prisma enum (Postgres `ALTER TYPE ADD VALUE` for `location`, `sticker`, `video`, `contact`, `interactive`) vs. migrate to a free string with a check constraint. Document the decision and migration steps before Phase 1 schema work begins.
- **AI pipeline contract for media — RESOLVED.** Media messages bypass the AI pipeline entirely for now. The webhook persists the message and queues media fetch; it does **not** publish to the AI queue. Vendors see media in the conversation UI and respond manually. Only `text` messages are AI-processed. This matches the existing "AI Parser only for text" policy and removes the unhydrated-media complexity from the orchestrator. Audio transcription via Whisper (feeding transcripts into the AI pipeline) is the planned future extension; image/video/document/location/sticker/contact stay opaque to AI long-term.
- Publish a sample enriched message DTO (JSON) showing exactly which legacy fields stay and which are added, so frontend and any external consumers can plan changes without integration drift.

Deliverables:

- approved schema design (including `MessageType` decision) — implemented in Phase 1
- approved API contract with sample DTO — implemented in Phase 3
- approved AI-pipeline media-handling contract — RESOLVED above (media bypasses AI)
- rollout feature-flag mechanism — `Vendor.featureFlags Json?` in Phase 1 schema; per-vendor read logic in Phase 5 §1; flag scope (gates ingestion) in Phase 5 §"Flag Scope"

## Phase 1 - Data Model and Backend Storage

### Locked Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | `MessageType` representation | Widen the existing Prisma enum (add `video`, `location`, `sticker`, `contact`, `interactive`) |
| 2 | Quoted-reply linkage | Hard FK `replyToMessageId` → `Message.id`; replies whose parent isn't in our DB lose the link |
| 3 | Media metadata | Split into a `MessageMedia` 1:1 table |
| 4 | Status timeline | Full timeline in `MessageStatusEvent` (outbound only) + denormalized latest `status` on `Message` |
| 5 | Reactor identity | FK to `Customer`; auto-create `Customer` row for unknown reactor phone numbers (mirrors `ensureConversation`) |
| 6 | Backfill of legacy rows | Leave `whatsappMessageId` NULL; backfill `Message.status` once via UPDATE (`vendor → sent`, `customer → delivered`) |
| 7 | Media storage backend | S3, key pattern `vendor/<vendorId>/<customerId>/<YYYY-MM>/<messageId>.<ext>`; original filename preserved on `MessageMedia.filename` |
| 8 | Outbound persistence timing | Write `Message` row with `status = pending` and `whatsappMessageId = null` *before* calling Send API; update with returned ID + `sent` on success, `failed` + `failureReason` on error |

### Schema Changes

**`Message` (additions):**

- `whatsappMessageId String?` — partial unique (Postgres treats NULL as distinct)
- `replyToMessageId String?` — FK to `Message.id`, `onDelete: SetNull`
- `status MessageStatus` — default `pending`
- `failureReason String?` — populated on outbound send failure
- `structuredPayload Json?` — type-specific payload for `location` (lat/lng/address), `contact` (vCard fields), `interactive` (button/list IDs), and any other structured event. Type field on `Message` discriminates the shape.
- `editedAt DateTime?` — reserved for future edit phase, not populated by ingestion
- `deletedAt DateTime?` — reserved for future delete phase, not populated by ingestion
- New indexes: `[replyToMessageId]`, unique on `[whatsappMessageId]`

**New enum `MessageStatus`:**

`pending`, `processing`, `sent`, `delivered`, `read`, `failed`

**Widen enum `MessageType`:**

Add `video`, `location`, `sticker`, `contact`, `interactive`. Postgres `ALTER TYPE ADD VALUE` requires the migration to disable transactions (split into separate raw SQL steps).

**New model `MessageMedia`** (1:1 with `Message`):

`id`, `messageId @unique`, `whatsappMediaId`, `s3Bucket`, `s3Key`, `mimeType`, `filename`, `caption`, `durationSec`, `width`, `height`, `fileSizeBytes`, `fetchState` (enum: `pending` | `ready` | `failed` | `expired`), `fetchAttempts`, `lastFetchError`, `fetchedAt`, `expiresAt`, `createdAt`, `updatedAt`. Index `[fetchState, createdAt]` for retry sweep.

**New model `MessageStatusEvent`** (outbound only):

`id`, `messageId`, `status`, `occurredAt` (from WhatsApp event timestamp), `recordedAt`, `rawPayload`. Unique `[messageId, status, occurredAt]` for dedup. Index `[messageId, occurredAt]`.

**New model `MessageReaction`:**

`id`, `messageId`, `reactorId` (FK → `Customer`), `emoji`, `active` (default `true`), `createdAt`, `updatedAt`. Unique `[messageId, reactorId]`. Index `[messageId, active]`.

**New model `MessageReactionHistory`** (append-only audit):

`id`, `messageId`, `reactorId`, `emoji` (null on remove), `action` (enum: `added` | `changed` | `removed`), `occurredAt`, `recordedAt`. Index `[messageId, occurredAt]`.

**`Customer` (additions):**

- back-relation `reactions MessageReaction[]`

**`Vendor` (additions):**

- `featureFlags Json?` — per-vendor feature flag map. Single key for this work: `whatsapp_conversation_parity` (boolean). Read by extending [`featureFlags.ts`](../../../backend/src/config/featureFlags.ts) per-vendor checks (see Phase 5 §1 for the read logic). Bundled into Phase 1 because Phase 2 routing changes must be flag-gated, which requires the column to exist before Phase 2 ships.

### Backfill Steps (post-migration)

1. Single UPDATE: `Message.status` set to `sent` for `senderType = 'vendor'` rows, `delivered` for `senderType = 'customer'` rows. Avoids breaking any UI that filters on status from day one.
2. Legacy rows keep `whatsappMessageId = NULL`; status/reaction webhooks for those messages will not link (accepted gap, see Risks).

### Deliverables

- Prisma migration merged and deployed (with `ALTER TYPE` steps split for transaction safety)
- Backward-compatible read/write paths
- DB-level idempotency replaces or subsumes `DuplicateMessageService`
- One-shot backfill UPDATE executed in production

## Phase 2 - Webhook and Worker Pipeline

### Locked Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | AI processing scope | AI pipeline runs on `text` and `interactive` messages only. For interactive events, the resolved button/list label feeds the pipeline as text; the full structured selection is preserved in `structuredPayload` for analytics. All media types (audio, image, video, document, sticker, location, contact) and reactions are stored and rendered but never reach the AI pipeline. Audio transcription (future) will be the first media type to enter AI processing. |
| 2 | Future AI media interpretation roadmap | Audio → Whisper transcription → existing pipeline. Image, video, document, location, sticker, contact remain opaque to AI long-term. |
| 3 | Structured payload for non-media types | Single `structuredPayload Json?` column on `Message` (added in Phase 1 schema). |
| 4 | Out-of-order events (status/reaction arriving before parent) | Buffer in Redis with 5-min TTL; reprocess on parent arrival; drop after TTL with metric. |
| 5 | Media worker topology | New 5th PM2 process `media-worker` + new SQS queue `MEDIA_FETCH_QUEUE`. Independent from `incomingMessageWorker`. |
| 6 | Media fetch retry policy | 5 attempts, exponential backoff (1s, 5s, 30s, 5min, 30min). Terminal state recorded as `MessageMedia.fetchState = failed`; no DLQ — UI tombstone is the user-facing fallback. Metric on terminal failures. |
| 7 | Credit pricing for new types | text=1, audio=3, image=2 (existing); video=10, location=1, sticker=0, contact=1, interactive=1, reactions=0. |
| 8 | Orphan status/reaction events for legacy outbound | Drop and log (accepted legacy gap, already in Risks). |

### Webhook + Parser Work

- Expand `waParser.ts` to normalize: text, audio, image, document, video, location, sticker, contact, interactive, reactions (`message_reaction`), status updates (`statuses` events), and quoted-context (`context.id` linkage).
- Replace the `Skipping unsupported message type` branch in `webhook.ts` with persist-and-process for all media types. Persist `Message` row + `MessageMedia` placeholder, then enqueue to `MEDIA_FETCH_QUEUE`.
- Webhook routing rule: only `text` and `interactive` messages publish to `INCOMING_QUEUE_URL` for the AI pipeline. All other types persist + (if media) queue media fetch + stop.
- For status/reaction events arriving for unknown `whatsappMessageId`, write to a Redis hash `wa:orphan:<msgId>` with 5-min TTL. The webhook also checks this hash on every new `message_created` and replays buffered events for that ID.

### Media Worker (`media-worker`)

- New PM2 process consuming `MEDIA_FETCH_QUEUE`.
- Pulls media from WhatsApp Graph API using vendor-scoped access token.
- Uploads to S3 with key `vendor/<vendorId>/<customerId>/<YYYY-MM>/<messageId>.<ext>`.
- Updates `MessageMedia.fetchState`, `s3Key`, `mimeType`, `fileSizeBytes`, dimensions/duration where extractable.
- Retry envelope per decision #6; on terminal failure sets `fetchState = failed` with `lastFetchError` populated.
- Emits metrics: `media.fetch.success`, `media.fetch.attempt`, `media.fetch.terminal_failure`, `media.fetch.duration_ms`.

### Outbound Pipeline Changes

- `whatsappClient.ts` send wrappers must return the WhatsApp `messageId` from the API response.
- `responseWorker` writes the `Message` row with `status = 'pending'` and `whatsappMessageId = null` *before* calling Send. After the API call:
  - success → update `whatsappMessageId` + `status = 'sent'`
  - failure → update `status = 'failed'` + `failureReason`
- Outbound media: response worker also creates the `MessageMedia` row pointing at our S3-hosted source (we never send a WhatsApp CDN URL to ourselves).

### Credit Accounting Update

- Add the new credit values from decision #7 to the credit-pricing table (wherever `text=1, audio=3, image=2` is currently centralized — likely `creditUsageService` or a config map).
- Reactions are charged 0 but still create a `CreditUsage` row with `creditsConsumed = 0` for analytics consistency. (Confirm if you'd rather skip the row entirely.)

### Deliverables

- No unsupported inbound event is silently dropped (status/reaction/all media types persisted)
- Media processing queue and worker operational, retries observable in metrics
- `MEDIA_FETCH_QUEUE_URL` added to `config/env.ts` and provisioned in LocalStack for dev
- New 5th PM2 entry for `media-worker` added to `ecosystem.config.js`
- Outbound message rows carry `whatsappMessageId` from send time
- Redis-buffered out-of-order event replay verified by integration test
- Credit pricing extended for new types and tested
- AI pipeline unchanged for text; interactive messages now also reach it (with structured payload preserved); media/reactions/status never reach it (regression test asserts this)

## Phase 3 - Conversations API Enrichment

### Locked Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Response shape strategy | **Additive.** New nullable fields land on the existing `/api/conversations/:id/messages` endpoint; existing fields untouched. No version bump. |
| 2 | Reactions shape | **Array** of `{ reactorId, emoji, createdAt }`; UI does its own aggregation. |
| 3 | Quoted reply shape | **Shallow preview** — `replyTo: { id, contentPreview, type, senderType, timestamp }` (~80-char snippet, no recursion). |
| 4 | Media URL access | **Server proxy.** Response carries `mediaUrl: "/api/messages/:id/media"`; that endpoint does auth check and 302s to a fresh pre-signed S3 URL. |
| 5 | Status timeline in payload | **Latest only by default.** Denormalized `status` column on `Message` is returned. Full timeline opt-in via `?include=statusHistory=true`. |
| 6 | No-limit pagination behavior | **Hard cap at 500** most recent messages when no `limit` is provided. Older messages require cursor pagination via `beforeMessageId`. `hasMore` returned even in no-limit mode. |
| 7 | Read marking (write WhatsApp read receipts) | **Deferred** to a follow-up phase. Phase 3 surfaces inbound read state but does not write it back to WhatsApp. |

### Enriched Message DTO

Each message in the response carries:

```jsonc
{
  // existing fields (unchanged)
  "id": "...",
  "conversationId": "...",
  "senderType": "customer" | "vendor",
  "content": "...",
  "type": "text" | "audio" | "image" | "document" | "video" | "location" | "sticker" | "contact" | "interactive",
  "timestamp": "ISO-8601",
  // existing AI/cost fields stay as-is

  // new identity fields
  "whatsappMessageId": "wamid...." | null,
  "status": "pending" | "processing" | "sent" | "delivered" | "read" | "failed",
  "failureReason": "..." | null,

  // new structured payload (location/contact/interactive)
  "structuredPayload": { /* type-specific shape */ } | null,

  // new media (1:1)
  "media": {
    "mediaUrl": "/api/messages/<id>/media",
    "mimeType": "image/jpeg",
    "filename": "...",
    "caption": "...",
    "durationSec": 12,
    "width": 1080,
    "height": 1920,
    "fileSizeBytes": 234567,
    "fetchState": "pending" | "ready" | "failed" | "expired"
  } | null,

  // new quoted reply preview
  "replyTo": {
    "id": "...",
    "contentPreview": "first ~80 chars",
    "type": "text",
    "senderType": "vendor",
    "timestamp": "ISO-8601"
  } | null,

  // new reactions (active only)
  "reactions": [
    { "reactorId": "<customerId>", "emoji": "👍", "createdAt": "ISO-8601" }
  ],

  // new status history (only when ?include=statusHistory=true)
  "statusEvents": [
    { "status": "sent", "occurredAt": "ISO-8601" },
    { "status": "delivered", "occurredAt": "ISO-8601" }
  ]
}
```

### Endpoint Changes

- **GET `/api/conversations/:id/messages`** — extend Prisma query with `include: { media: true, reactions: { where: { active: true } }, replyToMessage: { select: <shallow preview fields> } }`. Conditionally include `statusEvents` when `include=statusHistory=true` query param is set. No-limit mode caps at 500 most recent and returns `hasMore`.
- **GET `/api/messages/:id/media`** — new endpoint. Auth check (vendor owns the conversation), then 302 redirect to a freshly signed S3 URL (~15-min expiry). No body, no caching of the proxy response itself; browser caches the redirect target.

### Pagination Compatibility

- Existing cursor pagination via `beforeMessageId` continues to work; payload per page is bigger but page count is bounded.
- `pageSize` cap raised consideration: current frontend likely passes a fixed limit (verify in `api-client`). If frontend-driven, no change needed. If using no-limit, frontend must handle `hasMore` and call again with `beforeMessageId` for older history.

### Performance Notes

- The `include` adds three relation fetches per page; index on `MessageMedia.messageId` (already unique), `MessageReaction.messageId`, and the existing `Message.replyToMessageId` index keep this O(1) per row.
- No N+1 risk because Prisma compiles relations into JOIN-equivalent queries.
- Server-proxy `/api/messages/:id/media` adds one DB lookup + one S3 sign per media view — acceptable; can add Redis cache on the auth check if it becomes hot.

### Deliverables

- Enriched payload returned on existing endpoint with no breaking change to legacy fields
- New `/api/messages/:id/media` proxy endpoint live with auth + S3 sign
- 500-message cap on no-limit mode, with `hasMore` correctly populated
- Integration test covering: text + media + reactions + reply + status all in one conversation
- Pagination regression test confirming cursor mode still returns oldest→newest within page

## Phase 4 - Frontend Rendering Parity

### Locked Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Component architecture | **Split per type.** `MessageBubble` becomes a thin dispatcher; per-type components (`TextBubble`, `ImageBubble`, `AudioBubble`, `VideoBubble`, `DocumentBubble`, `LocationBubble`, `ContactBubble`, `InteractiveBubble`, `StickerBubble`) handle layout and interaction. A common shell handles alignment, timestamp, status tick, and reaction chips. |
| 2 | Media viewer/lightbox | **Custom-built**, matching design tokens. Adds ~1–2 days but avoids a third-party dependency on a brand-adjacent surface. |
| 3 | Audio player | **Custom UI without waveform** — play/pause button + progress bar + duration label. Waveform deferred to a follow-up. |
| 4 | Location rendering | **Coordinates + address card.** Click opens Google Maps in a new tab. No map provider key, no per-render cost. |
| 5 | Real-time update mechanism | **Keep existing polling** in [`useMessages.ts:308`](../../../frontend_v2/apps/web-vendor/src/components/conversations/hooks/useMessages.ts). New reactions/status surface on next poll. Verify interval is ≥ 5s given larger payloads; tune if needed. |
| 6 | Outbound status indicator | **WhatsApp-standard glyphs** — single grey tick (sent), double grey tick (delivered), double blue tick (read), red icon (failed). Tooltip shows the latest status timestamp; aria-label for accessibility. |
| 7 | Quoted reply visual | **WhatsApp-style** — colored vertical accent bar on the left of a small preview card above the bubble content. Click scrolls to parent message. |
| 8 | Reactions chip behavior | Single emoji if count = 1, `<emoji> <count>` if > 1. Tooltip on hover lists reactor names. CSS-only subtle fade/scale on add and remove. |
| 9 | Outbound reply composition (vendor sends a quoted reply) | **Deferred.** Phase 4 is read-parity only. Outbound `context.message_id` support is a separate feature in a follow-up phase. |

### Component Layout

```
MessageBubble (dispatcher)
└─ MessageShell (common: alignment, status tick, reaction chips, timestamp, reply preview)
   └─ TextBubble | ImageBubble | AudioBubble | VideoBubble |
      DocumentBubble | LocationBubble | ContactBubble |
      InteractiveBubble | StickerBubble
```

Path: `frontend_v2/apps/web-vendor/src/components/conversations/bubbles/`. The existing [`MessageBubble.tsx`](../../../frontend_v2/apps/web-vendor/src/components/conversations/MessageBubble.tsx) becomes the dispatcher; current text-rendering logic moves to `TextBubble`.

### Edge-State Matrix

| State | Trigger | UI Treatment |
|---|---|---|
| Media `processing` | Webhook received, media-worker not yet finished | Skeleton/spinner inside the bubble; bubble dimensions reserved if image/video |
| Media `failed` | All retries exhausted | Greyed tile with mime icon + "Couldn't load media" caption; no retry button (terminal) |
| Media `expired` | Past retention tombstone | Greyed tile with "Media expired" label; no link |
| Outbound message `pending` | Row written before WhatsApp Send returns | Bubble rendered but no status tick yet (or "Sending…" hint) |
| Outbound `failed` | Send API rejected | Red exclamation icon next to bubble; tooltip shows `failureReason` |
| Reaction add | New reaction in poll diff | Chip fades/scales in below bubble |
| Reaction remove | Reaction set inactive in poll diff | Chip fades/scales out |
| Reply target missing | Parent not in DB or not in current page | Preview card shows "Original message unavailable"; not clickable |

### Verifications Before Phase 4 Coding

- [ ] Confirm the order-detail modal currently uses (or can be refactored to use) the same renderer. The plan requires shared rendering — file path lookup needed for the order modal's conversation snippet view.
- [ ] Confirm current polling interval in `useMessages.ts` is ≥ 5s; adjust if poll payload growth is significant.
- [ ] Confirm i18n requirements for new UI strings ("Couldn't load media", "Media expired", "Original message unavailable", reaction tooltip) — Tamil/Hindi/English per project conventions.

### Deliverables

- Vendor `Conversations` page renders all WhatsApp message types with no major omissions
- Order modal conversation view uses the same dispatcher (no duplicate renderer)
- Edge-state matrix above is implemented and visually QAed
- Lightbox, audio player, and location card components are unit-tested in isolation
- i18n strings landed in all supported locales

## Phase 5 - Hardening and Rollout

### Locked Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Vendor-level feature flag storage | **`featureFlags Json?` column on `Vendor`.** Single flag key for this work: `whatsapp_conversation_parity` (boolean). Read by extending the existing [`featureFlags.ts`](../../../backend/src/config/featureFlags.ts) per-vendor checks (currently TODO at lines 50–88). Toggle via admin tooling on the vendor record. |
| 2 | Metrics destination | **Hybrid.** AWS CloudWatch Metrics for the small number of alert-driving signals (terminal media-fetch failures, webhook parse failures, orphan-event buffer hit rate, webhook-to-DB p95 latency, media-worker queue depth). Structured Pino logs + CloudWatch Logs Insights for everything else (debugging, ad-hoc investigation). |
| 3 | Alerting destination | **Email** to a shared engineering address. Single channel for all Phase 5 alerts; revisit if alert volume justifies routing. |
| 4 | SLI set | Exit criteria are the customer-facing SLIs. Add three operational SLIs not in exit criteria: webhook-to-DB p95 latency (target < 500ms), media-worker queue depth (target < 100), orphan-event buffer hit rate (informational). |
| 5 | Canary cohort selection | **Staged progression: internal/test vendors → 1–2 friendly real vendors → 25% sample → 100%.** Start with internal. |
| 6 | Cohort progression criteria | **Hybrid.** Each stage advances only when ALL three are true: minimum 1 week elapsed AND no SLI breach during the window AND no critical bug reported. Both calendar and signal gate every step. |
| 7 | UAT scenario ownership | Engineering authors the initial scenario matrix (`{text, image, video, audio, document, location, contact, interactive, sticker} × {inbound, outbound} × {happy path, failure path}`). Product + Support review and add gaps. Manual execution against the canary vendor's staging account. Stored as markdown under `documentation/modules/whatsapp-integration/guides/`. |
| 8 | Cost monitoring (S3 storage) | **CloudWatch billing alarm at $50/month threshold.** Per-vendor storage tracking deferred to a follow-up. |

### Schema Touch

`Vendor.featureFlags Json?` lands in the **Phase 1 migration**, not Phase 5 — Phase 2 routing changes must be flag-gated, which requires the column before Phase 2 ships. See Phase 1 Schema Changes. Existing vendors default to `null` which reads as "all flags off."

### Flag Scope

The `whatsapp_conversation_parity` flag gates **ingestion**, not just rendering. When the flag is OFF for a vendor:

- Webhook follows the legacy path: text messages persist and queue for AI; audio/image/document still log as "skipped"; new types (video, location, sticker, contact, interactive) also skip; reactions and status events are not persisted.
- The conversation API returns the legacy DTO shape (no `media`, `reactions`, `replyTo`, `status`, etc.).
- The frontend dispatcher falls back to the existing text-only `MessageBubble` behavior.

When the flag is ON:

- Full enriched ingestion, persistence, API, and rendering as described in Phases 1–4.

This makes rollback safe — a flag flip removes the new code paths from a vendor's traffic entirely. Trade-off: vendors flagged off accumulate no enriched history during the rollout, so flipping the flag later starts capture from that moment forward.

### Metrics to Emit (CloudWatch)

| Metric | Type | Source | Alert Threshold |
|---|---|---|---|
| `wa.webhook.events_total` | Counter (per type) | webhook router | — (dashboard only) |
| `wa.webhook.parse_failures` | Counter | `waParser.ts` | > 5/min sustained 5 min |
| `wa.media.fetch_terminal_failures` | Counter | media-worker | > 10/hour sustained |
| `wa.media.fetch_duration_ms` | Histogram | media-worker | p95 > 30s sustained 10 min |
| `wa.media.queue_depth` | Gauge | SQS metric | > 100 sustained 5 min |
| `wa.webhook.to_db_latency_ms` | Histogram | webhook router | p95 > 500ms sustained 10 min |
| `wa.orphan_events.buffer_hits` | Counter | webhook router | — (informational dashboard) |
| `wa.reactions.unmatched_total` | Counter | webhook router | > 10/hour (signal of out-of-order or legacy) |

### Rollout Runbook

1. **Pre-launch.** Phase 1 migration deployed and backfilled. Phase 2 + 3 + 4 code merged behind the `whatsapp_conversation_parity` flag, default off. Synthetic webhook fixtures run end-to-end in staging.
2. **Stage 1 — Internal.** Flag enabled for internal/test vendor records. Run the UAT matrix manually. Watch CloudWatch dashboard for 1 week.
3. **Stage 2 — Friendly cohort.** Enable for 1–2 selected real vendors with prior coordination. Watch for 1 week + UAT pass.
4. **Stage 3 — 25%.** Random sample of remaining vendors. Watch for 1 week + SLI pass + zero critical bugs.
5. **Stage 4 — 100%.** Enable globally. Continue monitoring for two consecutive release windows before declaring DoD per the existing exit criteria.

### Rollback Plan

- Per-vendor flag is the rollback lever: setting `featureFlags.whatsapp_conversation_parity = false` reverts the vendor to text-only behavior.
- Schema additions (Phase 1) are non-destructive — no migration rollback needed.
- New SQS queue (`MEDIA_FETCH_QUEUE`) and PM2 worker can be drained and stopped without affecting text flow.
- For a global emergency rollback, flip the global env-var flag in `featureFlags.ts` to disable per-vendor checks at the source.

### Deliverables

- `featureFlags.ts` refactored: per-vendor reads now hit DB (current implementation caches env-var values at startup at [`featureFlags.ts:22-31`](../../../backend/src/config/featureFlags.ts#L22-L31), which doesn't support per-vendor flags). Add a vendor-id-keyed read path with short-lived in-memory cache to avoid hot-path DB pressure. (`Vendor.featureFlags` column itself lands in Phase 1.)
- CloudWatch dashboard live with the 8 metrics above; 5 alarms configured to email
- UAT scenario matrix authored, reviewed, and signed off
- Rollout runbook executed through all four stages
- Two consecutive release windows pass exit criteria before DoD is declared

## Exit Criteria (Definition of Done)

All criteria below must pass:

1. **No Silent Loss:** 100% of inbound WhatsApp events in supported categories are either persisted or explicitly logged as rejected with reason.
2. **Message Identity:** 100% of persisted inbound/outbound messages have stable external message IDs where provided by WhatsApp.
3. **Reaction Fidelity:** Reaction add/remove events are visible in UI and linked to the correct message in at least 99.9% sampled events.
4. **Media Fidelity:** At least 99.5% of inbound media messages become viewable/downloadable in UI within SLA (for example, 30 seconds p95).
5. **UI Parity Coverage:** Text, image, video, audio, document, location, sticker, contact, interactive, quoted reply, and reactions are renderable in both conversation surfaces.
6. **Backward Compatibility:** Existing text conversation flows, pagination, and AI pause behavior remain functional with no regression.
7. **Operational Visibility:** Dashboards and alerts exist for media failures, parse failures, and unmatched reaction/status events.
8. **UAT Sign-Off:** Product + support stakeholders confirm that key WhatsApp scenarios no longer lose critical customer information.

## Validation and Test Matrix

- **Unit:** parser normalization (all 9 inbound types + status + reaction events), reaction upsert/soft-delete logic keyed by `(messageId, reactorId)`, message mapping, metadata transformation, structured-payload encoding for location/contact/interactive.
- **Integration:** webhook → queue → DB → API response path; outbound write-pending-then-update flow; Redis orphan-event buffer replay (status/reaction arriving before parent, then parent arriving within 5-min TTL); media-worker fetch + S3 upload + state transition.
- **E2E:** vendor opens conversation and sees text, image, video, audio, document, location, sticker, contact, interactive, quoted reply, reactions, and outbound status indicators consistently.
- **Regression:**
  - Message sending end-to-end (legacy text path unchanged).
  - AI pause toggle.
  - Cursor pagination via `beforeMessageId`.
  - 500-message hard cap on no-limit mode with correct `hasMore`.
  - Order-modal conversation view uses the same dispatcher as the main page.
  - **AI routing assertion:** only `text` and `interactive` reach the AI queue; media, reactions, and status events never do.
  - Per-vendor flag OFF reverts ingestion to legacy behavior (no enriched persistence).
- **Edge states (UI):** media `processing`, `failed`, `expired`; outbound `pending` and `failed`; reaction add/remove animations; reply target missing.
- **Load:** burst webhook events, media queue throughput, idempotency under duplicate-delivery storms.

## Risks and Mitigations

- Risk: schema changes increase query payload size.  
  Mitigation: selective fields + cursor pagination + indexes.

- Risk: media download failures from provider API.  
  Mitigation: 5-attempt exponential backoff (Phase 2 #6), terminal `MessageMedia.fetchState = failed` recorded, UI tombstone as user-facing fallback, CloudWatch alarm on terminal-failure rate.

- Risk: duplicate/out-of-order webhooks.  
  Mitigation: idempotency keys using external message IDs and event timestamps.

- Risk: rollout regressions in existing conversation page.  
  Mitigation: feature flags + canary vendor rollout + rollback plan.

- Risk: AI pipeline regression on `interactive` messages — the orchestrator now consumes a new message type (button taps, list selections) it previously never saw, with the resolved label as text input and structured payload preserved.  
  Mitigation: regression test asserting only `text` and `interactive` reach the AI queue; per-vendor `whatsapp_conversation_parity` flag falls back to legacy ingestion if AI quality degrades; structured payload available for postmortem if a misroute happens.

- Risk: outbound `whatsappMessageId` not persisted on legacy outbound rows, so status/reaction webhooks for older messages cannot link.  
  Mitigation: accept this as a one-time legacy gap; status updates only resolve for messages sent after the response-worker change; document it in exit criteria scope.

- Risk: WhatsApp media URL expiry (~30 days) leaves dangling references on legacy rows.  
  Mitigation: durable storage from Phase 2 onward; explicit "media expired" state in DTO and UI for older rows.

## Rollout Strategy

See Phase 5 §"Rollout Runbook" for the staged plan, §"Cohort progression criteria" for the gating rules, and §"Rollback Plan" for recovery.

## Ownership

- Backend: webhook ingestion, schema, queue workers, API enrichment.
- Frontend: message renderer parity in conversation surfaces.
- QA/Product: scenario matrix, UAT sign-off, release approval.

