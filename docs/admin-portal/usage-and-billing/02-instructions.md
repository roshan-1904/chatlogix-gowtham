# Money and usage — operating instructions

Operational runbook for staff; API sequences for engineers. Wallet figures: **millirupees**. Order money is **not** on this page.

Authority: [BILLING_AND_PRICING.md](../../BILLING_AND_PRICING.md) — debits via `chargeVendor`; credits via top-up/trial paths only.

---

## Scenario 1 — Founder weekly review

**Preconditions:** Admin login; date range last 7 days IST.

**Steps**

1. Open `/usage`; select "Last 7 days".
2. Read **Charged to shops** — sum `CreditUsage.chargedMilli` / 1000 → rupees display.
3. Read **OpenAI cost** — sum `metadata.aiCostMilli` on `WalletTransaction` where `transactionType = deduction` and date in range.
4. Read **Trial credit granted** — sum `amountMilli` where `transactionType = recharge` and `metadata.source = trial_grant`.
5. Scan source table — if `catalog_import` spikes, open top shop row → `/usage/:vendorId`.
6. Open Meta card — conversation count from `Conversation.createdAt` in range; confirm "Charged to shops for Meta: ₹0.00".

**Postconditions:** None persisted.

**Rollback:** N/A (read-only).

**Notify:** If OpenAI line "Incomplete", ping engineering — missing metadata on old debits.

---

## Scenario 2 — Vendor disputes ₹0.39 charge

**Preconditions:** Shop id known; vendor cites a reply on 13 Oct.

**Steps**

1. `/usage/:vendorId`; custom range 13 Oct only (≤31 days).
2. Select day row; charge list shows `conversation_turn` rows.
3. Match time to vendor report; show charged ₹0.39 from `chargedMilli = 390` (example).
4. OpenAI column from ledger metadata — e.g. ₹0.26 before markup; explain gap = markup 50% + ceil rounding per BILLING §2 worked example.
5. If goodwill warranted → Vendors recharge runbook (not Usage).

**Error matrix**

| User sees | Cause |
|---|---|
| "No charges in this range" | No `CreditUsage` rows |
| OpenAI "—" | Missing `aiCostMilli` on that debit |
| Wrong total | Client used paise formatter — bug |

---

## Scenario 3 — Change trial grant for **new** signups

**Preconditions:** Founder decision; not retroactive.

**Steps**

1. Link from Usage → `/billing`.
2. Edit Trial grant (rupees); Save → `PATCH /api/admin/settings` with `trialGrantPaise`.
3. Read hint: existing shops keep `trialGrantedMilli`.

**Postconditions:** `PlatformSettings.updatedBy` set; audit `settings_changed` (**proposed**).

---

## 1. Usage by shop and day

**Staff:** `/usage` — range: last 7 days | this month | custom (max 31 days).

**System (**proposed** `GET /api/admin/usage`):**

```sql
-- conceptual
SELECT vendor_id, date_trunc('day', usage_date AT TIME ZONE 'Asia/Kolkata') AS day,
       SUM(charged_milli), COUNT(*)
FROM "CreditUsage"
WHERE usage_date BETWEEN :from AND :to
GROUP BY 1, 2;
```

Use index `idx_creditusage_vendor_date`. Join `Vendor.businessName`.

**Pagination:** shop table page size **25**; sort charged DESC default.

**Do not** call `GET /api/usage`.

---

## 2. Split by charge source

Group `CreditUsage.source` → staff labels (overview table). Unknown sources: show raw string.

| Staff label | Sources |
|---|---|
| Customer replies | `conversation_turn`, `legacy_conversation_turn` |
| Product media | `outbound_media` |
| Catalog import | `catalog_import` |
| Catalog enhancer | `catalog_enhance`, `catalog_enhance_transcribe` |
| Sandbox | `sandbox_chat`, `sandbox_transcribe` |

---

## 3. One shop drill-in

**Route:** `/usage/:vendorId?from=&to=`

**Parallel loads:**

1. Aggregates filtered `vendorId`.
2. Deduction ledger sum `aiCostMilli`.
3. Optional: reuse `GET /api/vendors/:id/dashboard-stats` for cross-check on fixed windows only — arbitrary range needs admin usage endpoint.

**Day list:** group by IST day; default select first day in range.

**Charge list (selected day):** max **100** rows; columns time, source label, charged, OpenAI; `usageDate` sort DESC.

**Link:** shop name → `/vendors/:vendorId`.

---

## 4. Platform money totals

| Line | Computation |
|---|---|
| Charged to shops | `SUM(CreditUsage.chargedMilli)` |
| OpenAI cost | `SUM(metadata.aiCostMilli)` deductions in range |
| Trial credit granted | `SUM(amountMilli)` trial_grant recharges |
| Other money added (**optional 4th line**) | `admin_recharge`, `wallet_topup` recharges |

Remaining wallet: Vendors panel only.

---

## 5. Meta cost we absorb

**Data today:** `COUNT(Conversation)` in range.

**Not stored:** Meta invoice; `whatsappCostMilli` always 0 on charges.

**Proposed:** `PlatformSettings.metaConversationEstimatePaise` (name TBD) edited on **Billing** only — Usage multiplies count × rate, label "Estimate we absorb. Not charged to shops."

Until then: count + fixed copy from UI plan.

---

## 6. Billing settings (existing)

**Staff:** `/billing` only.

| Section | PlatformSettings fields (paise) |
|---|---|
| USD/INR | `usdToInrOverride`, refresh writes `usdToInrRate`, `usdToInrFetchedAt` |
| Platform fees | `platformFeePerTurnPaise`, `platformFeeOutboundMediaPaise` |
| Trial | `trialGrantPaise`, `trialExpiryDays` |
| Catalog caps | `catalogImportDailyPaiseCap`, `catalogEnhanceDailyPaiseCap` |
| Top-up | `minWalletTopUpPaise`, `maxWalletTopUpPaise`, `walletTopUpPresetsPaise`, `mockWalletTopUpEnabled` |

**API**

- `GET /api/admin/settings` — admin
- `PATCH /api/admin/settings` — body partial paise ints
- `POST /api/admin/settings/refresh-fx` — Frankfurter; 502 on failure

Signup path: `vendorSignupService` reads settings → `paiseToMilli(trialGrantPaise)` → wallet.

---

## Engineer API sequence — platform usage (proposed)

1. `GET /api/admin/usage?from=ISO&to=ISO` — validate range ≤31d, `requireRole('admin')`.
2. Response shape:

```json
{
  "from": "...",
  "to": "...",
  "totals": {
    "chargedMilli": 0,
    "openAiCostMilli": 0,
    "trialGrantedMilli": 0,
    "otherCreditsMilli": 0
  },
  "bySource": [{ "source": "conversation_turn", "chargedMilli": 0, "count": 0 }],
  "byVendor": [{ "vendorId": "", "businessName": "", "chargedMilli": 0, "count": 0, "topSource": "" }],
  "meta": { "conversationCount": 0, "chargedToVendorsForMetaMilli": 0 }
}
```

3. `GET /api/admin/usage/:vendorId?from&to` — adds `byDay`, `charges` for one day `?day=`.

**Idempotency:** read-only.

---

## Edge cases

| Case | Behavior |
|---|---|
| Range >31d | Block query; user message |
| Zero charges | ₹0.00 totals; empty shop table |
| FX refresh fail | Rate unchanged; Controls may alert stale |
| `mockWalletTopUpEnabled` | Document on Billing — vendors can self-serve test top-up |

---

## Must not

- Add Meta to `chargedMilli`.
- Duplicate settings page.
- Use `formatPaiseAsRupees` on `chargedMilli`.
- Recompute historical charges when markup changes.
