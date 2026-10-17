# Controls — UI plan

**Sidebar:** insert **Controls** after Support, before Billing. Remove **Logs** when Reliability ships.

**Header:** `Header.tsx` Notifications → `/controls/alerts` + open alert count (hide badge while loading; never fake 0).

**Phase 1:** Audit (`StaffAuditLog`), **computed** alerts (deep links only — no acknowledge/resolve), trials, look-inside, templates copy. **Phase 2:** persisted `StaffAlert` + dismiss/snooze UI; audit export; alert email hook (**proposed**).

---

## Routes

| Screen | Route |
|---|---|
| Audit (default) | `/controls`, `/controls/audit` |
| Alerts | `/controls/alerts` |
| Trials | `/controls/trials` |
| Look inside | `/vendors/:vendorId/shop` |
| Templates | `/templates` |

Subnav under Controls title: `[ Audit ] [ Alerts ] [ Trials ]` — active `bg-primary-50`.

---

## Audit (`/controls`)

**User goal:** Answer "who changed money or settings?"

```
Controls
[ Audit ] [ Alerts ] [ Trials ]

Shop [ search ]   Action [ All ▼ ]

Time        Who          Action              Shop         Summary
17 Oct 9:01  +91…        wallet_credited     Annapoorna   Credited ₹50.00. Reason: …
17 Oct 8:55  +91…        markup_changed      Annapoorna   Markup set to 60%.
17 Oct 8:00  +91…        settings_changed    Platform     Billing settings saved.
```

| Column | Source |
|---|---|
| Time | `StaffAuditLog.createdAt` |
| Who | actor id / phone from JWT |
| Action | `action` |
| Shop | `Vendor.businessName` or "Platform" |
| Summary | `summary` |

**Filters:** shop, action enum. **Page size:** 50. **Sort:** time DESC.

**States:** loading, empty, filter empty, error — copy in prior spec.

**Narrow:** card per row.

**A11y:** table `caption` "Staff audit log".

---

## Alerts (`/controls/alerts`)

**Phase 1 (computed):** List current evaluator matches on load; **no** status filter or persisted rows. Primary action is **Open shop** / Reliability / Billing link per type ([02-instructions.md](./02-instructions.md) §2).

```
Controls > Alerts

┌ Low wallet ──────────────────────────────────────────────┐
│ Annapoorna — Balance is ₹19.00 (evaluated now)         │
│ Open shop →                                              │
└──────────────────────────────────────────────────────────┘
```

**Phase 2 (`StaffAlert` stored):** Filter `[ Open ▼ ]`; Acknowledge / Resolve; badge by `status` (`open` warning, `acknowledged` info, `resolved` success).

---

## Trials (`/controls/trials`)

```
Filter [ Next 7 days ▼ ]

Shop           Reg status    Grant     Balance    Expires
Annapoorna     onboarding    ₹50.00    ₹32.10     20 Oct 2026
Grey caption under row (one of three instruction sentences)

Change the grant for new shops → /billing
```

| Column | Fields |
|---|---|
| Shop | link `/vendors/:id` |
| Status | `registrationStatus` |
| Grant | `trialGrantedMilli` |
| Balance | `walletBalanceMilli` |
| Expires | `trialExpiresAt` |

---

## Look inside (`/vendors/:vendorId/shop`)

**User goal:** Verify catalog/orders without vendor login.

```
← Annapoorna
Read only. You are signed in as staff, not as this shop.

[ Catalog ] [ Orders ] [ Questions ]     ?tab=

Name              Price      Active   In stock
1kg tin           ₹50.00     Yes      Yes
```

**Catalog columns:** `Product.name`, `basePrice`, `isActive`, `inStock`.

**Orders:** `orderNumber`, `status`, `totalAmount`, `createdAt`.

**Questions:** `questionEn`, `category`, `hitCount`, `lastSeenAt`.

**Entry button** on Vendors identity card: `Button` `secondary` `sm` "View catalog and orders".

**Tab switch:** updates `?tab=`; audit `shop_viewed` per tab.

**Responsive:** tabs wrap; table → cards with price visible.

---

## Templates (`/templates`)

Single `Card`:

**Title:** Templates

**Body:** "Template tools are not built. We have not decided whether this means WhatsApp template messages, saved replies, or something else. The vendor portal has the same open question."

Link: Dashboard. No load state.

---

## Final sidebar

```
Dashboard
Vendors
Usage
Reliability
Support
Controls
Billing
Templates
```
