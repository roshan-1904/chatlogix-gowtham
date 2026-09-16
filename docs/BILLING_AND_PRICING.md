# Billing and Pricing — Single Source of Truth

<!-- DOC_SYNC
  last_verified_commit: 34c42e767ad3c86d9ed1d3d1d4d7953b2adba03c
  last_verified_at: 2026-09-16
  scope: Millirupee wallet unit, pricingService charge formula, per-vendor markup, charge sources, wallet schema, trial grant, dashboard billing block, admin billing endpoints, PlatformSettings (paise) + daily USD/INR refresh
-->

**This file is the authority for how ChatLogix charges a vendor.** Other docs should link here rather than restate the formula, the unit, or the source list. If a doc disagrees with this one, this one is right — or both are wrong and the code wins (`backend/src/services/pricing/pricingService.ts`).

---

## 1. The money unit

Wallet money is **millirupees** ("milli"). `backend/src/utils/money.ts` is the unit authority.

```
1 rupee = 1000 milli = 100 paise      →      1 paise = 10 milli
```

Every wallet column, env var, API field and variable holding millirupees carries a `Milli` suffix.

**Order money is not wallet money.** `Order.totalAmount`, `Product.basePrice`, cart line totals and revenue figures are still **paise**, and they format themselves at their own call sites (`backend/src/conversation/cart/`, `llm/llm2.ts`, `frontend_v2/.../utils/currency.ts`). Running a paise amount through `formatRupeesFromMilli()` is off by 10x. Do not blur the two.

| Helper | Purpose |
|---|---|
| `usdToMilliFloat(costUsd, usdToInr?)` | OpenAI USD → **unrounded** milli. Uses the passed rate, else the in-memory effective PlatformSettings rate, else env. Deliberately fractional. Stays **sync**. |
| `ceilMilli(value)` | The one rounding step, applied once at the charge boundary. |
| `paiseToMilli` / `milliToPaise` | Settings → wallet boundary (`×10` / `÷10`), plus the few order-money interop points. |
| `formatRupeesFromMilli(milli)` | Vendor-facing display, e.g. `525` → `₹0.53`. |
| `rupeesToMilli(rupees)` | Top-up presets and admin entry. |
| `USD_TO_INR` | Env **fallback** only (`USD_TO_INR_RATE`, default `83`). Live FX is PlatformSettings. |

### Platform settings (paise) vs wallet (milli)

Live billing knobs live in the `PlatformSettings` singleton (`id=default`), stored and returned as **paise**. Wallet columns and `pricingService` stay in **milli** until a later cutover. Convert once at charge / trial-grant / cap / top-up call sites with `paiseToMilli`.

**Effective FX** = `usdToInrOverride ?? usdToInrRate`. Daily Frankfurter fetch writes `usdToInrRate`; admins may pin `usdToInrOverride` (or `null` to clear). Live fetches outside `50..150` are rejected; yesterday's DB rate stays.

Read path: process memory (60s) → Redis `platform:settings` (24h TTL) → Postgres → env fallback (milli env vars ÷ 10). `ensurePlatformSettings()` runs at billing entry points so `usdToMilliFloat` can stay sync.

Env vars (`USD_TO_INR_RATE`, `TRIAL_GRANT_MILLI`, `PLATFORM_FEE_*_MILLI`, `CATALOG_*_DAILY_MILLI_CAP`, `MIN/MAX_WALLET_TOPUP_MILLI`, `WALLET_TOPUP_PRESETS_MILLI`, `MOCK_WALLET_TOPUP_ENABLED`) are **seed + last-resort fallback** only. `WALLET_PAYMENT_PROVIDER` stays env-only.

---

## 2. The charge formula

`backend/src/services/pricing/pricingService.ts` is the **only** writer of `Vendor.walletBalanceMilli`. Every billable action costs:

```
chargeMilli = ceil((aiCostMilli + whatsappCostMilli + platformFeeMilli) × (1 + markupPercent / 100))
```

Cost components stay fractional right up to the `ceil`, so a turn made of several sub-millirupee API calls (LLM-1, LLM-2, transcription) is not rounded three times on the way in. One rounding step, **after** markup — a sub-millirupee action still costs 1 milli rather than nothing.

| Component | Where it comes from |
|---|---|
| `aiCostMilli` | OpenAI spend — tokens via `aiCostMilliForTokens`, USD passthrough via `aiCostMilliFromUsd`, speech-to-text priced per second of audio via `aiCostMilliForAudio` |
| `whatsappCostMilli` | Meta per-conversation cost. **Always 0 today** — see §7 |
| `platformFeeMilli` | `PlatformSettings.platformFeePerTurnPaise` / `platformFeeOutboundMediaPaise` (converted ×10). Env `PLATFORM_FEE_*_MILLI` is fallback only. Both default `0` |
| `markupPercent` | `Vendor.markupPercent`, default `50`, clamped to `0–500` |

### Worked examples (default 50% markup)

| Underlying cost | Vendor is charged |
|---|---|
| An AI action costing ₹0.350 | **₹0.525** |
| A conversation reply costing ₹0.260 | **₹0.390** |

### Per-vendor markup

`Vendor.markupPercent` is an `Int` with schema default `50`. Admins edit it with:

```
PATCH /api/vendors/:id/billing-config
{ "markupPercent": 60 }        // integer, 0–500, admin role only
```

The markup is resolved **inside** the charge transaction, so the `markupPercent` snapshot written to `WalletTransaction.metadata` is the one the charge was actually computed with.

---

## 3. There is no monthly plan quota

The plan-credit concept is **gone**:

- `PLAN_CREDITS` and `getPlanCredits` are deleted. `backend/src/utils/planUtils.ts` now only exports `getBillingCycleDates`.
- No `planCredits`, `remainingThisMonth`, `usagePercentage` or `planName` exists in any API response.
- **Flat per-message-type credit costs (text = 1, audio = 3, image = 2) no longer exist.** Any doc still stating them is wrong.
- `Vendor.subscriptionPlan` survives as **bookkeeping only** and must not influence any billing calculation. `POST /api/vendors/:id/upgrade-plan` just relabels it.
- `BillingHistory` still exists in the schema but is not written by the pricing path.

The wallet gate is `billingService.canProcessMessage`, which requires the vendor to afford a **worst-case turn at their own markup** — not merely to hold a non-zero balance:

- Worst-case AI budget: LLM-1 at 4000 prompt / 400 completion tokens plus LLM-2 at 1500 / 300, using the vendor's `aiModel`.
- Optionally reserves worst-case outbound product media (3 attachments) for conversation turns.
- Also fails closed with `trial_expired` when `trialExpiresAt` has passed and the vendor is not `approved`.

Over-estimating is the safe direction: the gate only controls *entry* to a turn, and a vendor who clears it can always finish.

---

## 4. Charge sources

Every debit records a `source`, on both `WalletTransaction.metadata.source` and the required `CreditUsage.source` column. These strings are a **persisted contract** read back by the trial breakdown, the dashboard spend breakdown and the catalog daily caps.

| `source` | Written by | Vendor-facing label |
|---|---|---|
| `conversation_turn` | `backend/src/conversation/billing.ts` (`debitAfterEnqueue`) | Customer replies |
| `legacy_conversation_turn` | `backend/src/services/messageProcessor.ts` | Customer replies |
| `outbound_media` | `conversation/billing.ts` (`debitOutboundMessage`), from the response dispatcher | Product media sends |
| `catalog_import` | `catalogImportService.ts`, `catalogImportFastPathService.ts` | Catalog import |
| `catalog_enhance` | `catalogEnhanceChatService.ts` | Catalog enhancer |
| `catalog_enhance_transcribe` | `catalogEnhanceChatService.ts` | Catalog enhancer voice |
| `sandbox_chat` | `onboardingSandboxService.ts` | Sandbox replies |
| `sandbox_transcribe` | `onboardingSandboxService.ts` | Voice transcription |

`wallet_topup` and `admin_recharge` are **credit** metadata sources written by `walletTopUpService`. They reach `WalletTransaction` only, never `CreditUsage`, and the dashboard filters them out of spend defensively.

### Idempotency

`ChargeVendorInput.idempotencyKey` is written to `CreditUsage.externalId`, whose unique index makes a double charge a no-op (Prisma `P2002` → `outcome: 'already_charged'`). Because `CreditUsage.conversationId` is nullable, non-conversation charges get a row — and therefore the same guarantee.

| Path | Key |
|---|---|
| Conversation turn | `whatsappMessageId` |
| Outbound media | `outbound-msg:{messageId}` |
| Wallet top-up | `intent:{intentId}` / admin recharge key |

### Zero-cost charges are skipped

If all three cost components are zero, `chargeVendor` returns `outcome: 'skipped'` without touching the database. This is the normal path for outbound product media while the outbound-media platform fee is `0`.

### `floorAtZero`

Trial and sandbox charges pass `floorAtZero: true` so a trial wallet never goes negative; the ledger row records `clampedToBalance: true` when that happens. Live balances **may** go slightly negative when an actual turn exceeds its estimate — the next turn's gate is what stops the bleeding.

---

## 5. Schema

| Model | Field | Notes |
|---|---|---|
| `Vendor` | `walletBalanceMilli` `Int @default(0)` | Only `pricingService` and `walletTopUpService` write it |
| `Vendor` | `trialGrantedMilli` `Int?` | Original trial amount, for "₹32 of ₹50" UI |
| `Vendor` | `markupPercent` `Int @default(50)` | Admin-editable, 0–500 |
| `Vendor` | `trialExpiresAt` `DateTime?` | `PlatformSettings.trialExpiryDays`, default 30 |
| `WalletTransaction` | `amountMilli`, `balanceBeforeMilli`, `balanceAfterMilli` | Types: `recharge`, `deduction`, `refund`. `metadata` carries the full breakdown + `markupPercent` snapshot |
| `CreditUsage` | `chargedMilli` `Int` | What the vendor was actually debited |
| `CreditUsage` | `source` `String` (**required**) | §4 |
| `CreditUsage` | `conversationId` `String?`, `conversationType` `MessageType?` | Both nullable — non-conversation sources leave them null |
| `CreditUsage` | `externalId` `String? @unique` | Idempotency |
| `WalletTopUpIntent` | `amountMilli`, `status`, `provider`, `idempotencyKey @unique`, `expiresAt` | P2g mock/Razorpay intents |
| `PlatformSettings` | money in **paise**; FX Decimals | Singleton `id=default`. Live knobs + `usdToInrOverride` |
| `FxRateHistory` | `base`, `quote`, `rate`, `source`, `fetchedAt` | One row per successful USD/INR fetch |

`CreditUsage` is indexed on `(vendorId, usageDate desc)`, `(vendorId, source)` and `(vendorId, conversationType)`.

### Migrations — all applied

Verified 2026-09-16 against the dev database: `prisma migrate status` reports "Database schema is up to date!" for all 7 migrations.

- `20250916120000_wallet_top_up_intent`
- `20250916180000_wallet_milli_units`
- `20250916210000_credit_usage_source`
- `20250916220000_platform_settings` — `PlatformSettings` + `FxRateHistory`; seeds paise defaults (milli env ÷ 10)

**How they were applied matters if you ever bootstrap another environment.** The schema changes reached the database out of band (`prisma db push` or hand-run SQL), so `prisma migrate deploy` later failed with `column "walletBalance" does not exist` — the rename had already happened. Postgres rolled that attempt back (`applied_steps_count = 0`), but the failed record blocked every later migration until reconciled with `prisma migrate resolve --applied <name>`.

**Before re-running `20250916180000_wallet_milli_units` anywhere, check whether the ×10 rescale already ran.** It is not idempotent: applying it twice multiplies every balance by 100. The reliable marker is `WalletTransaction.metadata ->> 'unitMigration' = 'paise_to_milli'`, which the migration stamps on all pre-cutover rows *before* rescaling:

```sql
SELECT COUNT(*) FILTER (WHERE "metadata" ->> 'unitMigration' = 'paise_to_milli') AS stamped,
       COUNT(*) AS total
FROM "WalletTransaction";
```

A non-zero `stamped` means the rescale has run. A magnitude check on a known vendor works as a second opinion: a balance of `501570` reads as ₹501.57 in milli, whereas `5015700` would mean a double rescale.

---

## 6. APIs

### Vendor-facing

| Endpoint | Returns |
|---|---|
| `GET /api/vendors/:id/config` | `walletBalanceMilli`, `markupPercent`, `plan`, `status` |
| `GET /api/vendors/:id/usage-analytics` | `{ vendorId, chargedMilli }` — all-time sum over `CreditUsage` |
| `GET /api/vendors/:id/dashboard-stats` | a `billing` block (below) |
| `GET /api/vendors/me/trial-wallet` | `balanceMilli`, `grantedMilli`, `expiresAt`, `breakdown[]` by source |
| `GET /api/vendors/me/wallet` | `balanceMilli`, `registrationStatus`, `provider`, `mockTopUpEnabled`, `presetsMilli`, `recentTransactions[]` |
| `POST /api/vendors/me/wallet/top-up-intent` | `{ amountMilli }` → provider intent |
| `POST /api/vendors/me/wallet/confirm-mock` | `{ intentId }` → `balanceMilli`, `transactionId`, `alreadyCompleted` |

The `billing` block on `dashboard-stats` — every amount in millirupees:

```typescript
billing: {
  balanceMilli: number;
  spend: { today: number; thisWeek: number; thisMonth: number; total: number };
  breakdownBySource: Array<{ source: string; label: string; milli: number; count?: number }>;
  dailySpend: Array<{ date: string; milli: number }>;   // trailing 7 days, backfilled
  averagePerDayMilli: number;
  projectedMonthlySpendMilli: number;                    // linear regression over dailySpend
  lowBalanceWarning: boolean;                            // balanceMilli < 20000 (₹20)
  billingCycleStart: string;                             // ISO, calendar month today
  billingCycleEnd: string;
}
```

`spend.thisWeek` is the trailing 7 days; `spend.thisMonth` is the current billing cycle. `breakdownBySource` and `dailySpend` are derived from `CreditUsage`, not from the ledger.

### Admin-only

| Endpoint | Purpose |
|---|---|
| `PATCH /api/vendors/:id/billing-config` | Set `markupPercent` (0–500) |
| `GET /api/vendors/:id/wallet-transactions` | Recent ledger rows (`limit` 1–200, default 50) for the admin vendor detail panel |
| `POST /api/vendors/:id/recharge-wallet` | Ops escape hatch; body `amount` in **millirupees**, integer |
| `POST /api/vendors/:id/upgrade-plan` | Relabels `subscriptionPlan` only — no billing effect |
| `GET /api/admin/settings` | Full PlatformSettings row plus `effectiveUsdToInrRate` (paise; FX dimensionless) |
| `PATCH /api/admin/settings` | Partial update. Accepts `usdToInrOverride` (`number \| null`). Does **not** accept `usdToInrRate` / `usdToInrFetchedAt` |
| `POST /api/admin/settings/refresh-fx` | Admin-triggered Frankfurter fetch (does not wait for the 24h tick) |

**Admin access to `web-admin` is granted by the `AUTH_ADMIN_PHONES` env allowlist**, resolved in `backend/src/services/roleService.ts` — *not* by the `Admin` table. This matters now that web-admin has a real vendor list with markup editing.

### Daily USD/INR refresh

`refreshUsdInrRate()` in `backend/src/services/platformSettingsService.ts` GETs `https://api.frankfurter.app/latest?from=USD&to=INR` (ECB, no API key). The PM2 API process starts a 24h interval from `backend/src/index.ts` (runs immediately when `usdToInrFetchedAt` is older than 24h). Optional Lambda: `backend/src/lambdas/handlers/fxRateRefresh.ts` — **not** one of the five hardcoded `deploy.yml` names. Suggested EventBridge rule: `cron(30 18 * * ? *)` UTC = 00:00 IST.

---

## 7. Known gap: WhatsApp conversation fees are not billed

Platform fees default to `0` paise (`platformFeePerTurnPaise` / `platformFeeOutboundMediaPaise`), and `whatsappCostMilli` is never populated. The slot is scaffolded in `ChargeCostInput` but stays zero **until the P2h Meta rate card lands**.

**ChatLogix absorbs Meta conversation fees today.** This is a deliberate, known gap — not an oversight. The consequence is that sending outbound product media is currently **free** to the vendor, a deliberate drop from the old flat 2/10-credit charge, which was revenue unconnected to any real cost.

---

## 8. Trial wallet

| Setting | Value |
|---|---|
| `trialGrantPaise` (env fallback `TRIAL_GRANT_MILLI`) | `5000` paise / `50000` milli = **₹50** |
| `trialExpiryDays` (env fallback `TRIAL_EXPIRY_DAYS`) | `30` |
| Low-balance warning | balance under **₹20** (`20000` milli) |

The trial grant was **lowered from ₹100 to ₹50**. Any doc or UI copy claiming "₹100 free trial/credits" is stale.

A conversation reply now works out to roughly **₹0.20** on `gpt-4.1-mini`, so a ₹50 trial is **roughly 250 replies**. The warning threshold must stay under the grant, or every trial vendor starts out warned.

`getTrialWalletSummary` (`billingService.ts`) returns `balanceMilli`, `grantedMilli` (falling back to `paiseToMilli(trialGrantPaise)`), `expiresAt` and a per-source `breakdown[]`. It reads the last 500 `deduction` ledger rows and, if no `catalog_import` bucket appears, backfills one from `CatalogImportJob.tokenUsage`.

---

## 9. Wallet top-up (P2g)

Live limits/presets/mock flag are `PlatformSettings` (paise). Env is fallback only, except the provider.

| Knob | Default | Meaning |
|---|---|---|
| `WALLET_PAYMENT_PROVIDER` (**env only**) | `mock` | `mock` \| `razorpay` |
| `minWalletTopUpPaise` (`MIN_WALLET_TOPUP_MILLI`) | `10000` paise / ₹100 | Minimum top-up |
| `maxWalletTopUpPaise` (`MAX_WALLET_TOPUP_MILLI`) | `5000000` paise / ₹50,000 | Maximum top-up |
| `walletTopUpPresetsPaise` (`WALLET_TOPUP_PRESETS_MILLI`) | `[50000, 100000, 200000, 500000]` | ₹500 / ₹1,000 / ₹2,000 / ₹5,000 |
| `mockWalletTopUpEnabled` (`MOCK_WALLET_TOPUP_ENABLED`) | `true` | Set `false` in production once Razorpay is live |

All wallet top-ups go through the single `creditWalletFromTopUp` path in `backend/src/services/wallet/walletTopUpService.ts` — mock provider, admin recharge and (later) the Razorpay webhook all call it. Full plan and Razorpay migration steps: [wallet-top-up-p2g.md](../documentation/modules/features/vendor-onboarding/guides/wallet-top-up-p2g.md).

---

## 10. Daily caps on catalog AI

Caps are on **raw OpenAI spend**, not on the marked-up amount the vendor pays.

| Knob | Default | Enforced by |
|---|---|---|
| `catalogImportDailyPaiseCap` (`CATALOG_IMPORT_DAILY_MILLI_CAP` fallback) | `5000` paise / ₹50 | `middleware/catalogImportRateLimit.ts` → `getTodaysCatalogImportMilliSpent` (sums `CatalogImportJob.tokenUsage`) |
| `catalogEnhanceDailyPaiseCap` (`CATALOG_ENHANCE_DAILY_MILLI_CAP` fallback) | `3000` paise / ₹30 | `middleware/catalogEnhanceRateLimit.ts` → `getTodaysCatalogEnhanceMilliSpent` (sums the ledger) |

Both use an IST day boundary and return `429` with `Retry-After` set to seconds until IST midnight. The wallet pre-flight in the same middleware fails **closed** with `402`; the cap check fails **open** on an infra hiccup.

`tokenUsageTotalMilli` (`services/pricing/catalogTokenUsage.ts`) reads both the post-cutover `totalMilli` key and pre-cutover `totalPaise` rows.

---

## 11. What changed for operators

The rework moved most paths from "flat or cost-price" to "real cost plus markup". Expect these shifts in vendor spend:

| Path | Before | After |
|---|---|---|
| Conversation reply | flat 1 paisa | **real cost — around ₹0.20 per reply on `gpt-4.1-mini`** |
| Inbound voice note | free | **costs real money** — Whisper, priced by audio duration, folded into the same turn charge |
| Outbound product media | flat 2 credits (image) / 10 (video) | **free** while its platform fee is 0 (§7) |
| Catalog enhance | hardcoded 2x cost | **down ~25%** — the 2x became the vendor's 1.5x |
| Catalog import | billed at cost, no markup | **+50%** |
| Catalog import fast path | billed at cost, no markup, enrichment pass unbilled | **+50%**, and the enrichment pass is now billed too |
| Onboarding sandbox | billed at cost, no markup | **+50%** |

---

## 12. Deleted symbols

These no longer exist. If you find them in a doc or a comment, the doc is stale:

`creditsForKind` · `creditsForAssistantTurnWorstCase` · `deductCredits` · `recordVendorAiSpend` · `recordCatalogImportSpend` · `recordSandboxSpend` · `estimatePipelineCostMilli` · `usdToPaise` · `vendorAiChargePaise` · `PLAN_CREDITS` · `getPlanCredits` · `backend/src/utils/billingPaise.ts`

Renamed: `getTodaysCatalogImportPaiseSpent` → `getTodaysCatalogImportMilliSpent`; `TRIAL_GRANT_PAISE` → `TRIAL_GRANT_MILLI`; `MIN/MAX_WALLET_TOPUP_PAISE` → `..._MILLI`; `WALLET_TOPUP_PRESETS_PAISE` → `..._MILLI`.

---

## 13. Source files

| Concern | File |
|---|---|
| Unit authority | `backend/src/utils/money.ts` |
| Charge formula, the only wallet writer | `backend/src/services/pricing/pricingService.ts` |
| Catalog token-usage reader | `backend/src/services/pricing/catalogTokenUsage.ts` |
| Wallet gate, trial summary, daily-cap readers | `backend/src/services/billingService.ts` |
| Per-turn + outbound-media debits, reconciliation sweep | `backend/src/conversation/billing.ts` |
| Dashboard `billing` block | `backend/src/services/dashboardStatsService.ts` |
| Top-up credit path + providers | `backend/src/services/wallet/` |
| Vendor wallet routes | `backend/src/routes/vendorWallet.ts` |
| Admin billing-config + ledger routes | `backend/src/routes/vendors.ts` |
| Billing cycle window | `backend/src/utils/planUtils.ts` |
| OpenAI token/audio cost tables | `backend/src/utils/costCalculator.ts` |
| Cached platform knobs + FX refresh | `backend/src/services/platformSettingsService.ts` |
| Admin settings API | `backend/src/routes/adminSettings.ts` |
| Env fallbacks | `backend/src/config/env.ts` (`numericEnv`, `walletEnv`) |

## Related docs

- [INCOMING_RESPONSE_GENERATOR_FLOW.md](./INCOMING_RESPONSE_GENERATOR_FLOW.md) §10 — where the per-turn debit sits in the pipeline
- [VENDOR_CATALOG_ENHANCER.md](./VENDOR_CATALOG_ENHANCER.md) §13 — enhancer billing
- [PRODUCT_MEDIA.md](./PRODUCT_MEDIA.md) §14 — outbound media billing
- [public-signup-onboarding.md](../documentation/modules/features/vendor-onboarding/guides/public-signup-onboarding.md) §"Billing model" — trial wallet in the signup flow
- [wallet-top-up-p2g.md](../documentation/modules/features/vendor-onboarding/guides/wallet-top-up-p2g.md) — top-up flow and the Razorpay migration
- [vendor-dashboard/API.md](../documentation/modules/features/vendor-dashboard/API.md) — the `billing` block contract
- [vendor-dashboard/USER_GUIDE.md](../documentation/modules/features/vendor-dashboard/USER_GUIDE.md) — what the vendor sees
- [approval-runbook.md](../documentation/modules/features/vendor-onboarding/guides/approval-runbook.md) — ops billing knobs
- [meta-partnership README](../documentation/requirements/meta-partnership/README.md) — P2h WhatsApp rate card

### Documents deliberately left stale

These describe a subscription-plan-with-credits model that was **never implemented**. They carry a superseded banner pointing here and were not rewritten, because they are historical planning/commercial input rather than descriptions of the running system:

- `documentation/requirements/business/whatsapp_saas_summary.md`
- `documentation/requirements/business/vendor_pricing_calculation_requirements.md`
- `documentation/requirements/implementation/billing_implementation_plan.md`
- `documentation/shared/development/guides/vendor_dashboard_implementation_plan.md`
- `documentation/shared/development/guides/vendor_dashboard_plan_analysis.md`
- `documentation/shared/development/guides/vendor_dashboard_production_readiness_assessment.md`
