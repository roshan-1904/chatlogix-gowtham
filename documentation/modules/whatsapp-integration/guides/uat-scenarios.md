# WhatsApp Conversation Parity — UAT Scenario Matrix

> **Note:** as of 2026-09-02, the pipeline these scenarios exercise (`webhook.ts`'s `runParityPipeline`, gated by the `whatsapp_conversation_parity` flag) is not on the production WhatsApp path — real traffic hits a separate, simpler Lambda handler that doesn't route through it. See the warning in [conversation-parity-rollout-runbook.md](./conversation-parity-rollout-runbook.md) and `docs/CONVERSATION_WORKER_GAPS.md` §2.5 before using this matrix to sign off a production cohort.

This document is the acceptance-test surface for the Conversation Parity rollout (Phase 5).
Sign-off requires **all rows green** for each rollout cohort (internal → friendlies → 25% → 100%).

> Test grouping: `{9 message types} × {inbound, outbound} × {happy, failure}`. Reactions, status events,
> and quoted replies are cross-cutting and tested separately at the bottom.

## Conventions

- "Inbound" = customer → vendor; the Meta webhook delivers the event. Verify in the vendor `Conversations` page.
- "Outbound" = vendor → customer; sent from the vendor `Conversations` composer or the AI worker.
- "Happy" = the canonical path with the parity flag enabled.
- "Failure" = the documented edge state (network failure, expired media, AI down, etc.). The bubble must render
  the correct placeholder text from `i18n/locales/<lang>/conversations.json`.
- Each row has a **DB check** (Prisma rows landed) and a **UI check** (bubble renders correctly in all three locales: `en`, `ta`, `hi`).

---

## 1. Per-type matrix

| #   | Type        | Direction | Path     | DB check                                                                                | UI check                                                                                       |
| --- | ----------- | --------- | -------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | text        | inbound   | happy    | `Message.type='text'`, `whatsappMessageId` set                                          | `TextBubble` renders content; timestamp inline if single line                                  |
| 2   | text        | inbound   | failure  | (n/a — text is delivered or not at all)                                                 | (n/a)                                                                                          |
| 3   | text        | outbound  | happy    | `Message.status` transitions `pending → sent`; `whatsappMessageId` populated post-send  | StatusTick: single tick (sent), then double (delivered), then blue (read)                      |
| 4   | text        | outbound  | failure  | `Message.status='failed'`, `failureReason` populated                                    | Red exclamation icon + tooltip with failure reason                                             |
| 5   | image       | inbound   | happy    | `Message.type='image'` + `MessageMedia.fetchState='ready'`, `s3Key` set                 | `ImageBubble` renders thumbnail; click opens `Lightbox`                                        |
| 6   | image       | inbound   | failure  | `MessageMedia.fetchState='failed'` after `MEDIA_FETCH_MAX_ATTEMPTS`                     | `MediaPlaceholder` shows "Couldn't load media"                                                 |
| 7   | image       | outbound  | happy    | `Message.status='sent'`, `MessageMedia.fetchState='ready'` pointing at our S3 source    | Outbound image renders with status tick                                                        |
| 8   | image       | outbound  | failure  | `Message.status='failed'`, `failureReason` populated                                    | Failure tick; image not retried                                                                |
| 9   | video       | inbound   | happy    | `Message.type='video'` + `MessageMedia.fetchState='ready'`                              | `VideoBubble` renders thumbnail with play overlay; opens video lightbox                        |
| 10  | video       | inbound   | failure  | `MessageMedia.fetchState='failed'`                                                      | Placeholder: "Couldn't load media"                                                             |
| 11  | video       | outbound  | happy    | `Message.status='sent'`                                                                 | Video renders; click → lightbox                                                                |
| 12  | video       | outbound  | failure  | `Message.status='failed'`                                                               | Failure tick                                                                                   |
| 13  | audio       | inbound   | happy    | `Message.type='audio'` + `MessageMedia.fetchState='ready'`, `durationSec` set           | `AudioBubble` renders custom play/pause + progress; duration label visible                     |
| 14  | audio       | inbound   | failure  | `MessageMedia.fetchState='failed'`                                                      | Audio placeholder                                                                              |
| 15  | audio       | outbound  | happy    | `Message.status='sent'`                                                                 | Audio bubble with status tick                                                                  |
| 16  | audio       | outbound  | failure  | `Message.status='failed'`                                                               | Failure tick                                                                                   |
| 17  | document    | inbound   | happy    | `Message.type='document'` + `MessageMedia.fetchState='ready'`, `filename` set           | `DocumentBubble` renders icon + filename + size; download link works (302 → S3)                |
| 18  | document    | inbound   | failure  | `MessageMedia.fetchState='failed'`                                                      | Document placeholder                                                                           |
| 19  | document    | outbound  | happy    | `Message.status='sent'`                                                                 | Document bubble with status tick                                                               |
| 20  | document    | outbound  | failure  | `Message.status='failed'`                                                               | Failure tick                                                                                   |
| 21  | location    | inbound   | happy    | `Message.structuredPayload.{latitude,longitude,name,address}` populated                 | `LocationBubble` shows coords/name/address + "Open in Google Maps" link                        |
| 22  | location    | inbound   | failure  | (parser must accept partial payload — coords-only)                                      | LocationBubble renders coords; no name/address shown                                           |
| 23  | location    | outbound  | happy    | `Message.status='sent'`, structuredPayload echoed back                                  | Bubble renders                                                                                 |
| 24  | location    | outbound  | failure  | `Message.status='failed'`                                                               | Failure tick                                                                                   |
| 25  | sticker     | inbound   | happy    | `Message.type='sticker'` + `MessageMedia.fetchState='ready'`                            | `StickerBubble` renders 128×128 image with no chrome (chromeless shell)                        |
| 26  | sticker     | inbound   | failure  | `MessageMedia.fetchState='failed'`                                                      | Sticker placeholder                                                                            |
| 27  | sticker     | outbound  | happy    | `Message.status='sent'`                                                                 | Sticker renders                                                                                |
| 28  | sticker     | outbound  | failure  | `Message.status='failed'`                                                               | Failure tick                                                                                   |
| 29  | contact     | inbound   | happy    | `Message.structuredPayload.contacts[]` populated                                        | `ContactBubble` renders card with name/phone/org + Call & WhatsApp links                       |
| 30  | contact     | inbound   | failure  | (malformed contacts array → fall back to plain content)                                 | Bubble renders raw content with italic placeholder                                             |
| 31  | contact     | outbound  | happy    | `Message.status='sent'`                                                                 | Contact card renders                                                                           |
| 32  | contact     | outbound  | failure  | `Message.status='failed'`                                                               | Failure tick                                                                                   |
| 33  | interactive | inbound   | happy    | `Message.type='interactive'`, `content` = button/list label, `structuredPayload.kind`   | `InteractiveBubble` renders "Selected: <label>" or "Chose: <label>"; AI receives this as text  |
| 34  | interactive | inbound   | failure  | (malformed interactive payload → drop with parser warning)                              | Event not delivered to UI                                                                      |
| 35  | interactive | outbound  | happy    | `Message.status='sent'`                                                                 | Interactive prompt rendered                                                                    |
| 36  | interactive | outbound  | failure  | `Message.status='failed'`                                                               | Failure tick                                                                                   |

## 2. Cross-cutting scenarios

| #   | Scenario                          | Setup                                                                      | Expected                                                                                            |
| --- | --------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| C1  | Reaction add (parent in DB)       | Send text → wait → send reaction event                                     | `ReactionChips` chip animates in within one poll (≤10s); `MessageReaction` row exists, `active=true` |
| C2  | Reaction change                   | Add 👍 → send change-to ❤️ event                                            | Old chip removed, new chip animates in; `MessageReactionHistory` has both rows                       |
| C3  | Reaction remove                   | Add reaction → send remove event                                            | Chip disappears; `MessageReaction.active=false`                                                       |
| C4  | Reaction orphan                   | Send reaction event before parent message arrives                           | Reaction buffered in Redis (`wa:orphan:<id>`); chip appears within 5 min when parent arrives         |
| C5  | Status: sent → delivered → read   | Send outbound text; wait for status webhooks                                | `MessageStatusEvent` rows in order; tick progresses single → double → blue; `Message.status` = `read` |
| C6  | Status: failed                    | Send to invalid number                                                      | `Message.status='failed'`, `failureReason` populated; red icon with tooltip                          |
| C7  | Status orphan                     | Status event arrives before our outbound row exists                         | Buffered; replayed when parent arrives within 5 min TTL                                              |
| C8  | Quoted reply (parent in DB)       | Customer quotes a vendor message                                            | `QuotedReplyPreview` shows 80-char snippet; click scrolls to parent (highlighted briefly)            |
| C9  | Quoted reply (parent missing)     | Quote a message older than the loaded window or never seen                  | Preview shows "Original message unavailable" (i18n); click is a no-op                                |
| C10 | Outbound pending state            | Force WhatsApp Send to take >2s                                             | Bubble renders without status tick + faint "Sending…" hint until success                              |
| C11 | Media presigned URL refresh       | Open conversation; wait 16+ min; reload page                                | `/api/messages/:id/media` issues a fresh 302 each call; image renders (no stale URL caching)         |
| C12 | Media auth                        | Vendor A requests Vendor B's media URL                                      | 403 Forbidden                                                                                        |
| C13 | Per-vendor flag OFF               | Vendor without `whatsapp_conversation_parity` flag                          | Legacy text-only pipeline runs; non-text events skipped with `message_skipped` log                   |
| C14 | Per-vendor flag ON, mid-rollout   | Two vendors, only one with flag                                              | Webhook router splits: parity vendor gets full pipeline, legacy vendor unchanged                     |
| C15 | i18n: ta locale                   | Set `localStorage.chatlogix.lang = 'ta'`; reload                             | All edge-state strings render in Tamil                                                               |
| C16 | i18n: hi locale                   | Set `localStorage.chatlogix.lang = 'hi'`; reload                             | All edge-state strings render in Hindi                                                               |
| C17 | Polling cadence under load        | Conversation with 200 messages including media + reactions; 10s interval    | Poll completes in <2s; UI does not block; CPU stays reasonable                                       |
| C18 | Pagination cap                    | Conversation with 600+ messages; load without `?limit`                      | Returns 500 messages + `hasMore=true`; load older button works                                       |
| C19 | AI routing constraint             | Inbound image, audio, video, document, sticker, location, contact, reaction | None reach `INCOMING_QUEUE_URL`; only text + interactive do                                          |
| C20 | Credit pricing                    | Inbound message of each type                                                | `CreditUsage` row created with correct `creditsConsumed` (text=1, audio=3, image=2, video=10, etc.)  |

## 3. Sign-off

For each cohort:

- [ ] All Section 1 rows green for `en`, `ta`, `hi` locales
- [ ] All Section 2 cross-cutting rows green
- [ ] No `metric:webhook.parse_failure` spikes during the test window
- [ ] No `metric:media.fetch.terminal_failure` spikes outside expected failure-injection rows
- [ ] CloudWatch dashboard shows green for all 5 SLI alarms

Owners: Engineering writes, Product + Support review and add gaps before each cohort opens.
