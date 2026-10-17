# Money and usage — UI plan

**Sidebar change:** insert **Usage** after Vendors → `/usage`. **Billing** stays `/billing` — no merge.

Reuse: Billing `Card` sections, navy `text-[#072349]` headings, `Badge` for FX source, Vendors error/success patterns.

**Phase 1:** Platform + vendor usage pages, link to Billing. **Phase 2:** CSV export, margin % card, Meta rate field on Billing when schema adds it.

---

## Routes

| Screen | Route |
|---|---|
| Platform usage | `/usage` |
| Shop usage | `/usage/:vendorId` |
| Settings | `/billing` (existing) |

---

## Platform usage (`/usage`)

**User goal:** See if platform economics work for the selected period.

**Entry:** Sidebar Usage; no vendor picker here.

**Layout regions**

1. Title + subtitle
2. Range control
3. Three total cards (Charged, OpenAI, Trial)
4. Meta absorbed card
5. Source table
6. Shop table
7. Link to Billing

**Wireframe**

```
Usage
Wallet charges and what they cost us. Amounts are in rupees.

[ Last 7 days ▼ ]     or     [ Start date ] [ End date ]

┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│ Charged to shops│ │ OpenAI cost     │ │ Trial credit granted │
│ ₹12,400.00      │ │ ₹8,100.00       │ │ ₹2,500.00            │
└─────────────────┘ └─────────────────┘ └─────────────────────┘

┌─ Meta cost we absorb ─────────────────────────────────────────┐
│ 840 conversations in this range.                               │
│ Charged to shops for Meta: ₹0.00                               │
│ Meta's own bill is not stored. ChatLogix absorbs it.           │
└────────────────────────────────────────────────────────────────┘

Source breakdown                          [scroll → on narrow]
┌──────────────────────┬────────────┬─────────┐
│ Source               │ Charged    │ Charges │
│ Customer replies     │ ₹9,200.00  │ 4100    │
│ Catalog import       │ ₹2,100.00  │ 30      │
└──────────────────────┴────────────┴─────────┘

Shops (page 1 of n)                       sort: Charged ↓
┌──────────────────────┬────────────┬─────────┬──────────────┐
│ Shop                 │ Charged    │ Charges │ Top source   │
│ Annapoorna →         │ ₹840.00    │ 310     │ Customer …   │
└──────────────────────┴────────────┴─────────┴──────────────┘

Edit fees, trial grant, and the exchange rate.  →  /billing
```

**Columns — source table**

| Column | Data |
|---|---|
| Source | Mapped label from `CreditUsage.source` |
| Charged | `SUM(chargedMilli)` |
| Charges | `COUNT(*)` |

**Columns — shop table**

| Column | Data |
|---|---|
| Shop | `Vendor.businessName` link → `/usage/:vendorId?from&to` |
| Charged | aggregate |
| Charges | count |
| Top source | mode source in range |

**Filters:** range only. Default **Last 7 days**.

**Pagination:** 25 shops per page (**proposed** API `cursor`).

**Actions:** row shop name primary navigation; Billing link secondary text.

**States**

| State | Copy |
|---|---|
| Loading | "Loading usage…" |
| Empty | "No charges in this range." |
| Error | "Could not load usage." |
| Meta zero conv | "No conversations started in this range." |

**Responsive:** cards stack; tables `overflow-x-auto`.

**A11y:** range control `fieldset` + legend "Date range"; tables `caption` "Usage by shop".

---

## Shop usage (`/usage/:vendorId`)

**Wireframe**

```
← All shops
Annapoorna  (link → /vendors/:id)
[ range control ]

┌ Charged ────────┐  ┌ OpenAI cost ────────────────┐
│ ₹840.00         │  │ ₹560.00 before markup       │
└─────────────────┘  └─────────────────────────────┘

By source [table]
By day
  12 Oct  ₹40.00
  13 Oct  ₹12.50  ← selected

Charges on 13 Oct (max 100)
┌──────┬─────────────────┬─────────┬─────────┐
│ Time │ Source          │ Charged │ OpenAI  │
│10:14 │ Customer replies│ ₹0.39   │ ₹0.26   │
└──────┴─────────────────┴─────────┴─────────┘
```

**Default sort:** day descending; charges time descending.

**Missing shop:** "No shop has that id." + link `/usage`.

**OpenAI incomplete:** card subtitle + row "—".

---

## Billing (`/billing`) — copy additions only

Do not reorder sections. Add:

- Under **Trial grant:** "This changes the grant for shops that sign up after you save. Shops that already signed up keep the grant they received."
- Under **Platform fees:** "This is not Meta's WhatsApp fee. Meta's cost is on Usage, and we do not charge it to shops yet."

All other behavior unchanged (`pages/Billing.tsx`, `lib/settings.ts`).

---

## Component map

| UI | Package / file |
|---|---|
| Card, Button, Badge | `@chatlogix/ui` |
| Wallet format | `lib/money.ts` `formatWalletAmount` |
| Settings fetch | `lib/settings.ts` patterns |
