# Vendor portal completion roadmap (P0–P3)

**Status:** Planning — no code written for these items yet.
**Audience:** Vendor portal frontend, backend API, product
**App:** `frontend_v2/apps/web-vendor` (React 18 + Vite + Tailwind, Turborepo)
**API:** Express on PM2 (`chatlogix-backend`), routes in `backend/src/routes/`
**Audit baseline:** commit `e1ee00e` (2026-09-14), audited by walking every route in `src/App.tsx` against its page component and the backend endpoint it calls.

---

## Table of contents

1. [Purpose](#1-purpose)
2. [Current route inventory](#2-current-route-inventory)
3. [What the priorities mean](#3-what-the-priorities-mean)
4. [P0 — Navigation honesty](#4-p0--navigation-honesty)
5. [P1 — Order operations](#5-p1--order-operations)
6. [P2 — Conversations and dashboard polish](#6-p2--conversations-and-dashboard-polish)
7. [P3 — Self-serve wallet recharge](#7-p3--self-serve-wallet-recharge)
8. [Cross-cutting conventions](#8-cross-cutting-conventions)
9. [Sequencing and dependencies](#9-sequencing-and-dependencies)
10. [Acceptance checklist](#10-acceptance-checklist)
11. [Related code and docs](#11-related-code-and-docs)

---

## 1. Purpose

The vendor portal is the surface where a vendor supervises what the WhatsApp AI is doing on their behalf: catalog, FAQs, knowledge gaps, conversations, orders, and the wallet that pays for AI replies.

Most of that is built. What is left falls into two shapes:

- **Dead navigation.** Three sidebar entries (`Templates`, `Billing`, `Support`) have no route, so clicking them renders a bare `404 - Page Not Found` string inside the app shell. A vendor who clicks `Billing` to find out why their AI stopped replying gets a dead end.
- **Buttons in front of 501 endpoints.** Order payment links and shipping are fully drawn in the UI but the backend returns `501 Not implemented`, so the frontend intercepts the click and shows `window.alert('This action is not available yet.')`.

This document specifies the work to close both, in priority order, with the API contracts each item needs.

---

## 2. Current route inventory

Registered routes live in `frontend_v2/apps/web-vendor/src/App.tsx`. Sidebar entries live in `src/components/layout/Sidebar.tsx:4-15`.

| Area | Route | Sidebar | State |
|---|---|---|---|
| Login / Signup | `/login`, `/signup` | — | Complete — phone OTP, Firebase reCAPTCHA, status-based redirect |
| Onboarding | `/onboarding/*` | — | Complete — welcome → catalog → clarify → confirm → AI setup → demo chat → review → submitted/rejected |
| Dashboard | `/dashboard` | ✅ | Complete except custom date range ([P2.3](#63-p23--custom-date-range-picker)) |
| Conversations | `/conversations` | ✅ | Complete except vendor notes / quick replies ([P2.1](#61-p21--vendor-notes), [P2.2](#62-p22--quick-replies)) |
| Queries | `/queries`, `/queries/:id` | ✅ | Complete — Customer Queries v1, see `docs/CUSTOMER_QUERIES.md` |
| Catalog | `/catalog`, `/catalog/new`, `/catalog/:id/edit` | ✅ | Complete |
| Catalog import | `/catalog/import`, `/import/photo`, `/import/template`, `/import/:jobId/go-live` | — | Complete, gated by `catalogImportEnabled` |
| FAQs | `/faqs`, `/faqs/new`, `/faqs/:id/edit` | ✅ | Complete |
| Orders | `/orders`, `/orders/:orderId` | ✅ | Partial — status workflow works, payment and shipping are stubs ([P1](#5-p1--order-operations)) |
| Settings | `/settings` | ✅ | Complete — 5 tabs, all wired to `/api/vendors/:id/*` |
| **Templates** | `/templates` | ✅ | **No route** → 404 ([P0.3](#43-p03--templates-decide-before-building)) |
| **Billing** | `/billing` | ✅ | **No route** → 404 ([P0.1](#41-p01--billing-page)) |
| **Support** | `/support` | ✅ | **No route** → 404 ([P0.2](#42-p02--support-page)) |

Two more links point at the wrong place today:

- `src/components/dashboard/QuickActionsPanel.tsx:36-39` — the low-balance **Recharge Credits** button calls `alert('Recharge page coming soon')`.
- `src/pages/CatalogImportGoLive.tsx:44-50` — the go-live checklist item labelled **"Open billing"** navigates to `/settings`.

---

## 3. What the priorities mean

| Priority | Definition | Ships what |
|---|---|---|
| **P0** | The portal lies to the vendor. Frontend-only or near-frontend-only fixes. | Every nav item leads somewhere real |
| **P1** | A drawn feature is blocked by a missing backend endpoint. | Orders become operationally complete |
| **P2** | Feature works but the experience is rough or incomplete. | Polish, consistency, small additions |
| **P3** | Needs a product decision or third-party integration. | Self-serve money movement |

**Definition of done for every item below:** route registered, page renders loading / empty / error / populated states, no `window.alert` for expected flows, `npm run type-check` and `npm run lint` clean in `frontend_v2`, and the sidebar entry resolves.

---

## 4. P0 — Navigation honesty

### 4.1 P0.1 — Billing page

**Problem.** Wallet balance drives whether the AI replies at all. The vendor has no page to see the balance, what consumed it, or how to top up. `Billing` in the sidebar 404s, and the dashboard's low-balance CTA is an `alert`.

**Evidence.**
- `src/components/layout/Sidebar.tsx:13` — `{ name: 'Billing', href: '/billing', icon: '💳' }`
- `src/App.tsx:111` — unmatched paths render `<div>404 - Page Not Found</div>`
- `src/components/dashboard/QuickActionsPanel.tsx:36-39` — `alert('Recharge page coming soon')`

**Backend that already exists.**

| Endpoint | Returns | Notes |
|---|---|---|
| `GET /api/vendors/:id/config` | `walletBalance` (paise), plan, status | `backend/src/routes/vendors.ts:131-178` |
| `GET /api/vendors/:id/usage-analytics` | `creditsUsed` total | `vendors.ts:118-129`, aggregate over `CreditUsage` |
| `GET /api/vendors/:id/dashboard-stats` | `credits` block (balance, used this month, low-balance warning, cycle dates) | `vendors.ts:753-758`, shape in `src/types/dashboard.ts:49-69` |
| `GET /api/vendors/me/trial-wallet` | `balancePaise`, `grantedPaise`, `expiresAt`, `breakdown[]` by source | `vendorOnboarding.ts:321-326` → `billingService.getTrialWalletSummary` (`billingService.ts:185-250`). Mounted under `/api/vendors`, vendor role. |
| `POST /api/vendors/:id/recharge-wallet` | new balance | `vendors.ts:188-208` — **`requireRole('admin')`**, not callable by a vendor. See [P3](#7-p3--self-serve-wallet-recharge). |

**Backend to add.** One endpoint, for transaction history:

```
GET /api/vendors/:id/wallet-transactions?limit=50&cursor=<id>
  auth: requireVendorAccess(req => req.params.id)
  200: {
    transactions: [{
      id, transactionType, amountPaise, balanceBeforePaise,
      balanceAfterPaise, transactionDate, source, label
    }],
    nextCursor: string | null
  }
```

Source data is the `WalletTransaction` model (`backend/prisma/schema.prisma:224-237`), already indexed on `[vendorId, transactionDate desc]`. Derive `source`/`label` from `metadata.source` with the same mapping `billingService.ts` uses for the trial breakdown (`labelForSource`), so the same vocabulary appears in onboarding and billing.

**UI spec — `src/pages/Billing.tsx`.**

1. **Balance card.** Current balance from `/config`, low-balance warning styling when `dashboard-stats.credits.lowBalanceWarning` is set. Trial vendors additionally get granted amount and `expiresAt` from `/me/trial-wallet` (reuse `src/components/onboarding/TrialWalletBar.tsx`).
2. **Usage breakdown.** The `breakdown[]` from `/me/trial-wallet` (sandbox chat, voice, transcription, catalog import), plus credits consumed this month from dashboard stats.
3. **Transaction history.** Table from the new endpoint: date, type, source label, amount, resulting balance. Paginated by cursor. Empty state: "No wallet activity yet."
4. **Top-up panel.** Until [P3](#7-p3--self-serve-wallet-recharge) lands, this is copy plus the support CTA from [P0.2](#42-p02--support-page), not a payment form. Do not render a disabled "Recharge" button with no explanation.

**Wire-ups in the same change.**
- `QuickActionsPanel.tsx:36-39` → `navigate('/billing')`, drop the `alert`.
- `CatalogImportGoLive.tsx:44-50` → `to="/billing"` so the label matches the destination.
- `src/lib/seo.ts` → add the `/billing` title/meta entry alongside the existing routes.

**Acceptance criteria.**
- `/billing` renders for an approved vendor and shows a balance that matches the dashboard credits card.
- All money is formatted through `src/utils/currency.ts` `formatAmountWithSymbol` (paise in, symbol out) — no ad-hoc `/100`.
- Transaction list paginates and survives an empty history.
- No sidebar item, dashboard CTA, or go-live checklist row points at a 404.

**Effort.** ~1 day frontend, ~2 hours backend. **Depends on:** nothing.

---

### 4.2 P0.2 — Support page

**Problem.** `Support` 404s. The support contact already exists in the codebase but only inside the onboarding funnel, so an approved vendor cannot reach it.

**Evidence.**
- `src/components/layout/Sidebar.tsx:14`
- `src/components/onboarding/NeedHelpFooter.tsx:10-26` — `supportLink()` resolves `VITE_SUPPORT_WHATSAPP` → `VITE_SUPPORT_EMAIL` → `https://chatlogix.in`
- `src/pages/onboarding/OnboardingRejected.tsx:10-16` — same resolution, duplicated

**Scope.** Frontend only. No new backend.

**UI spec — `src/pages/Support.tsx`.**

1. **Contact card.** WhatsApp deep link and mailto, from the same env resolution. Extract the duplicated `supportHref()` / `supportLink()` logic into one helper (`src/lib/support.ts`) and have all three call sites use it.
2. **Self-serve section.** Links into the portal for the questions support actually receives: "AI replied something wrong" → `/queries`, "product details are wrong" → `/catalog`, "customers ask something we never answered" → `/faqs`, "AI stopped replying" → `/billing`.
3. **Diagnostics block.** Vendor ID, business name, plan, app version (`Footer.tsx` already renders `Version 0.1.0`) with a copy button, so a vendor can paste identifying context into a support chat.

Env vars are already documented in `frontend_v2/apps/web-vendor/.env.example:14-20`; no new configuration.

**Acceptance criteria.**
- `/support` renders with no env vars set (falls back to `https://chatlogix.in`) and with each var set.
- One shared helper resolves the support target; `NeedHelpFooter` and `OnboardingRejected` no longer carry their own copies.

**Effort.** ~half a day. **Depends on:** P0.1 only for the `/billing` cross-link.

---

### 4.3 P0.3 — Templates: decide before building

**Problem.** `Templates` 404s, and unlike Billing and Support the product meaning is ambiguous. `web-admin` has the same nav item stubbed as `<div>Templates (Coming Soon)</div>` (`apps/web-admin/src/App.tsx:23`).

**What "templates" could mean here, given the code.**

| Interpretation | Backing code today | Verdict |
|---|---|---|
| Outbound order-notification messages | `backend/src/services/whatsappTemplateService.ts` — `sendOrderStatusUpdate` (:253), `sendPaymentLink` (:346), `sendShippingUpdate` (:422); copy hardcoded in `formatOrderStatusMessage` (:51-100); history rows in `NotificationHistory` | **Recommended.** Real vendor value: they can see and edit what ChatLogix sends their customers. |
| Meta-approved WhatsApp message templates (HSM) | None. The service queues plain `type: 'text'` messages to `RESPONSE_QUEUE_URL`, despite the name. | Large scope: Graph API template CRUD, approval states, per-WABA sync. Not now. |
| Catalog import starter templates | `src/pages/CatalogImportTemplate.tsx` | Already exists, lives under Catalog. Do not duplicate in nav. |

**Recommendation.** Ship **notification templates** as a read-first page, or hide the nav item until it is built. Do not leave it 404ing.

**Phase 1 (read-only, ~1 day total).**

```
GET /api/vendors/:id/notification-templates
  200: { templates: [{ key, label, trigger, preview, editable: false }] }
```

Built by rendering `whatsappTemplateService`'s existing formatters against a sample order, so the preview cannot drift from what is actually sent. Pair it with a "Recently sent" list from `NotificationHistory` (`schema.prisma:347-369`, already indexed on `[vendorId, createdAt]`):

```
GET /api/vendors/:id/notifications?limit=50&cursor=<id>
  200: { notifications: [{ id, notificationType, templateName, status, orderId, sentAt, errorMessage }], nextCursor }
```

**Phase 2 (editable, separate effort).** Requires a `VendorNotificationTemplate` table, variable substitution with validation (`{{orderNumber}}`, `{{totalAmount}}`, `{{estimatedDelivery}}`), a fallback to the built-in copy, and an English-only gate consistent with `backend/src/utils/vendorEnglish.ts`. Specify separately before building.

**Acceptance criteria (phase 1).**
- `/templates` lists every notification ChatLogix can send, with accurate preview text and the status change that triggers it.
- Delivery history shows `failed` rows with their error, since that is the support question this page answers.
- If the decision is to defer instead, the nav entry is removed in the same change — not left dangling.

**Effort.** ~1 day for phase 1. **Depends on:** a product decision.

---

### 4.4 P0.4 — Real not-found page and nav gating

**Problem.** `src/App.tsx:111` renders an unstyled string with no way back. It sits inside `<Layout>`, so the vendor sees the shell with a bare sentence in the content area.

**Scope.**

1. **`src/pages/NotFound.tsx`** — heading, explanation, primary action back to `/dashboard`, secondary link to `/support`. Use `@chatlogix/ui` `Button` and `Card` and existing design tokens (navy `primary-500` `#072349`, green `secondary-500` `#25D366`) per `.cursor/rules/21st-mcp-design.mdc`.
2. **Sidebar gating.** Give each nav entry an optional `enabled` flag so an unbuilt destination is either hidden or rendered as a non-clickable "Coming soon" row. This prevents the current class of bug from recurring when nav is added ahead of a route.
3. **Add a route test.** A small test that asserts every `href` in `navigation` matches a registered route in `App.tsx` turns "dead nav" into a CI failure rather than a manual discovery.

**Acceptance criteria.**
- Navigating to `/nonsense` shows the styled page with a working way back.
- No sidebar entry both looks clickable and leads to the not-found page.

**Effort.** ~half a day.

---

## 5. P1 — Order operations

### 5.1 P1.1 — Payment links

**Problem.** `OrderDetails` renders **Generate Payment Link**, a link modal with copy and send actions, and a QR placeholder — in front of an endpoint that returns 501. The order list blocks the same action with an alert.

**Evidence.**
- `backend/src/routes/orders.ts:181-205` — `POST /api/orders/:id/payment-link` → `res.status(501).json({ error: 'Not implemented' })`
- `backend/src/routes/payments.ts:19-21` — `GET /api/payment-links/:linkId/status` → 501
- `src/services/paymentLinks.ts:54-58` — translates 501 into "not yet available. Please contact support."
- `src/pages/Orders.tsx:288-301` — `NOT_YET_AVAILABLE_ACTIONS` blocks `send_payment_link`, `create_shipment`, `track`, `view_invoice` with `window.alert`
- `src/pages/OrderDetails.tsx:381-391` — **Send via WhatsApp** is a `console.log` TODO
- `src/components/orders/modals/PaymentLinkModal.tsx:150-154` — "QR Code Placeholder / QR code generation coming soon"

**What is already in place.** `whatsappTemplateService.sendPaymentLink()` (`whatsappTemplateService.ts:346-400`) formats the customer message, writes a `NotificationHistory` row with `notificationType: 'payment_link'`, and publishes to `RESPONSE_QUEUE_URL` for `chatlogix-whatsapp-response-dispatcher`. **The delivery half is done; only link generation is missing.**

**Backend work.**

1. Pick the gateway (Razorpay is the natural fit for UPI-first Indian vendors) and add credentials to `backend/src/config/env.ts` with validation.
2. Implement `POST /api/orders/:id/payment-link`: create the gateway link for `order.totalAmount` (paise — do not convert), persist link id / URL / expiry against the order, return `{ paymentLink, linkId, expiresAt }`.
3. Implement `GET /api/payment-links/:linkId/status` reading persisted state.
4. Implement `POST /api/payments/webhook` with **signature verification**, updating payment status idempotently keyed on the gateway event id.
5. Add `POST /api/orders/:id/payment-link/send` that calls the existing `sendPaymentLink()`.

Storing link state needs a schema decision: columns on `Order` versus a `PaymentLink` model. A separate model is preferable because a single order can legitimately produce several links (expiry, amount correction).

**Frontend work.**
- Remove `send_payment_link` from `NOT_YET_AVAILABLE_ACTIONS` once the endpoints exist.
- Replace `OrderDetails.tsx:381-391`'s `console.log` with the send call, toast on success, error toast on failure.
- Drive `paymentStatus` from server state instead of the `useState` initialised to `'pending'` at `OrderDetails.tsx:29`, which never updates.
- Either render a real QR (encode the payment URL client-side) or delete the placeholder block — do not ship a box that says "Placeholder".

**Acceptance criteria.** Generate → link persists and survives reload; send → customer receives the WhatsApp message and a `NotificationHistory` row exists; webhook flips status to paid; a replayed webhook changes nothing.

**Effort.** ~3–4 days including gateway setup. **Depends on:** gateway account and credentials.

---

### 5.2 P1.2 — Shipping

**Problem.** `ShippingModal` collects weight and dimensions for an endpoint that returns 501. Every shipping route is a stub.

**Evidence.** `backend/src/routes/shipping.ts:19-43` — all four endpoints 501: create shipment, rates, label, track. `src/services/shipping.ts:55-166` maps each to a "not yet available" message. Frontend state (`OrderDetails.tsx:30-32`) is local-only.

**Decision needed first.** Shipping is only meaningful for vendors who ship; local delivery vendors (the current bakery/food profile) do not need it. Options: integrate an aggregator (Shiprocket, Delhivery), support manual tracking entry (vendor pastes courier + AWB, ChatLogix sends the update via the existing `sendShippingUpdate()` at `whatsappTemplateService.ts:422`), or hide shipping for vendors whose category does not ship.

**Manual tracking is the cheap 80%:** it needs one endpoint plus a `Shipment` record and reuses the notification path that already exists.

**Interim behaviour (do this even if shipping is deferred).** Replace `window.alert('This action is not available yet.')` with a disabled control and a tooltip explaining why, and stop opening a modal whose submit cannot succeed.

**Effort.** ~1 day manual tracking, ~1 week aggregator integration.

---

### 5.3 P1.3 — Order items link to catalog

**Problem.** Each order line is a `<button disabled title="Product management coming soon">`, so the vendor cannot jump from an order to the product the AI matched.

**Evidence.** `src/pages/OrderDetails.tsx:216-222`. The data is partly there: `OrderItem` carries optional `productId` and `matchedProductId` (`src/components/conversations/types.ts:153-162`), and `Order` carries `productIds` / `productMapping` (:192-193).

**Scope.** Frontend, plus verification that the cart engine persists the matched product id.

1. Confirm `backend/src/conversation/` writes `matchedProductId` (or equivalent) into the stored order items; `parseOrderItems` (`src/utils/orderParsing.ts:51-63`) normalises the cart-engine shape today but does not preserve an id.
2. When an id exists, render a link to `/catalog/:id/edit`; when it does not, render plain text with no disabled button and no misleading tooltip.

**Acceptance criteria.** Items with a matched product navigate to that product; unmatched items look like text, not broken buttons.

**Effort.** ~half a day frontend, plus pipeline verification.

---

## 6. P2 — Conversations and dashboard polish

### 6.1 P2.1 — Vendor notes

**Problem.** `CustomerDetailsPanel.tsx:326-334` renders a dashed box captioned "Vendor Notes (coming soon)".

**Backend.** Needs storage. `CustomerInsights` already exists per customer/vendor; a vendor-authored note is editorially different from AI-extracted insight, so add a dedicated field or `CustomerNote` model rather than overloading insights.

```
GET  /api/vendors/:id/customer-notes?customerId=...
PUT  /api/vendors/:id/customer-notes    { customerId, note }
```

**Frontend.** Inline textarea in the existing section, debounced autosave, "Saved" indicator, optimistic update with rollback (the panel already uses that pattern for AI pause in `Conversations.tsx:131-158`).

**Decision to record in the spec:** whether notes are visible to the AI pipeline as prompt context. If yes, they become an English-only write path like FAQs (`backend/src/utils/vendorEnglish.ts`) and the UI must say so.

**Effort.** ~1 day.

---

### 6.2 P2.2 — Quick replies

**Problem.** `CustomerDetailsPanel.tsx:336-348` shows two hardcoded non-functional chips.

**Scope.** Vendor-defined canned messages inserted into the composer (`MessageInput.tsx`), not sent directly — the vendor should be able to edit before sending. Store per vendor (`GET`/`PUT /api/vendors/:id/quick-replies`), manage the list in Settings, insert from the conversation panel.

**Interaction note.** Sending goes through the existing `POST /api/conversations/:id/messages` path (`Conversations.tsx:160-181`), so no new send logic is needed.

**Effort.** ~1 day.

---

### 6.3 P2.3 — Custom date range picker

**Problem.** Selecting "Custom Range" shows a button that calls `alert('Custom date picker coming soon')`.

**Evidence.** `src/components/dashboard/DateRangeFilter.tsx:66-77`.

**Everything else is already wired.** `useDashboardStats` reads `startDate` / `endDate` from the URL and forwards them (`src/hooks/dashboard/useDashboardStats.ts:11-48`), and the backend validates the range, rejecting spans over a year (`backend/src/routes/vendors.ts:740-758`). This is purely the missing picker.

**Scope.** Two native `<input type="date">` fields — no new dependency — with client-side validation mirroring the backend (start ≤ end, ≤ 1 year, no future start), writing to the existing URL params so the range stays shareable and reload-safe.

**Effort.** ~half a day.

---

### 6.4 P2.4 — Consistency pass

| Issue | Where | Fix |
|---|---|---|
| `window.alert` for errors while the rest of the app uses toasts | `Products.tsx:112,123,136`, `Faqs.tsx:34`, `Orders.tsx:300,320` | `react-hot-toast` is already mounted in `App.tsx:38-64` |
| Emoji nav icons | `Sidebar.tsx:5-15` | Replace with the icon set used elsewhere in `@chatlogix/ui` |
| Empty gray circle as avatar | `Header.tsx:109,125,136` | Initials from `businessName`, which the header already fetches |
| English-only outside conversations | i18n exists only for `conversations.json` in `en`/`hi`/`ta` | Decide whether portal-wide i18n is in scope; if not, stop adding partial translations |

**Effort.** ~1 day combined.

---

## 7. P3 — Self-serve wallet recharge

**Problem.** A vendor cannot add money. `POST /api/vendors/:id/recharge-wallet` is `requireRole('admin')` (`backend/src/routes/vendors.ts:188-208`), so every top-up is a manual admin action. When the wallet empties, the AI stops replying and the vendor's only recovery path is contacting support.

**Why this is P3, not P0.** It needs the same payment gateway decision as [P1.1](#51-p11--payment-links), plus GST/invoicing treatment. Do P1.1 first and reuse that integration.

**Scope.**

1. `POST /api/vendors/:id/wallet/topup` (vendor-scoped) creating a gateway checkout for a chosen amount.
2. Webhook-driven credit: on verified success, run the existing `$transaction` pattern from `vendors.ts:196-206` — update `walletBalance` **and** write a `WalletTransaction` with `transactionType: 'recharge'` — keyed idempotently on the gateway payment id.
3. Receipts via `BillingHistory` (`schema.prisma:211-222`), which exists but is unused by any route today.
4. Auto-recharge threshold as an optional follow-on (`walletBalance < X` → charge saved method).

**Hard requirements.** Money moves only on a signature-verified webhook, never on a client callback. Every balance mutation is transactional with its ledger row. Replayed webhooks are no-ops.

**Effort.** ~1 week after P1.1. **Depends on:** gateway integration, tax/invoicing decision.

---

## 8. Cross-cutting conventions

Applies to every item above.

- **Money is paise.** `walletBalance`, `Order.totalAmount`, and `WalletTransaction.amount` are integer paise. Format with `src/utils/currency.ts`; never hand-roll `/100`. Note that `parseOrderItems` (`src/utils/orderParsing.ts`) normalises items to **rupees** for display — that boundary is deliberate, so do not "fix" it by mixing units.
- **Design tokens.** Navy `primary-500` `#072349`, WhatsApp green `secondary-500` `#25D366`. For new UI, follow `.cursor/rules/21st-mcp-design.mdc`: read `.21st/design.json` first, use 21st MCP for patterns, map onto `@chatlogix/design-tokens`. Do not paste a foreign theme's `:root` block into `src/index.css`.
- **Error handling.** Toast for user-facing failures, `getErrorMessage` from `src/utils/errorHandling.ts` for message extraction, and never a bare `alert`.
- **Auth.** Vendor-scoped endpoints use `requireVendorAccess(req => req.params.id)`; only genuinely administrative operations use `requireRole('admin')`.
- **Validation.** Zod on every new request body, mirroring the client-side rules.
- **Loading states.** Skeletons over spinners, matching `DashboardSkeleton` and `OnboardingSkeleton`.

---

## 9. Sequencing and dependencies

```
P0.1 Billing ──┬─> P0.2 Support (cross-links to /billing)
               └─> P3 Self-serve recharge (needs the Billing page to live on)
P0.3 Templates decision ──> Templates phase 1 (read-only) ──> phase 2 (editable)
P0.4 Not-found + nav gating   (independent, do with P0.1)

P1.1 Payment links ──> P3 Self-serve recharge (same gateway)
P1.2 Shipping         (independent; decide scope first)
P1.3 Order item links (independent; verify pipeline persists matched product id)

P2.*                  (all independent, any order)
```

**Suggested first sprint:** P0.1, P0.2, P0.4, P2.3, P2.4. All frontend or near-frontend, one small new endpoint, and it removes every dead link and `alert` from the portal.

---

## 10. Acceptance checklist

Portal-level, verifiable after the P0 sprint:

- [ ] Every `navigation` entry in `Sidebar.tsx` resolves to a registered route, or is explicitly marked unavailable.
- [ ] No `window.alert` remains on an expected user path (`rg "window\.alert|[^.]\balert\(" frontend_v2/apps/web-vendor/src` returns nothing outside tests).
- [ ] `/billing` balance equals the dashboard credits card for the same vendor.
- [ ] `/support` resolves a contact target with no env vars set.
- [ ] `/nonsense` renders the styled not-found page with a working way back.
- [ ] Dashboard custom range survives a reload (state lives in the URL).
- [ ] `npm run type-check` and `npm run lint` pass in `frontend_v2`.

---

## 11. Related code and docs

**Portal entry points**
- Routes: `frontend_v2/apps/web-vendor/src/App.tsx`
- Shell: `src/components/layout/{Layout,Header,Sidebar,Footer}.tsx`
- Route metadata: `src/lib/seo.ts`, `src/components/seo/VendorRouteMeta.tsx`

**Backend**
- Vendor endpoints: `backend/src/routes/vendors.ts`
- Trial wallet: `backend/src/routes/vendorOnboarding.ts` + `backend/src/services/billingService.ts`
- Stubs to implement: `backend/src/routes/payments.ts`, `backend/src/routes/shipping.ts`, `orders.ts:181-205`
- Outbound notifications: `backend/src/services/whatsappTemplateService.ts`
- Schema: `backend/prisma/schema.prisma` (`WalletTransaction`, `BillingHistory`, `CreditUsage`, `NotificationHistory`)

**Docs**
- Customer Queries (shipped portal feature): `docs/CUSTOMER_QUERIES.md`
- Catalog enhancer: `docs/VENDOR_CATALOG_ENHANCER.md`
- Design rule: `.cursor/rules/21st-mcp-design.mdc`, `.21st/DESIGN.md`
