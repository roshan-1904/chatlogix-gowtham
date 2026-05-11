# Smart Catalog Import - Business Logic & Implementation Plan

**Date:** April 2026  
**Status:** Phase 5 complete — pre-pilot. (v1.4 — see §17 Progress Tracker)  
**Owner:** Product + Frontend + Backend + AI Platform  
**Scope:** `frontend_v2/apps/web-vendor` + `backend/src/routes` + import services (mobile-native and external-source ingestion in Phase 6)  
**Primary Goal:** Vendor is **live on WhatsApp in minutes, not hours**. Targets:
- First product live: **< 2 minutes** (single-photo / template path).
- Full brochure-derived catalog live via auto-accept: **< 5 minutes**.
- Full manually-reviewed catalog: **< 15 minutes** (was 30).

---

## 1) Problem Statement

Vendors currently create products manually one-by-one in `Product Catalog`. This slows onboarding and delays first successful WhatsApp order conversion.

Extraction alone is not enough — if a vendor has 200 products, a 30-second extraction followed by 20 minutes of per-row review is still a 20-minute setup. **The review step is the actual bottleneck.** The design below therefore treats streaming, auto-accept, and staged go-live as first-class features, not polish.

The desired onboarding flow is:
- upload brochure images/PDF and optional CSV (or a single product photo / category template for fastest path),
- auto-extract product data with AI/OCR, **streaming results as pages complete**,
- normalize to product database schema,
- enrich descriptions and keywords,
- **auto-accept high-confidence rows** and flag only the rows that need attention,
- **commit high-confidence products immediately so the vendor is live**, while holding low-confidence rows in a "needs review" drawer,
- apply vendor AI configuration pre-filled from registration data + a brief business-profile micro-interview,
- land the vendor on a post-import **go-live checklist** with a test-message control and shareable WhatsApp link.

---

## 2) Target Outcome

### Business Outcomes
- **Time-to-first-live-product ≤ 2 minutes** (single-photo or category-template path).
- **Time-to-live-catalog ≤ 5 minutes** for typical brochure imports via auto-accept + commit-in-waves (was 30 min).
- Full manually-reviewed catalog ≤ 15 min.
- Increase first-day catalog completeness and orderability.
- Improve AI response grounding quality with richer product metadata.

### Product Outcomes
- Introduce a new vendor-facing page: **Smart Catalog Import**.
- Guided flow: `Upload → Stream-extract → Auto-accept → Commit-in-waves → Go-live`.
- Multiple entry points: brochure/PDF, CSV, **single-product photo**, **category template** (Phase 1); URL / Google Sheet / WhatsApp forward (Phase 6).
- Pre-fill AI config from `Vendor` registration data + a short micro-interview for business-policy fields.
- End the flow on a **go-live readiness panel**, not a catalog list.

### Technical Outcomes
- Introduce import analysis/commit APIs with streaming extraction results.
- Standardize normalized payload to existing product create schema semantics.
- Persist both product catalog data and vendor AI settings updates safely.
- Persist **in-progress review state** so a reload at minute 8 does not erase edits.

---

## 3) Current System Snapshot (Important Constraints)

- Frontend catalog routes exist in `frontend_v2/apps/web-vendor/src/App.tsx`:
  - `/catalog`
  - `/catalog/new`
  - `/catalog/:id/edit`
- Product data shape is enforced by backend `ProductCreateSchema` in `backend/src/routes/products.ts`.
- AI settings UI lives in `frontend_v2/apps/web-vendor/src/components/settings/tabs/AIConfigTab.tsx`.
- Vendor AI config read/write endpoints exist in `backend/src/routes/vendors.ts`.
- **Broken AI-config persistence** — `PUT /api/vendors/:id/ai-prompts` currently ignores the following fields even if the frontend sends them:
  - `aiProducts`
  - `aiContentResponsibilities`
  - `aiContentConversationRules`
  - `aiContentImportantInstructions`
  This bug must be fixed in Phase 1 because §5.5 commits values into those same fields.
- No existing brochure/CSV AI import endpoint exists for catalog onboarding.
- **No multipart/file-upload infrastructure in the backend today.** `backend/package.json` has no `multer`/`formidable`/`busboy`. All current routes are JSON-only. S3 code exists only in `backend/src/lambdas/`, not in the request path.
- **Upload strategy (locked — v1.3):** direct-to-S3 presigned URLs. Analyze endpoint receives S3 keys, not file bodies — see §6.6.
- **Accepted file types (locked — v1.3, Phase 1):** CSV, Excel (`.xlsx`), and images (`jpg/png/webp`). **PDF is out of Phase 1 scope** (deferred to Phase 6) — each image is one extraction call, no page decomposition.
- **No job-state persistence model exists** for long-running imports. Current async workflows use SQS + Prisma audit tables (`StageExecutionLog`, `OrderAuditLog`) — the import job model should follow that pattern.
- Primary AI pipeline (`unifiedAIProcessorService.ts`) uses `gpt-4o-mini`. This is **not** suitable for brochure image/PDF vision extraction — see §6.4.
- All AI spend in the codebase is metered via `CreditUsage` / `billingService`. The import flow must follow the same pattern (see §5.7).

---

## 4) Proposed Feature: Smart Catalog Import

### 4.1 User Journey (Vendor) — speed-first flow
The journey branches by entry point. All paths converge at commit.

**Entry A — Brochure / CSV (primary flow, Phase 1)**
1. Vendor opens `Catalog` → clicks `Smart Catalog Import`.
2. Uploads brochure files (images/PDF) and/or CSV.
3. Clicks `Analyze with AI`. Extraction begins and **streams results** page-by-page (§6.9) — the first products appear in seconds; vendor can start editing while later pages are still being extracted.
4. Rows with confidence ≥ auto-accept threshold (§5.9) are **pre-accepted** and collapsed into an "Already good (N)" group. Vendor only sees the flagged rows.
5. Vendor resolves warnings with AI-assisted controls (inline suggestions, bulk-fix, re-scan-page) — see §5.14.
6. Vendor clicks `Go Live`:
   - **Wave 1 (immediate):** auto-accepted products commit instantly → vendor is live.
   - **Wave 2 (optional, later):** remaining rows stay in a "Needs review" drawer accessible from `/catalog`.
7. AI config is pre-filled from registration data (§5.13) plus a **5-question micro-interview** (§5.12) — vendor confirms or edits in ~60s.
8. Vendor lands on **Go-Live Readiness panel** (§5.15): test-message control, wa.me / QR share, and a checklist of remaining pre-launch items (payment, delivery area, etc.).

**Entry B — Single product photo (Phase 1 fast path)**
1. Vendor snaps or uploads one product photo.
2. Extraction returns a single draft product in ~3–5 seconds.
3. Vendor confirms (or edits 1–2 fields) → commits.
4. **Vendor is live in under 2 minutes with a 1-product catalog.** They can return to add more later.

**Entry C — Category template (Phase 1 fast path)**
1. Vendor selects their category (already captured at signup in `Vendor.category`).
2. System pre-fills 15–25 common products for that category (editable).
3. Vendor tweaks prices and commits.
4. Live in ~3 minutes without any file upload.

**Entry D — URL / Google Sheet / WhatsApp forward (Phase 6)**
- Paste a public sheet link or product URL — deferred to Phase 6.

### 4.2 Route & Navigation
- New route: `/catalog/import` — primary flow (Entry A).
- Sub-routes for fast paths:
  - `/catalog/import/photo` — single-photo (Entry B).
  - `/catalog/import/template` — category template (Entry C).
- Header actions on `Products` page:
  - primary: `Add Product`
  - secondary: `Smart Catalog Import` (opens an entry-picker modal listing A/B/C).
- First-run vendors with an empty catalog see the entry-picker directly on `/catalog` as the empty state (no extra click).

### 4.3 Non-Goals (Phase 1)
- No live background sync from external ERPs/PIM.
- No URL / Google Sheet / WhatsApp forward ingestion (deferred to Phase 6).
- No mobile-native capture (deferred to Phase 6 — responsive web only in Phase 1).
- Auto-accepted products are NOT "auto-published without review" — the vendor clicks `Go Live`; they simply don't have to edit every row.

---

## 5) Core Business Logic

### 5.1 Inputs
- `brochureImages[]`: images (`jpg/png/webp`). **PDF is out of Phase 1 scope (deferred to Phase 6).**
- `tabularFile?`: CSV or Excel (`.xlsx`), optional. One logical file per import.
- `importOptions`:
  - preferred currency (default INR),
  - language hint (optional),
  - allow update existing products (boolean),
  - auto-generate AI config sections (boolean).

### 5.2 Extraction Pipeline
1. **Ingest** files into temporary storage.
2. **OCR/Text extraction** from images/PDF.
3. **CSV / Excel parsing** with column mapping. `.xlsx` handled via `exceljs`; the first sheet is treated as authoritative unless the file exposes a named range.
4. **Field fusion**:
   - if CSV and brochure disagree, prefer explicit numeric CSV price unless confidence low.
   - merge textual brochure detail into descriptions.
5. **LLM structuring** to target normalized product object shape.
6. **Validation pass** against canonical constraints.
7. **Deduplication pass** by normalized name + optional SKU.
8. **Confidence scoring** per row and per field.

### 5.3 Normalization Rules
- `name`: required; trim, collapse spaces, title casing preserved from source.
- `baseUnit`: map synonyms (`pcs`, `piece`, `nos` -> `piece`; `kgs` -> `kg`; etc.).
- `baseQuantity`: default `1` if missing; must be positive.
- `basePrice`: convert to integer paise at commit boundary.
- `description`: AI-enhanced but keep source facts; no fabricated claims.
- `category`: inferred from source text + optional CSV category.
- `keywords/tags`: generate from name + description + domain vocabulary.
- `imageUrl`: optional in Phase 1 unless image hosting pipeline is implemented.
- `sku`: top-level optional string; trimmed and uppercased. See §5.4 for uniqueness rule and §7.1 for schema.

### 5.4 Safety & Integrity Rules
- Never commit rows missing `name`, `baseUnit`, `baseQuantity`. `basePrice` is required to commit as **active** — rows with missing or low-confidence price commit with `isActive: false` per §5.9.
- Block import if >20% rows are critical-invalid (missing required fields other than `basePrice`).
- Enforce duplicate policy:
  - exact existing name conflict -> update if `allow update` true; else mark conflict.
  - DB constraint backing this is `@@unique([vendorId, name])` on `Product`.
  - **New:** `@@unique([vendorId, sku])` on `Product` — sparse, applies only when `sku` is non-null.
- **In-batch dedup pass** — before hitting the DB, run a normalized-name + sku dedup over the approved payload itself. Brochures frequently produce two rows that collapse to the same canonical name (e.g. `12" Fan` and `12-inch Fan`). Without this pass the second row in a batched transaction will trip the unique index mid-commit and abort otherwise-valid rows.
- **SKU (locked — v1.3):** a new top-level `Product.sku` column is added in Phase 0.5 (nullable string). `variants[].sku` remains for per-variant SKUs. Dedup key uses `normalize(name)` + top-level `sku` (when present).
- **Idempotency key (locked — v1.3):** required on commit. Format `{vendorId}:{jobId}`. Stored on `CatalogImportJob.idempotencyKey` (unique); re-submission returns the original result without re-executing side effects.

### 5.5 AI Configuration Generation Rules
- Generate/refresh:
  - `aiContentResponsibilities`
  - `aiContentConversationRules`
  - `aiContentImportantInstructions`
  - optional `aiToneExample`, `aiGreeting`, `aiClosing`
- Product knowledge source priority:
  1) `Product` table (canonical)
  2) vendor `aiProducts` fallback only if catalog empty
- Do not overwrite manually customized fields unless user confirms.

### 5.6 Commit-in-Waves Behavior
Commit is UX-simple ("Go Live") but supports two waves:

**Wave 1 — Auto-accept commit (immediate, default on)**
- Fires on `Go Live`. Commits all rows that passed auto-accept (§5.9).
- Backend is transactional multi-step:
  1. Validate normalized payload snapshot hash.
  2. Upsert auto-accepted products in transaction batches.
  3. Update selected AI configuration fields.
  4. Persist import audit record (`jobId`, source files, summary, errors).
  5. Return deterministic result set:
     - `createdCount`, `updatedCount`, `skippedCount`, `failed[]`, `deferredCount` (= Wave 2 rows).

**Wave 2 — Deferred review drawer (optional)**
- Low-confidence rows NOT committed in Wave 1 are persisted back into `CatalogImportJob.result.deferred[]` with status `needs_review`.
- Exposed in `/catalog` as a dismissable banner: *"N products are waiting for your review"*.
- Vendor can finish them later; they don't block go-live.
- Same idempotency key and dedup rules apply when Wave 2 is eventually committed.

**Rationale:** the old one-shot model forced vendors to finish reviewing everything before being live. Wave 1 gets a typical vendor live in 5 minutes; Wave 2 lets them finish the long tail asynchronously, or abandon it.

### 5.7 Billing & Credit Metering
- Every analyze call debits the vendor wallet via `billingService` / `CreditUsage`, identical to the path used by the multi-stage AI workers. This is a **hard requirement** — unmetered AI spend is a production-risk anti-pattern in this repo.
- Debit model (proposal):
  - per-image vision extraction → metered by `tokenUsage` reported by OpenAI.
  - normalization/enrichment LLM call → metered by `tokenUsage`.
  - CSV / Excel-only path → near-zero cost, metered but nominal.
- Surface an **estimated cost** in the UI after file-intake but before `Analyze` is clicked, so vendors can cancel before incurring charges.
- **Per-vendor daily analyze-spend cap (locked — v1.3):** default **₹50/vendor/day** (stored as **5000 paise** — all amounts are integers in paise per repo convention). Config-driven (via `VendorSettings` or env override), never hard-coded. When breached, `/analyze` returns `429 QUOTA_EXCEEDED` with `Retry-After` pointing to 00:00 IST reset.

### 5.8 Rate Limiting
- **`/analyze` (locked — v1.3):** per-vendor, **5 imports/day** and **1 import/hour**. Reuse the existing `settingsRateLimit` middleware pattern (or a stricter variant). A vendor re-uploading a 20 MB brochure five times in a panic is both a DoS risk and a billing risk.
- **Fast-path endpoints (`/fast/photo`, `/fast/template`):** looser bucket, **20/hour** per vendor — they're cheap and exploratory.
- Commit endpoint uses standard vendor rate-limit + idempotency key (§5.4).
- Breaches return `429` with a `Retry-After` header.

### 5.9 Auto-Accept Policy
The single biggest speed lever. Rows that clear all of the following are silently accepted and hidden under an "Already good (N)" group — vendor does not touch them.

**Row is auto-acceptable if ALL of:**
- All required fields present and valid (`name`, `baseUnit`, `baseQuantity`). `basePrice` is handled by the Price-missing rule below — its absence does NOT disqualify auto-accept, it only flips `isActive` to `false`.
- Row-level confidence ≥ **0.88** (configurable per vendor; default 0.88).
- No field-level confidence below **0.75** (other than `basePrice`, which has its own rule).
- No duplicate conflict flagged against an existing DB row (§5.4).
- Unit is in the normalized-synonym map (§5.3) — unknown units always require review.
- Price (when present) is within an order-of-magnitude sanity check (e.g. flag a `₹5` blender or a `₹5,00,000` biscuit).

**Price-missing rule (locked — v1.3):**
- If `basePrice` is missing OR its field-level confidence is < 0.75, the row still commits (assuming other required fields are present) but with **`isActive: false`**. The commit service enforces this regardless of what the caller sends.
- These products surface in a distinct **"Needs pricing"** group on `/catalog` with a direct "Set price & activate" action.
- Rationale: vendor goes live on everything we're confident about; rows where customers could be shown a wrong price are quarantined until the vendor sets it manually.
- These rows are **not counted against the auto-accept-rate telemetry** (§12.2) — they represent a distinct "extractor couldn't find price" outcome, not a low-confidence extraction.

**Vendor controls:**
- A single toggle `Auto-accept high-confidence rows` (default ON) at the top of the review page.
- A "Show auto-accepted" expander to inspect or edit them before commit.
- Per-vendor threshold override in `matchingConfig` (advanced, hidden by default).

**Guardrails:**
- If auto-accept would accept < 30% or > 95% of rows on a batch, the UI shows a soft warning ("This looks unusual — want to review all rows?") to prevent over- or under-confidence from burning vendor trust.

### 5.10 Streaming Extraction
- Extraction (§6.4) is page-parallel; each page completes independently.
- Results stream to the client via Server-Sent Events (§6.9) as each page finishes.
- Client appends products to the review grid as they arrive; vendor can begin editing before all pages complete.
- Progress panel shows per-page state (`queued | extracting | done | failed`) so latency is transparent.

### 5.11 AI-Assisted Review Controls
Review UX is not a manual spreadsheet. Vendor gets:
- **Inline suggestions** for each warning (e.g. "Unit `pcs` — accept as `piece`? [Accept]").
- **Bulk-fix** — single click to apply one fix across all flagged rows ("Set unit to `piece` on all 23 rows").
- **Re-scan page** — ask the extractor to re-process a specific page when the vendor thinks the LLM missed a field.
- **Ask-AI-to-fill** — for empty optional fields (keywords, category, description), one-click enrichment on selected rows.

### 5.12 Business Profile Micro-Interview
AI-config generation from catalog alone produces vague output. Augment with a ~60-second interview presented inline after extraction:

1. Do you deliver, offer pickup, or both?
2. Accept cash on delivery? (y/n)
3. Typical preparation time in minutes? (prefill from category default)
4. Business hours (prefill from signup data if available).
5. Return / cancellation policy in one sentence (optional).

Answers feed directly into `aiDeliveryInstructions`, `aiPickupDeliveryAddress`, `aiPreparationTimeMinutes`, `aiContentConversationRules`, `aiContentImportantInstructions`. Skipping the interview is allowed but falls back to category defaults.

### 5.13 Pre-Fill AI Config from Registration Data
The `Vendor` model already holds `businessName`, `category`, `phone`, `timezone`, `orderPrefix`. These must pre-fill before the vendor types anything:
- `aiBotName` ← `businessName` + " Assistant" (editable).
- `aiGreeting` ← template string keyed by `category` + `businessName`.
- `aiClosing` ← default polite close localized to vendor language.
- Category-specific defaults for `aiPersonality`, `aiContentResponsibilities`.

Vendor never types what the system already knows.

### 5.14 Category-Specific Extraction & Defaults
`Vendor.category` is already captured. Use it to tune extraction and normalization:
- **Prompt variants** per category (restaurant/menu, grocery/packaged, electronics/appliance, garment/size, etc.).
- **`baseUnit` defaults:** restaurant → `piece|plate|glass`; grocery → `kg|g|l|ml`; garment → `piece` with size variants; electronics → `piece|set`.
- **Category template catalogs** (Entry C, §4.1) — maintained as versioned JSON files, one per supported category.

### 5.15 Go-Live Readiness Panel
The flow ends on a checklist, not the product list. Shown items:
- ✅ Catalog imported (N products live, M deferred).
- ✅ / ⏳ AI configuration applied.
- ⏳ **Test message** — a "Simulate a customer message" box that hits the real multi-stage pipeline in sandbox mode (`Message.isSandbox = true`, not billed, not sent over WhatsApp). Vendor types "do you have X?" and sees the bot's reply.
- ⏳ WhatsApp number connected (link to existing setup flow).
- ⏳ Payment configured (link).
- ⏳ Delivery area set (link).
- ✅ Shareable `wa.me/<number>` link + downloadable QR code (shown as soon as the WhatsApp number is connected).

### 5.16 Review-State Persistence
- In-progress vendor edits in the review grid persist to `CatalogImportJob.result.draftEdits` on every change (debounced 1s).
- Reloading the page returns the vendor exactly where they left off.
- Job retention: 30 days after last update, then soft-deleted.

### 5.17 Commit-Failure Recovery
- `failed[]` rows in the commit response are kept in `CatalogImportJob.result.deferred[]` with `error` annotated per row.
- UI surfaces them as an editable drawer with `Retry failed rows` — only the failed rows are re-submitted, not the whole batch.
- Re-submission reuses the original idempotency key scope but is keyed per-row to avoid double-commit of successful rows.

### 5.18 Re-Import Merge
A vendor re-uploading the same (or updated) brochure months later must not lose prior manual edits:
- Match incoming rows against existing `Product` rows by normalized name + (optional) SKU.
- If a match exists and the existing `Product` was manually edited after its original import (tracked via `Product.updatedAt` > `CatalogImportJob.createdAt`), the re-import treats that row as **protected**: fields are not overwritten unless the vendor explicitly opts in per-field.
- `CorrectionHistory` entries for the vendor feed normalization hints on re-imports (e.g. vendor consistently renames `pcs` to `pieces` → normalization honors it automatically).

---

## 6) Architecture & API Plan

### 6.1 New Backend Endpoints

#### `POST /api/catalog-import/upload-url` *(new in v1.3)*
- Auth: vendor/admin.
- Input: `{ contentType, sizeBytes, filename, jobId? }`
- Output: `{ s3Key, presignedUrl, expiresAt }` — browser `PUT`s the file directly to the URL (§6.6).
- Validates `contentType` against the allow-list (images + `text/csv` + `.xlsx` MIME types) and `sizeBytes` against the caps in §6.6.
- Returns `413 PAYLOAD_TOO_LARGE` or `415 UNSUPPORTED_MEDIA_TYPE` as appropriate.

#### `POST /api/catalog-import/analyze`
- Auth: vendor/admin.
- Content type: **application/json** (v1.3 change — no multipart). Payload references S3 keys of files already uploaded via `/upload-url`.
- Input:
  - `brochureImageKeys[]` — S3 keys of uploaded images
  - `tabularFileKey?` — S3 key of CSV or `.xlsx`
  - `importOptions`
- Output:
  - `jobId`
  - `normalizedProducts[]`
  - `warnings[]`
  - `confidenceSummary`
  - `suggestedAIConfig`
- Behavior: returns `202 Accepted` with `jobId` + `status: "processing"` for jobs expected to exceed ~15s; returns `200 OK` with inline results for sub-15s paths (tabular-only, small single-image). Frontend polls `GET /api/catalog-import/:jobId` in either case (see §6.3).

#### `GET /api/catalog-import/:jobId`
- Returns async status + latest analysis result.
- Used for long OCR/LLM processing jobs.
- Status values: `queued | processing | ready | failed`. Persisted in `CatalogImportJob` (see §6.3).

#### `POST /api/catalog-import/commit`
- Input:
  - `jobId`
  - `approvedProducts[]` (after user edits)
  - `applyAIConfig` + selected AI sections
  - `idempotencyKey`
  - `dryRun?: boolean` (see §6.5)
  - `wave: 1 | 2` (§5.6) — default 1
- Output:
  - import summary + per-row results (`createdCount`, `updatedCount`, `skippedCount`, `failed[]`, `deferredCount`).

#### `GET /api/catalog-import/:jobId/stream` (SSE)
- Server-Sent Events stream of extraction progress and per-page results (§5.10, §6.9).
- Events: `page.started`, `page.completed` (with `products[]`), `page.failed`, `job.complete`, `job.failed`.
- Closes automatically on `job.complete` or `job.failed`.

#### `POST /api/catalog-import/fast/photo`
- Fast path for Entry B (§4.1).
- Input: one image file + `importOptions`.
- Output: single normalized product draft (no `jobId` — synchronous).

#### `POST /api/catalog-import/fast/template`
- Fast path for Entry C (§4.1).
- Input: `{ category, overrides? }`.
- Output: pre-filled normalized products drawn from the per-category template (§5.14).

#### `POST /api/catalog-import/test-message`
- Powers the Go-Live test-message control (§5.15).
- Input: `{ text }` (or voice note — Phase 6).
- Runs the real multi-stage AI pipeline against the vendor's new catalog with `sandbox: true` — does not emit a WhatsApp message, does not debit `CreditUsage`, does not persist a customer-facing `Message`.
- Output: AI response text + per-stage timing + matched products (for debugging).

### 6.2 Service Layer (Backend)
- `catalogImportService.ts` (orchestrator)
- `catalogExtractionService.ts` (OCR + parsing + LLM structuring)
- `catalogNormalizationService.ts`
- `catalogCommitService.ts`
- `catalogImportAuditService.ts`
- `fileIntakeService.ts` — handles multipart ingest, size/type validation, virus/MIME sniffing, temp storage handoff.

### 6.3 Job Persistence Model (new — must be decided in Phase 0)
New Prisma model (recommended — matches existing audit-log patterns used by `StageExecutionLog` and `OrderAuditLog`):

```prisma
model CatalogImportJob {
  id              String   @id @default(uuid())
  vendorId        String
  status          String   // queued | processing | ready | failed
  inputManifest   Json     // file names, sizes, content hashes, importOptions
  result          Json?    // normalizedProducts, warnings, confidenceSummary, suggestedAIConfig
  error           String?
  tokenUsage      Json?    // for billing reconciliation
  idempotencyKey  String?  @unique
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  vendor          Vendor   @relation(fields: [vendorId], references: [id], onDelete: Cascade)

  @@index([vendorId, status])
  @@index([createdAt])
  @@map("CatalogImportJob")
}
```

Rationale: Redis-only would lose state on PM2 restart mid-job (45s P95 window — a realistic reload window for vendors). SQS + DB mirrors the existing `multiStageAIWorker` pattern and is the recommended path if analyze time routinely exceeds 30s.

**MVP decision (locked — v1.3):** analyze runs **inline in the API process**; `CatalogImportJob` persists state so a PM2 restart can recover/resume. If Phase 2 measurements show P95 > 30s, move analyze to a new SQS worker — the job model already supports that transition without schema change.

### 6.4 Model Selection & Extraction Strategy
- **Do not use `gpt-4o-mini` for image vision.** It is the default elsewhere in this repo but its vision quality on dense product imagery is inadequate. Use `gpt-4.1` for the extraction pass.
- **Provider pluggability (locked — v1.3):** vision model is configured behind a single `VISION_EXTRACTION_MODEL` env var (default `gpt-4.1`) so we can swap to a better model without code changes. The two-tier architecture does not assume a specific vendor.
- Two-tier pipeline:
  1. **Extraction (vision)** — `gpt-4.1`, one call **per image** (parallelized).
  2. **Normalization/enrichment (text)** — `gpt-4o-mini` is fine; reuse the existing structured-JSON output pattern from `unifiedAIProcessorService.ts`.
- **Image-level parallelism is required** to hit the analyze latency target (§12.2). Serial 20-image vision at 4–8s/image = 80–160s, which exceeds the 45s P95. Fan out with bounded concurrency (e.g. 5–8 in flight), then reduce.
- **Reuse TOON table encoding** (already used for catalog grounding) when emitting structured product drafts back to the LLM during enrichment — ~40% token savings.
- **No PDF decomposition in Phase 1 (locked — v1.3)** — Phase 1 accepts images directly; vendors with PDFs export pages to images client-side or use CSV/Excel. Adding PDF in Phase 6 only requires a page-to-image step upstream of this pipeline.

### 6.5 Dry-Run Commit
- Resolving open decision in §14: **yes, implement dry-run.**
- `POST /api/catalog-import/commit?dryRun=true` (or `{ dryRun: true }` in body) runs the full commit transaction inside a savepoint and rolls back at the end, returning the same result shape as a real commit.
- Unlocks: "Preview what will happen" UX, risk-free golden-dataset tests, conflict-policy verification.

### 6.6 File Upload Strategy (locked — v1.3: presigned S3)
**Direct-to-S3 presigned URLs.** The analyze endpoint receives only S3 keys, not file bodies. Keeps PM2 workers lean and sidesteps a whole class of upload-timeout bugs.

**Flow:**
1. Frontend calls `POST /api/catalog-import/upload-url` with `{ contentType, sizeBytes, filename }` → returns a presigned `PUT` URL + S3 key, scoped to a vendor-specific prefix (`imports/{vendorId}/{jobId}/...`).
2. Browser `PUT`s the file directly to S3.
3. Frontend calls `POST /api/catalog-import/analyze` with the returned S3 keys.

**File caps (locked — v1.3):**
- Image: **≤ 8 MB each**, max **20 images** per import.
- CSV / `.xlsx`: **≤ 5 MB**, max **1** tabular file per import.
- Content types allowed: `image/jpeg`, `image/png`, `image/webp`, `text/csv`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- S3 objects expire after **7 days** via lifecycle policy (the job record retains the normalized payload; raw uploads are disposable).
- Server-side MIME sniffing on the analyze endpoint — trust that the S3 key exists, but re-validate content type before sending to the vision model.

### 6.7 Feature Flag
- Per-vendor flag, stored on `Vendor` (new nullable `Boolean` column `catalogImportEnabled`). Matches the existing pattern used for other vendor-scoped rollouts.
- Flag is checked at route entry; when disabled the frontend hides the `Smart Catalog Import` entry point.

### 6.8 Frontend (web-vendor)
- New pages:
  - `frontend_v2/apps/web-vendor/src/pages/CatalogImport.tsx` — primary flow (Entry A).
  - `frontend_v2/apps/web-vendor/src/pages/CatalogImportPhoto.tsx` — single-photo fast path (Entry B).
  - `frontend_v2/apps/web-vendor/src/pages/CatalogImportTemplate.tsx` — category template (Entry C).
  - `frontend_v2/apps/web-vendor/src/pages/CatalogImportGoLive.tsx` — post-commit Go-Live Readiness panel (§5.15).
- New reusable components:
  - entry-picker modal (`Brochure / Photo / Template`).
  - upload dropzone (uses presigned URLs per §6.6).
  - **streaming progress panel** — per-page status + live product-count (§5.10, §6.9).
  - editable preview grid with auto-accept grouping (§5.9).
  - AI-assisted review controls (§5.11): inline suggestion, bulk-fix, re-scan-page, ask-AI-to-fill.
  - warning panel + conflict resolver.
  - **business-profile micro-interview** (§5.12).
  - commit summary drawer (Wave 1 + Wave 2).
  - Go-Live Readiness panel with test-message console, wa.me / QR, checklist (§5.15).
  - estimated-cost preview before analyze (§5.7).
- Client uses EventSource to subscribe to `GET /api/catalog-import/:jobId/stream` (§6.9); falls back to polling `GET /api/catalog-import/:jobId` on SSE failure.
- Routes to add in `App.tsx`: `/catalog/import`, `/catalog/import/photo`, `/catalog/import/template`, `/catalog/import/:jobId/go-live`.
- Empty-state on `/catalog` for first-run vendors renders the entry-picker inline (no extra click).
- API client module: `src/lib/catalogImport.ts`.
- Reuse the existing paise/rupee converter from `ProductForm` — do not reinvent.

### 6.9 Streaming Results (SSE)
- The extraction job uses Server-Sent Events on `GET /api/catalog-import/:jobId/stream` (§6.1).
- Why SSE and not WebSocket: one-way server→client; simpler infra; plays well with Express + existing auth middleware; no new dependency.
- Client reconnects automatically if the stream drops; server resumes from last-seen `pageIndex` using a cursor on `CatalogImportJob.result.pageProgress`.
- Stream lifetime is bounded by analyze duration + a 30s grace window; after `job.complete` the stream closes and clients fall back to a single `GET /api/catalog-import/:jobId` for final state.

### 6.10 Category Templates (Storage)
- Pre-built per-category product lists (§5.14) are stored as versioned JSON files under `backend/src/data/catalog-templates/<category>.json` and loaded at startup.
- Each entry includes `name`, `baseUnit`, `baseQuantity`, `basePrice` (nullable — vendor must set), `keywords`, `tags`.
- Prices are intentionally nullable — every vendor must set prices, but everything else is pre-filled.

### 6.11 Sandbox Test-Message Path
- `POST /api/catalog-import/test-message` (§6.1) invokes `multiStageOrchestrator` with `sandbox: true` on the orchestrator's context object.

**Plumbing (locked — v1.3: sink-gated / "Option C"):**
- The sandbox flag is **not** threaded through every stage's signature. **All 14 stages run identically to production.** The flag is checked only at three **side-effect sinks**:
  1. `billingService.debitCreditUsage` — no-op when `sandbox === true`.
  2. `responseQueuingService.enqueue` — no-op when `sandbox === true`.
  3. Customer-facing `Message.create` — no-op when `sandbox === true` (optionally write to a future `SandboxMessageLog` for debugging — still open in §14).
- **Rationale:** maximum parity with the production pipeline (addresses §11 risk #13 *by construction* — the pipeline cannot diverge because it does not branch). Only three enforcement points need to be code-reviewed and tested, not 14.
- **Parity integration test (required to ship):** run a sandbox message and assert (a) every stage appears in `StageExecutionLog`, (b) zero new `CreditUsage` rows, (c) zero new customer-facing `Message` rows, (d) zero SQS enqueues. This test gates the feature.
- Return shape includes per-stage timing so vendors and support can diagnose slow responses before going live.

---

## 7) Data Contracts

### 7.1 Normalized Product Draft (frontend/backend shared intent)
- `name: string`
- `description?: string`
- `category?: string`
- `baseUnit: string`
- `baseQuantity: number` *(serialized to `Decimal(10,3)` at commit — round explicitly)*
- `basePrice: number` (rupees in UI draft, paise on backend persist)
- `isDivisible: boolean`
- `variants?: [{ label?, attributes?, sku?, unit, baseQuantity, price, isDivisible, isActive? }]`
  - **Must match the existing `VariantSchema`** in `backend/src/routes/products.ts` — do NOT drop `attributes`, `sku`, or `isActive`, which are legitimately extractable from brochures (model codes, sizes, colors).
- `keywords?: string[]` *(generated in all vendor-supported languages — Tamil / Hindi / English — to match multi-stage matching behavior)*
- `tags?: string[]`
- `stockQuantity?: number` *(Decimal(10,3) on persist)*
- `minOrderQuantity?: number` *(Decimal(10,3) on persist)*
- `maxOrderQuantity?: number` *(Decimal(10,3) on persist)*
- `isActive?: boolean` *(commit service forces `false` when Price-missing rule §5.9 fires, regardless of caller value)*
- `inStock?: boolean`
- `imageUrl?: string`
- `sku?: string` *(top-level — new column added in Phase 0.5; extractable from model codes like "IB-FAN-12"; separate from `variants[].sku`)*
- `sourceMeta` (confidence/source pointers — per-field, not just per-row)

### 7.2 Suggested AI Config Payload
- `aiBotName?`
- `aiPersonality?`
- `aiContentResponsibilities?`
- `aiContentConversationRules?`
- `aiContentImportantInstructions?`
- `aiDeliveryInstructions?`
- `aiPickupDeliveryAddress?`
- `aiToneExample?`
- `aiGreeting?`
- `aiClosing?`
- `aiPreparationTimeMinutes?`

**Persistence precondition:** the existing `PUT /api/vendors/:id/ai-prompts` handler in `backend/src/routes/vendors.ts` currently drops `aiProducts`, `aiContentResponsibilities`, `aiContentConversationRules`, and `aiContentImportantInstructions`. This handler MUST be fixed in Phase 1 before the commit endpoint can honor the §5.5 contract. The commit endpoint consumes this fixed path — do not route around the broken handler with a duplicate write path.

---

## 8) Implementation Plan (Phased)

## Phase 0 - Alignment & Technical Design (0.5-1 day)
- Finalize UX wireframe for `/catalog/import`.
- Lock API contracts and idempotency strategy.
- Confirm OCR/LLM provider and token budget (see §6.4).
- **Decide file-upload strategy** (§6.6) — presigned-S3 vs multer-to-disk.
- **Decide job persistence** (§6.3) — recommended: new `CatalogImportJob` Prisma model.
- Decide whether analyze runs inline in the API process or is handed off to a new SQS worker (threshold: if P95 analyze > 30s, move to worker).

**Exit Gate**
- API contract approved.
- UX flow approved.
- Error handling strategy approved.
- Upload + job-persistence decisions recorded as a short ADR under `documentation/`.

## Phase 0.5 - Prerequisite Fixes & Infrastructure (0.5-1 day)
These are small, independent, and must land before Phase 1 can meaningfully start:
- **Fix `PUT /api/vendors/:id/ai-prompts`** to persist `aiProducts`, `aiContentResponsibilities`, `aiContentConversationRules`, `aiContentImportantInstructions`, `aiPreparationTimeMinutes` (they are silently dropped today — see §3, §7.2).
- Add `multer` (or presigned-URL endpoint, per §6.6 decision).
- Add `CatalogImportJob` Prisma model + migration (per §6.3).
- Add per-vendor `catalogImportEnabled` boolean to `Vendor` (feature flag — §6.7).

**Exit Gate**
- AI-prompts handler persists all documented fields (verified with unit + integration test).
- File-upload path accepts a sample 10 MB PDF end-to-end (no extraction yet).
- Migration applied in staging.

## Phase 1 - Backend Foundations (1-2 days)
- Create new routes and request validation (`/analyze`, `/:jobId`, `/commit`).
- Implement `fileIntakeService.ts` + temporary storage + file-intake validation (size, MIME, count caps).
- Implement analysis job model reads/writes and status endpoint.
- Wire rate limiting (§5.8) and idempotency key handling on commit.
- Wire `CreditUsage` metering shell (§5.7) — even if analyze is stubbed, the debit path must exist.

**Exit Gate**
- Analyze endpoint accepts files and returns a stubbed normalized payload persisted against a real `CatalogImportJob` row.
- Auth, rate limiting, and size limits in place.
- Commit endpoint accepts a stubbed approved-products payload and upserts `Product` rows in a transaction (AI-config write can be stubbed at this stage).

## Phase 2 - Extraction + Normalization Engine (2-3 days)
- Implement OCR/vision extraction (per §6.4 — `gpt-4.1`/`gpt-4o`, page-parallel) + CSV parser + fusion logic.
- Emit per-page results into `CatalogImportJob.result.pageProgress` so the SSE stream (§6.9) can replay them.
- Add LLM structuring prompt with strict JSON output, with **category-specific prompt variants** (§5.14) keyed by `Vendor.category`.
- Add normalization and validation rules.
- Implement confidence and warning generation (per-field + per-row, §5.9).
- Reuse TOON encoding for enrichment round-trip (§6.4).
- Produce keywords in all vendor-supported languages (Tamil / Hindi / English).

**Exit Gate**
- Test corpus produces structured product drafts with ≤10% critical invalid rows.
- Deterministic warnings produced for bad rows.
- Auto-accept rate ≥ 70% on the golden dataset (§5.9).
- Page-parallel extraction verified: 20-page brochure completes under 45s P95 on staging; first page available in ≤ 6s.

## Phase 3 & Phase 4 - Run in Parallel (API contract is locked after Phase 0)
> **Sequencing:** Phase 0 locks the API contract. Phase 3 (frontend) and Phase 4 (commit + speed features) proceed in parallel.

### Phase 3 - Frontend Import UX (3-4 days — expanded scope)
- Entry-picker modal + three entry pages (brochure, photo, template — Entries A/B/C).
- Upload dropzone + presigned-URL integration.
- **Streaming progress panel** consuming SSE (§5.10, §6.9).
- Editable preview grid with **auto-accept grouping** (§5.9).
- **AI-assisted review controls** (§5.11): inline suggestion, bulk-fix, re-scan-page, ask-AI-to-fill.
- **Business-profile micro-interview** (§5.12) inline after extraction.
- Pre-filled AI config from registration data (§5.13).
- Commit flow with Wave 1 / Wave 2 affordances (§5.6).
- **Go-Live Readiness panel** (§5.15) with test-message console and wa.me / QR.
- Review-state autosave to `CatalogImportJob.result.draftEdits` (§5.16).
- Surface **estimated cost preview** (§5.7) and **dry-run commit preview** (§6.5).

**Exit Gate**
- Vendor can upload → see streaming results → edit flagged rows only → commit Wave 1 → land on Go-Live panel → send a sandbox test message, end-to-end.
- Reloading mid-review restores prior edits.
- No blocking UI defects on desktop and mobile web breakpoints (mobile-native app is Phase 6).

### Phase 4 - Commit, Waves & AI Config Integration (2-3 days — expanded scope)
- Implement Wave 1 commit transaction and audit logs.
- Implement Wave 2 deferred-review drawer: `CatalogImportJob.result.deferred[]` persistence and the `/catalog` banner.
- Implement commit-failure recovery (§5.17): per-row retry.
- Apply product upserts and selected AI config updates (consumes the **fixed** `ai-prompts` handler — see Phase 0.5 and §7.2).
- Implement fast-path endpoints: `POST /fast/photo`, `POST /fast/template` (§6.1).
- Implement `POST /test-message` sandbox endpoint (§6.11).
- Implement re-import merge with protected-edit rule (§5.18).
- Add idempotency handling and conflict policy.
- Implement dry-run variant (§6.5) via transaction savepoint + rollback.
- Wire in-batch dedup pass (§5.4).
- Ship per-category template JSONs under `backend/src/data/catalog-templates/` (§6.10) for 4–6 seed categories.

**Exit Gate**
- Wave 1 commit returns accurate created/updated/skipped/deferred counts.
- Wave 2 deferred rows survive page reload and can be committed independently.
- Fast-path endpoints deliver a committable draft in ≤ 5s (photo) / ≤ 1s (template).
- Test-message endpoint returns a real AI response without debiting credits or sending WhatsApp.
- AI settings updates are persisted as selected by vendor.
- Dry-run returns same shape as real commit with zero side-effects (verified by row-count diff test).

## Phase 5 - Quality, Testing, Rollout (2 days)
- Unit tests + integration tests + golden dataset tests.
- **Time-to-live measurements** on pilot vendors, broken down per §12.2 sub-targets.
- Stage rollout behind feature flag.
- Add telemetry dashboard for import success, latency, **auto-accept rate**, **Wave-1 vs Wave-2 split**, correction rate.

**Exit Gate**
- All critical tests pass.
- Staging sign-off by product + QA.
- Auto-accept rate ≥ 70% and manual correction ratio ≤ 25% on pilot vendors.
- Controlled production rollout plan approved.

## Phase 6 - Speed Extensions (post-MVP, 3-5 days)
Deferred from Phase 1 scope; these broaden the entry surface once the core loop is stable.
- Mobile-native capture flow in `vendor-mobile` (Expo): camera → crop → fast-photo API.
- URL / Google Sheet / WhatsApp-forward ingestion adapter.
- Brochure-page image-crop pipeline → auto-populated `Product.imageUrl`.
- `CorrectionHistory` feedback loop — vendor corrections tune normalization on future imports (§5.18).
- Voice-note support for `POST /test-message`.

**Exit Gate**
- Mobile fast-photo path delivers first live product ≤ 60s end-to-end on a typical 4G connection.
- External-source adapter handles at least Google Sheets + public product-URL HTML.

---

## 9) Test Strategy

### 9.1 Unit Tests
- Unit mapping and normalization rules.
- Price conversion and validation boundaries.
- Duplicate detection logic.

### 9.2 Integration Tests
- `analyze` endpoint with mixed file sets.
- `commit` endpoint transaction behavior and idempotency.
- AI config partial update behavior.

### 9.3 Golden Dataset Tests
- Use known vendor examples (including Ibell-style brochure content).
- Verify extraction accuracy and output stability across prompt updates.

### 9.4 Manual QA Scenarios
- clean CSV only,
- image brochure only,
- mixed brochure + CSV conflicts,
- low confidence OCR,
- duplicate product names,
- partial commit failure simulation.

---

## 10) Observability & Ops

- Emit structured logs with `jobId`, `vendorId`, `phase`, `durationMs`, `tokenUsage`.
- Metrics:
  - analyze success rate,
  - commit success rate,
  - avg rows per import,
  - manual correction ratio,
  - end-to-end completion time.
- Alerts:
  - analyze failure spike,
  - commit failure spike,
  - latency threshold breach.

---

## 11) Risks & Mitigations

1. **OCR quality variance**  
   Mitigation: confidence scoring + mandatory review + CSV precedence.

2. **Hallucinated descriptions**  
   Mitigation: enforce source-grounded prompts; reject unsupported claims.

3. **Duplicate catalog pollution**  
   Mitigation: normalized dedupe + explicit update policy + in-batch dedup pass (§5.4) to avoid mid-transaction unique-index aborts.

4. **Unexpected overwrite of vendor AI style**  
   Mitigation: field-level opt-in updates + before/after diff preview.

5. **Cost drift from large brochures**  
   Mitigation: chunking + token budgeting + file limits + async jobs + **per-vendor daily analyze-spend cap** (§5.7) + UI cost estimate shown before analyze is triggered.

6. **Wrong model tier chosen by default**  
   `gpt-4o-mini` is the repo's default but is inadequate for brochure vision. Using it here would silently degrade extraction quality and burn the golden-dataset tests.  
   Mitigation: two-tier pipeline per §6.4 — vision on `gpt-4.1`/`gpt-4o`, text-only enrichment on `gpt-4o-mini`. Pin models in a dedicated config, not in the generic AI service defaults.

7. **Unmetered AI spend**  
   Bypassing `CreditUsage` would break billing invariants and violate the repo-wide AI-metering convention.  
   Mitigation: analyze and commit both debit `CreditUsage` (§5.7) — enforced by code review and a unit test that asserts the debit path is called.

8. **Upload-based DoS / memory pressure**  
   Large PDF uploads buffered in-process can OOM PM2 workers.  
   Mitigation: presigned-S3 uploads (§6.6 option A) + per-vendor analyze rate limit (§5.8) + explicit file-size and page-count caps in `fileIntakeService`.

9. **Broken AI-prompts persistence masks commit bugs**  
   If Phase 0.5 is skipped, commit "appears" to succeed while silently dropping `aiContent*` fields. Symptoms would only surface later as regressed AI behavior.  
   Mitigation: Phase 0.5 fix + integration test that round-trips every documented AI-config field.

10. **Per-page vision latency exceeds target**  
    20-page serial vision extraction cannot hit a 45s P95.  
    Mitigation: page-level parallelism with bounded concurrency (§6.4). If targets still miss, move analyze to an SQS worker and switch the UI to a longer progress model.

11. **Auto-accept admits low-quality rows**  
    A too-generous threshold lets bad data reach the live catalog; a too-strict threshold defeats the speed gain.  
    Mitigation: golden-dataset calibration of the threshold before GA; the §5.9 guardrail on unusual auto-accept ratios; per-vendor threshold override; full audit log of which rows were auto-accepted so a regression can be traced and reversed.

12. **Wave-2 deferred rows become permanent tech debt for vendors**  
    Vendors may commit Wave 1 and never return to Wave 2, leaving products partially in the catalog.  
    Mitigation: persistent `/catalog` banner, email nudge after 7 days, telemetry on Wave-2 completion rate. If <40% of vendors finish Wave 2, re-evaluate threshold and UX.

13. **Test-message endpoint diverges from production pipeline**  
    A sandbox path that skips too many stages gives false reassurance.  
    Mitigation: sandbox mode flips billing/send/persist flags only; all AI stages run identically. Covered by an integration test that asserts stage parity with the production path.

14. **Re-import overwrites vendor manual edits**  
    If §5.18 is implemented loosely, re-importing a supplier brochure wipes a vendor's hand-tuned product descriptions.  
    Mitigation: "protected field" rule keyed on `Product.updatedAt` vs prior job timestamp; explicit per-field opt-in on re-import; before/after diff shown in UI.

15. **Streaming SSE complexity adds failure modes**  
    Reverse proxies / CDNs can buffer SSE, breaking the live feel.  
    Mitigation: set `X-Accel-Buffering: no`, verify end-to-end on the production nginx path; client falls back to polling `GET /:jobId` on EventSource failure (§6.8).

---

## 12) Exit Criteria

## 12.1 MVP Exit Criteria (must-have)
- Vendor can complete import flow from upload to commit without manual API support.
- All three Phase-1 entry points (brochure, single-photo, category template) deliver a committable draft.
- ≥ 80% of rows in typical brochure imports require no mandatory-field edits.
- ≥ 70% of rows qualify for auto-accept on the golden dataset (§5.9).
- Streaming: first product visible ≤ 6s from `Analyze` click.
- Wave 1 + Wave 2 commit flows work end-to-end.
- Review-state autosave survives page reload.
- Go-Live Readiness panel with working sandbox test-message control.
- 100% committed rows satisfy backend product schema constraints.
- Commit endpoint is idempotent and safe under retry.
- AI config updates are applied only to user-selected sections.
- Audit log exists for each import with downloadable summary.

## 12.2 Production Readiness Exit Criteria — time-to-live budget
The single P95 number below replaces the old "≤ 30 minutes median" target and is broken into measurable sub-steps so each can be optimized individually.

| Step | Target (P95) | Notes |
|---|---|---|
| Upload (20-page PDF) | ≤ 15s | Presigned-S3 path |
| First product visible after `Analyze` | ≤ 6s | SSE streaming (§5.10) |
| Analyze complete (20 pages) | ≤ 45s | Page-parallel (§6.4) |
| Review of flagged rows only | ≤ 3 min | Enabled by auto-accept (§5.9) |
| Micro-interview + AI config confirm | ≤ 60s | Pre-filled from signup (§5.13) |
| Wave 1 commit | ≤ 5s | Transactional batches (§5.6) |
| **Total time-to-live (brochure path)** | **≤ 5 min** | (was 30 min) |
| **Time-to-live (single-photo path)** | **≤ 2 min** | Entry B, Phase 1 |
| **Time-to-live (template path)** | **≤ 3 min** | Entry C, Phase 1 |

Additional operational targets:
- Analyze success rate ≥ 95% (non-empty valid output on supported files).
- **Commit success rate ≥ 99.9% for validated payloads.**
- Auto-accept rate ≥ 70% on pilot vendors; **<5% of auto-accepted rows** should later be manually edited (quality guardrail).
- Manual correction ratio ≤ 25% fields per imported product batch.
- Wave-2 completion rate ≥ 40% within 7 days (else re-evaluate threshold).
- No Sev-1 or Sev-2 defects open in import journey.
- Zero unmetered AI calls in the import path (asserted by test).
- SSE stream sustains throughput across the production reverse-proxy path (no buffering regressions).

## 12.3 Business Acceptance Criteria
- First order-ready catalog for new vendor achievable in same onboarding session.
- Product team sign-off on generated AI config quality for pilot vendors.
- Pilot cohort shows improved time-to-first-order versus manual baseline.

---

## 13) Rollout Plan

1. Internal QA only (feature flag off by default).
2. Pilot with 3-5 vendors (including Ibell-like catalog complexity).
3. Measure metrics for one full week.
4. Expand to 25% vendors.
5. Full rollout after stability + cost targets hold.

Rollback:
- disable feature flag,
- keep existing manual catalog flows untouched.

---

## 14) Open Decisions

**Remaining open:**
- Default auto-accept threshold (§5.9): starting at **0.88** row-level / **0.75** field-level — calibrate against the golden dataset before GA.
- Whether `SandboxMessageLog` for test-message debugging is worth adding in MVP or deferred (§6.11).

**Resolved in v1.3 (2026-04-24):**
- ~~Vision provider and fallback.~~ **`gpt-4.1` primary, configurable via `VISION_EXTRACTION_MODEL` env var** (§6.4). PDF ingestion deferred to Phase 6 — removes the need for a Textract fallback in Phase 1.
- ~~File types accepted.~~ **Images (`jpg/png/webp`) + CSV + Excel (`.xlsx`). No PDF in Phase 1** (§5.1, §6.4, §6.6).
- ~~Seed categories for templates (§6.10).~~ **5 locked: restaurant, grocery, bakery, garment, electronics/appliance** (pharmacy dropped).
- ~~Per-vendor daily analyze-spend cap.~~ **₹50/day default (5000 paise), config-driven** (§5.7).
- ~~Analyze rate limits.~~ **5 imports/day and 1 import/hour per vendor**; fast-path 20/hour (§5.8).
- ~~Idempotency key shape.~~ **`{vendorId}:{jobId}`** (§5.4).
- ~~SKU storage.~~ **Add top-level `Product.sku` in Phase 0.5; retain `variants[].sku`** (§5.4, §7.1).
- ~~Sandbox flag plumbing.~~ **Sink-gated (three side-effect sinks only); all 14 stages run identically to production** (§6.11).
- ~~Price-extraction fallback.~~ **Missing/low-confidence price → commit as `isActive: false`** (§5.9).
- ~~File upload strategy.~~ **Presigned-S3** (§6.6).
- ~~Job persistence.~~ **`CatalogImportJob` + inline analyze for MVP**; revisit SQS if P95 > 30s after Phase 2 (§6.3).
- ~~File caps.~~ **8 MB/image × ≤20 images; 5 MB × 1 tabular; 7-day S3 lifecycle** (§6.6).

**Resolved earlier (v1.1):**
- ~~Whether Phase 1 includes image hosting for `imageUrl`.~~ **Phase 6.**
- ~~Whether commit exposes dry-run.~~ **Yes, see §6.5.**
- ~~Whether to repair `aiProducts` / `aiContent*` persistence.~~ **Repair in Phase 0.5** (also covers three `aiContent*` fields currently dropped).

---

## 15) Deliverables Checklist

- [x] **Phase 0.5 prerequisites:**
  - [x] Fix `PUT /api/vendors/:id/ai-prompts` to persist all documented AI fields (single allow-list in `vendorAIConfigService.ts`; reused by commit path; round-trip test in `vendorAIConfigService.test.ts`)
  - [x] Add `CatalogImportJob` Prisma model + migration (`backend/prisma/migrations/add_catalog_import_prereqs.sql`)
  - [x] Add `Vendor.catalogImportEnabled` feature flag (exposed via `GET /api/vendors/:id/config`)
  - [x] Add top-level `Product.sku` column + sparse `@@unique([vendorId, sku])` index
  - [x] Wire presigned-S3 upload endpoint (`POST /api/catalog-import/upload-url`) + `importStorageService.ts`. **Ops still owes: S3 bucket creation, 7-day lifecycle rule, CORS, IAM scoping**
  - [x] Add `exceljs` dependency for `.xlsx` parsing
  - [x] Add `VISION_EXTRACTION_MODEL` env var plumbing (default `gpt-4.1`)
- [x] Frontend entry-picker + pages: `/catalog/import`, `/catalog/import/photo`, `/catalog/import/template`, `/catalog/import/:jobId/go-live`
- [x] Analyze / commit / status / **SSE stream** / **fast-photo** / **fast-template** / **test-message** APIs (incl. dry-run §6.5)
- [x] `fileIntakeService.ts` with size/MIME/page-count caps
- [x] Extraction + normalization + confidence engine (page-parallel per §6.4)
- [x] Category-specific extraction prompts + `baseUnit` defaults (§5.14) — 5 prompt files in `backend/src/services/prompts/catalogExtraction/`
- [x] Category template JSONs under `backend/src/data/catalog-templates/` (§6.10): `grocery.json` populated; `restaurant`, `bakery`, `garment`, `electronics` ship as empty stubs (Entry C hides for those categories until merchandising authors them)
- [x] **Streaming review UI** with auto-accept grouping (§5.9, §5.10)
- [x] **AI-assisted review controls**: inline suggestion, bulk-fix, re-scan-page, ask-AI-to-fill (§5.11)
- [x] **Business-profile micro-interview** (§5.12)
- [x] **Pre-fill AI config from `Vendor` registration data** (§5.13)
- [x] Commit-in-waves: Wave 1 transaction + audit + Wave 2 deferred drawer (§5.6)
- [x] Commit-failure per-row retry (§5.17)
- [x] Re-import merge with protected-field rule (§5.18)
- [x] Review-state autosave (`draftEdits`, §5.16)
- [x] **Go-Live Readiness panel** with sandbox test-message + wa.me / QR (§5.15)
- [x] AI config generation + selective apply (consuming the fixed `ai-prompts` handler)
- [x] `CreditUsage` metering on analyze + Wave-1 commit; sandbox test-message does NOT debit (sink-gated; parity test green)
- [x] Per-vendor rate limit on analyze (5/day, 1/hour) + daily paise cap (₹50) + fast-path 20/hour
- [x] Multi-language keyword generation (Tamil / Hindi / English) — batched enrichment call per analyze job
- [x] Test suite (63 tests across 9 files) + golden-dataset scaffolding + auto-accept calibration script. **Pending: 10 real brochure fixtures** (5 restaurant / 3 grocery / 2 electronics) + final threshold tune
- [x] Metrics: structured Pino logs (`jobId`, `vendorId`, `phase`, `durationMs`, `tokensUsed`, `costPaise`) + global kill switch `CATALOG_IMPORT_GLOBAL_KILL`. **Pending: Grafana dashboard + alert wiring** (ops task)
- [ ] Product documentation update and enablement guide
- [ ] **Phase 6 (post-MVP):** mobile-native capture, URL / Sheet / WhatsApp-forward ingestion, image-crop pipeline, `CorrectionHistory` feedback loop, voice-note test message

---

## 17) Progress Tracker (as of 2026-04-25)

### Completed phases

| Phase | Scope | Status |
|---|---|---|
| **0** | Alignment & technical design | ✅ v1.3 decisions locked |
| **0.5** | Prereq fixes & infrastructure | ✅ Code landed; ops bucket setup outstanding |
| **1** | Backend foundations (routes, schemas, billing kinds, rate limits) | ✅ |
| **2** | Extraction + normalization engine (vision, tabular, fusion, dedup, SSE, enrichment) | ✅ |
| **3** | Frontend import UX (4 pages + ~12 components + autosave) | ✅ |
| **4** | Commit waves, fast paths, sandbox sink-gating, re-import merge, templates | ✅ |
| **5.1** | Unit tests | ✅ 48 tests across normalization / templates / rate limit / commit dry-run / sandbox parity |
| **5.2** | Integration tests | ✅ Commit idempotency replay + AI-prompts round-trip (14 tests) |
| **5.3** | Golden dataset scaffolding | ✅ Harness + sample CSV case + calibration script (10 real brochures pending) |
| **5.4** | Observability (structured logs) | ✅ Wired through analyze, commit, fast-photo |
| **5.6** | Rollback kill switch | ✅ `CATALOG_IMPORT_GLOBAL_KILL` middleware + verification test |

### Pending activity (gates between here and GA)

**Engineering — none.** All MVP-shipping code paths are landed and green. Type-check clean; 63/63 catalog-import tests passing.

**Ops / infrastructure (blocking pilot)**
1. **S3 bucket provisioning** — create `catalog-imports-{env}` bucket with:
   - 7-day lifecycle rule on `imports/*`
   - CORS allowing `PUT` from vendor-app origins
   - IAM role for backend (`s3:PutObject`, `s3:GetObject` scoped to `imports/*`, no public-read)
   - Set `CATALOG_IMPORT_S3_BUCKET` and `CATALOG_IMPORT_S3_REGION` envs in staging + prod
2. **Run the prereq SQL migration** (`backend/prisma/migrations/add_catalog_import_prereqs.sql`) on staging, then prod after sign-off.
3. **Verify nginx passes `X-Accel-Buffering: no`** through to clients on `/api/catalog-import/:jobId/stream` (SSE buffer bypass).
4. **Grafana dashboard** with the panels listed in §10: analyze success rate, commit success rate (≥99.9% target), time-to-first-product P95 (≤6s), time-to-live P95 (brochure ≤5 min, photo ≤2 min, template ≤3 min), auto-accept rate (≥70%), Wave-2 completion at 7 days (≥40%), correction ratio (≤25%). Plus alerts: analyze failure spike >10% over 5 min; commit failure spike >1%; P95 analyze >60s for 10 min.
5. **OpenAI API key entitlement** for `gpt-4.1` (vision) on the production project.

**Content / product (blocking GA, not pilot)**
6. **Golden dataset content** — 10 real reference brochures (5 restaurant, 3 grocery, 2 electronics) dropped under `backend/test/fixtures/catalog-import/golden/cases/` with recorded vision responses. Once present, the calibration script picks the final auto-accept threshold and the in-test ≥70% gate activates.
7. **Merchandising-authored category templates** for restaurant, bakery, garment, electronics. Until written, Entry C is hidden for those categories (frontend already gates on `templateAvailable`).
8. **Product enablement doc** — vendor-facing how-to for the import flow (last unchecked item in §15).
9. **Pilot-vendor selection** — 3–5 vendors enabled with `catalogImportEnabled = true`, including one Ibell-style complex catalog. Watch dashboard for 1 week.

**Acceptance gate before 100% rollout**
- Auto-accept rate ≥ 70% sustained over 1 week of pilot data.
- Manual correction ratio ≤ 25%.
- No Sev-1/Sev-2 defects open.

**Uncommitted state right now**
- 59 files staged or untracked across `backend/src/{services,routes,middleware,lib,data}`, `frontend_v2/apps/web-vendor/src/{pages,components,hooks,lib}`, schema/migration, and tests. Nothing has been committed to `multi_stage_ai_worker` yet — the user has not asked for a commit. When ready, expect the diff to land as a single feature branch under `multi_stage_ai_worker` (or a dedicated `catalog-import` branch off it) so it can be reviewed as one logical unit.

---

## 16) Changelog

### v1.4 (2026-04-25) — Phase 5 complete, pre-pilot
- **Phases 0.5 → 5** all engineering work landed on branch `multi_stage_ai_worker`. 63 catalog-import tests passing; type-check clean.
- **§15** deliverables checklist updated: every code-shaped item ticked except product enablement doc and Phase 6 post-MVP items.
- **New §17 Progress Tracker** added — captures completed phases, the ops/content/product items still gating pilot and GA, and the uncommitted-state note.
- No spec or contract changes in this revision; v1.3 decisions still hold.

### v1.3 (2026-04-24) — Phase 0 decisions locked
All Phase-0 open questions collapsed to concrete decisions so Phase 0.5 can begin without further ambiguity.
- **§3, §5.1, §6.4** — PDF dropped from Phase 1 (deferred to Phase 6). Accepted types: images + CSV + `.xlsx`.
- **§5.2** — Excel parsing via `exceljs`; first sheet authoritative.
- **§5.4, §7.1** — top-level `Product.sku` added (Phase 0.5 migration); dedup key incorporates sku; sparse unique index `@@unique([vendorId, sku])`. Idempotency key format locked: **`{vendorId}:{jobId}`**.
- **§5.4, §5.9** — "never commit rows missing basePrice" relaxed to **"commit as `isActive: false` if price missing or low-confidence"**, so vendors are live on rows we're confident about while price-missing rows are quarantined under a "Needs pricing" group.
- **§5.7** — daily analyze-spend cap locked at **₹50/vendor/day** (5000 paise), config-driven; 429 + Retry-After on breach.
- **§5.8** — rate limits locked: **5 imports/day** and **1 import/hour** on `/analyze`; **20/hour** on fast-path endpoints.
- **§6.1, §6.6** — upload flow locked: new `POST /upload-url` → browser `PUT` to S3 → analyze receives S3 keys. Caps: **8 MB/image × ≤20 images**, **5 MB** tabular, **7-day** S3 lifecycle.
- **§6.3** — MVP locked to **inline analyze** with `CatalogImportJob` for state. Move to SQS worker only if Phase 2 measurements show P95 > 30s.
- **§6.4** — vision model locked to **`gpt-4.1`** behind `VISION_EXTRACTION_MODEL` env var for future swaps.
- **§6.10** — seed categories locked to **5** (restaurant, grocery, bakery, garment, electronics/appliance). Pharmacy dropped.
- **§6.11** — sandbox plumbing locked to **sink-gated** — all 14 stages run identically; sandbox flag checked only at `billingService.debitCreditUsage`, `responseQueuingService.enqueue`, and customer-facing `Message.create`. Parity integration test required to ship.
- **§14** — all above collapsed into resolved; two remain open (auto-accept threshold calibration + `SandboxMessageLog` in MVP vs defer).
- **§15** — deliverables checklist updated with new Phase 0.5 items (Product.sku migration, S3 upload endpoint, exceljs, vision model env var).

### v1.2 (2026-04-24) — speed-to-live pass
- **Primary goal reframed** from "≤ 30 min" to "live in minutes": ≤2 min (single-photo) / ≤5 min (brochure + auto-accept) / ≤15 min (full manual review).
- **§4.1** rewritten to branch by entry point (brochure, single-photo, category template, Phase-6 URL/Sheet) with streaming + auto-accept + commit-in-waves + Go-Live panel.
- **§5.6** redefined as **Commit-in-Waves** (Wave 1 immediate auto-accepted products → vendor live; Wave 2 deferred review drawer).
- New rule sections:
  - §5.9 **Auto-accept policy** with threshold, guardrails, vendor controls.
  - §5.10 **Streaming extraction** (SSE, per-page results).
  - §5.11 **AI-assisted review controls** (inline suggest, bulk-fix, re-scan, ask-AI-to-fill).
  - §5.12 **Business-profile micro-interview** to fill `aiContent*` / delivery / prep-time.
  - §5.13 **Pre-fill AI config from `Vendor` registration data**.
  - §5.14 **Category-specific extraction prompts & defaults**.
  - §5.15 **Go-Live Readiness panel** with sandbox test-message and wa.me / QR.
  - §5.16 **Review-state persistence** (draftEdits autosave).
  - §5.17 **Commit-failure per-row retry**.
  - §5.18 **Re-import merge** with protected-edit rule.
- New API endpoints (§6.1): SSE `/stream`, `/fast/photo`, `/fast/template`, `/test-message`.
- New architecture sections: §6.9 SSE, §6.10 category templates storage, §6.11 sandbox test-message.
- Phases 3 & 4 scope expanded to own speed features; **Phase 6** added for mobile-native, URL/Sheet ingestion, image-crop, correction feedback loop.
- **§11** risks expanded (auto-accept quality, Wave-2 abandonment, test-message divergence, re-import overwrite, SSE infra).
- **§12.2** replaces the single "30 min median" target with a **per-step time-to-live budget**; adds auto-accept rate, Wave-2 completion, quality guardrails.
- Entry-point fast paths cemented in §4.2 + §6.8.

### v1.1 (2026-04-22)
- Flagged missing file-upload and job-persistence infrastructure in §3.
- Added §5.7 (billing/credit metering) and §5.8 (rate limiting).
- Added §6.3 (job persistence model), §6.4 (model selection — two-tier pipeline), §6.5 (dry-run commit), §6.6 (upload strategy), §6.7 (feature flag).
- Corrected §7.1 variant shape to match existing `VariantSchema`; added Decimal-type notes.
- Expanded §7.2 with the full list of `aiContent*` fields currently dropped by the handler, plus persistence precondition.
- Added Phase 0.5 for prerequisite fixes; resequenced Phases 3 & 4 to run in parallel.
- Expanded §11 risks (model tier, unmetered spend, upload DoS, broken persistence, vision latency).
- Tightened §12.2 commit success-rate target from 98% → 99.9%; clarified P95 target depends on page-parallel extraction.
- Resolved two §14 open decisions (dry-run: yes; fix `ai-prompts` handler: yes).

### v1.0
- Initial plan.

---

**Document Version:** 1.3  
**Next Review:** After Phase 2 completion (first auto-accept-rate measurement)  
**Related Areas:** `Product Catalog`, `Vendor Settings`, `Multi-stage AI product grounding`, `Vendor Onboarding`
