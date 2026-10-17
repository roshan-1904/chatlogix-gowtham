# Vendors — UI plan

Extend `frontend_v2/apps/web-admin`. Patterns: navy `#072349` titles, `@chatlogix/ui` `Card`/`Badge`/`Button`, `bg-primary-50` selection (`Vendors.tsx`), red error box, green success `#25D366` (Billing).

**Component reuse**

| Pattern | Source |
|---|---|
| Master-detail grid `lg:grid-cols-12` | `pages/Vendors.tsx` |
| Money display wallet | `formatWalletAmount` — `lib/money.ts` |
| Markup + preview | `components/vendors/MarkupEditor.tsx` |
| Feature flag | `components/vendors/TurnAuditToggle.tsx` |
| Ledger list | `components/vendors/VendorDetailPanel.tsx` |
| Settings form sections | `pages/Billing.tsx` (spacing only) |

**Phase 1 vs Phase 2**

| Phase 1 | Phase 2 |
|---|---|
| Dashboard live counts; status badge on list; recharge + reason; WhatsApp read card | Server-side vendor search/pagination; approve/reject when API ships; latest failure snippet from Reliability API |

---

## Routes and sidebar

| Screen | Route | Sidebar |
|---|---|---|
| Home counts | `/dashboard` | Dashboard (existing) |
| Shop list + detail | `/vendors`, `/vendors/:vendorId` | Vendors (existing) |

No new sidebar item. Deep links from Usage, Reliability, Support land on `/vendors/:vendorId`.

**Responsive:** below `lg`, stack detail under list; sidebar becomes horizontal wrap (`Layout.tsx`).

---

## Screen: Dashboard (`/dashboard`)

**User goal:** See business health in 10 seconds; jump to waiting shops.

**Entry:** Sidebar Dashboard; post-login default.

**Layout regions**

1. Title row — "Dashboard"
2. KPI grid — `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`
3. Optional footnote when auto-approve active

**Wireframe**

```
Dashboard
Loading shop counts…                    [loading only]

┌─────────────┐ ┌─────────────┐ ┌──────────────────┐ ┌─────────────┐
│ Shops       │ │ Approved    │ │ Order revenue    │ │ Waiting     │
│ 128         │ │ 96          │ │ ₹1,20,400.00     │ │ 4           │
│ all shops   │ │ approved    │ │ this month (IST) │ │ need decision│
└─────────────┘ └─────────────┘ └──────────────────┘ └─────────────┘
     │                                    │
     └──────────────┬─────────────────────┘
                    ▼
            /vendors?status=pending_approval  (Waiting card click)
```

**Table / card data sources**

| Card | Field / query |
|---|---|
| Shops | `COUNT(Vendor)` |
| Approved | `registrationStatus = 'approved'` |
| Order revenue | `SUM(Order.totalAmount)` month IST, not cancelled — **paise → `formatPaiseAsRupees`** |
| Waiting | `registrationStatus = 'pending_approval'` |

**Actions:** Waiting card → primary navigation (link styled as card).

**States**

| State | Copy |
|---|---|
| Loading | "Loading shop counts…" — do not show 0 |
| Error | "Could not load shop counts." + message in red box |
| Empty zeros | Allowed after load |
| Auto-approve note | Under Waiting: "New shops are approved automatically until review is turned on." |

**A11y:** Each card `aria-label` includes metric name and value; Waiting card is `role="link"` if clickable.

---

## Screen: Vendors list + detail

**User goal:** Find shop, adjust markup, credit wallet, fix WhatsApp mapping.

**Entry:** Sidebar; links from other modules with `:vendorId`.

**Layout (wide)**

```
Vendors                                                   
Search [ shop, phone, email          ]  Status [ All ▼ ]

┌─ list 4/12 ─────────────┐  ┌─ detail 8/12 ─────────────────────────────┐
│ Name          ₹wallet   │  │ Business name          [Reg] [Sub status] │
│ phone    markup%        │  │ phone · email · category                  │
│ [badge]                 │  │ ── Wallet / Markup / Trial (read-only) ── │
│ ...                     │  │ MarkupEditor │ TurnAuditToggle              │
└─────────────────────────┘  │ Onboarding card (conditional)              │
                             │ WhatsApp card │ Recharge card │ Ledger     │
                             └────────────────────────────────────────────┘
```

**List columns**

| Column | Source | Sort default |
|---|---|---|
| Shop name | `businessName` | A–Z client |
| Contact | `phone` or `email` | — |
| Wallet | `walletBalanceMilli` | — |
| Markup | `markupPercent` | — |
| Status badge | `registrationStatus` **proposed on API** | Filter, not sort |

**Filters:** search (existing); status select — values `all`, `onboarding`, `pending_approval`, `approved`, `rejected`. Default `all`. Sync to URL `?status=` for Dashboard deep link.

**Pagination:** none phase 1; phase 2 server `limit=50` + cursor.

**Detail regions**

| # | Region | Actions |
|---|---|---|
| 1 | Identity | Read-only; link "View catalog and orders" → Controls `/vendors/:id/shop` |
| 2 | Wallet / markup figures | — |
| 3 | MarkupEditor | Primary Save |
| 4 | TurnAuditToggle | Save; destructive warning in copy |
| 5 | Onboarding | Approve (primary), Reject (opens reason, destructive) — only `pending_approval` / show reason if `rejected` |
| 6 | WhatsApp | Per `WhatsAppNumber` row; secondary "Map number" |
| 7 | Recharge | Rupees + reason; primary "Add money" → confirm dialog |
| 8 | Ledger | Last 50 `WalletTransaction` |

**Ledger row columns (display)**

| Show | Source |
|---|---|
| Label | `transactionType` + `metadata.source` |
| Amount | `amountMilli` signed display |
| Balance after | `balanceAfterMilli` |
| Reason | `metadata.reason` **proposed** |
| Time | `transactionDate` |

**Primary / secondary / destructive**

| Action | Variant |
|---|---|
| Save markup | primary |
| Map WhatsApp | secondary |
| Approve shop | primary |
| Reject | destructive after reason |
| Add wallet money | primary in confirm |

**Confirm dialogs**

- Wallet: "Add ₹50.00 to {shop}? Reason: …"
- Approve: "Approve this shop? They will leave the waiting list."
- Map move: "This number id is on {other}. Move it here?" — primary only on second step.

**Empty / error copy** — retain existing Vendors strings; add WhatsApp empty, recharge errors as in prior spec.

**Narrow:** full-width list; detail stacks; dialogs centered modal.

**A11y:** Search `label` "Search shops"; status `label` "Registration status"; recharge amount `inputMode="decimal"`.

---

## Screen: Vendor not found

Route `/vendors/:badId` — list loads; detail shows "Could not load this shop." with link to list.

---

## Integration hooks (other modules)

| From | UI element |
|---|---|
| Usage | Shop title link → `/vendors/:id` |
| Reliability | "Open shop" → same |
| Support | "Adjust wallet" → same + scroll to recharge **proposed** `#wallet` hash |
