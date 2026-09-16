# Vendor Onboarding Workflow — Direct Meta API (Centralized Dashboard)

> Detailed step-by-step onboarding playbook for vendors to connect their WhatsApp number to our SaaS using Direct Meta Cloud API, with a centralized dashboard that automates 70%+ of the process.

---

## Table of Contents
1. Goals
2. User personas
3. High-level flow
4. Required documents & prerequisites
5. Dashboard UI flows (detailed screens)
6. Backend processes & API calls (sequence)
7. Automated verification tasks we can do for vendors
8. Human-assisted tasks and escalation
9. Error handling & user messaging
10. Security, privacy & compliance
11. Assisted onboarding & edge cases
12. SLA & timelines
13. Acceptance criteria & telemetry
14. Implementation tickets (epics & sample issues)
15. Sample email / SMS / WhatsApp templates

---

## 1. Goals
- Make Direct Meta Cloud API onboarding **frictionless** for small vendors.
- Automate all repeatable steps and surface only the minimal actions the vendor must take.
- Achieve **70%+ automated onboarding completion** without human ops.
- **Billing (locked):** ChatLogix is a **Meta Solution Partner** with its own **line of credit**. Vendors connect **their** WABA via Embedded Signup; we attach **our** credit line (`INR`) so Meta bills **ChatLogix** and vendors see **one ChatLogix wallet** (AI + WhatsApp, markup configurable per vendor in admin). The per-vendor markup shipped as `Vendor.markupPercent`; the WhatsApp half is **not billed yet** — see [BILLING_AND_PRICING.md](../../../../docs/BILLING_AND_PRICING.md) §7.
- Provide **assisted onboarding** (ops calls, doc help) when self-serve Meta steps fail — not dependency on a third-party BSP for billing.

---

## 2. User personas
- **Micro Seller (MS)**: home baker / tailor / craft seller. Limited tech literacy; may not have GST/PAN ready.
- **SMB Owner (SMB)**: small shop with GST, email, and basic digital literacy.
- **Operations Agent (Ops)**: internal staff who assist vendors for KYC & verification.
- **Admin (Platform)**: manages the dashboard, reviews verification events, and handles escalations.

---

## 3. High-level flow
1. Vendor completes ChatLogix signup and trial onboarding (see [public-signup-onboarding.md](../../features/vendor-onboarding/guides/public-signup-onboarding.md)); admin approves; vendor **tops up wallet**.
2. Vendor opens **Connect WhatsApp** (`/settings/whatsapp`); chooses **Cloud API** or **Coexistence**.
3. **Embedded Signup** — vendor logs in with Meta; creates or selects Business Portfolio + WABA + profile + phone (OTP or CoEx QR).
4. ChatLogix backend completes Graph steps: token exchange, register number, webhook subscription, **credit line attach** (`waba_currency=INR`).
5. Go-live checklist: inbound test, outbound test (wallet debited for the AI cost today; Meta base + markup once P2h lands), utility templates as needed.

---

## 4. Required documents & prerequisites
**Must-have (to connect directly):**
- Business name
- Business phone number to be used for WhatsApp (must be unique / not registered on personal WA or must be migrated)
- Email for Business Manager account
- GSTIN (if available) — preferred for faster verification
- PAN / Owner ID (Aadhaar or Govt ID)
- Official business address

**Optional / for assisted onboarding:**
- Declaration of ownership (simple signed PDF)
- Utility bill for address proof

**Notes:** If vendor lacks GST/Business Manager, we offer step-by-step guidance and a lightweight education flow.

---

## 5. Dashboard UI flows (detailed screens)
**A. Signup / Quick Start (1 screen)**
- Fields: Business name, owner name, mobile (dev/test), email, preferred language, vendor category.
- CTA: `Start Onboarding`.

**B. Choose Onboarding Path (modal)**
- Option 1: **Self-Serve (recommended)** — follow guided steps.  
- Option 2: **Assisted** — schedule a 15‑minute call with Ops (paid/free credit).

**C. Document Upload Wizard (multi-step)**
- Step 1: Add Business Phone (input + verify OTP)  
- Step 2: Upload ID (PAN/Aadhaar) & Business Address (photo)  
- Step 3: Upload GST (if available)  
- Step 4: Confirm ownership (checkbox & e-sign)  

UI helpers: tooltips, sample images, inline checklist showing missing items.

**D. Meta Business Verification Status Page**
- Shows live status: `Draft` → `Submitted` → `In Review` → `Approved`/`Rejected` with reason.  
- Display estimated time + next steps.

**E. Phone Number Linking — two paths (both required in product)**

| Path | When to use | Vendor action |
| --- | --- | --- |
| **Cloud API** | New or dedicated business line; number **not** active on consumer WA / WA Business App (or deleted + cooldown) | Enter number in Embedded Signup; SMS or voice OTP |
| **Coexistence (CoEx)** | Number already active on **WhatsApp Business App** (typically ≥7 days on app per Meta/partner guidance) | Embedded Signup → scan QR in WA Business App |

- If vendor uses **personal WhatsApp** on the business number: migration / delete-from-app guidance before Cloud API path.
- Do **not** default to “leased” platform numbers for production; trial value is browser sandbox, not shared WABA numbers.

**F. Connect status (vendor-facing)**
- States: `not_started` → `meta_in_progress` → `credit_attached` → `live` → `error` (with Meta error copy + support CTA)
- Toggles: `Enable WhatsApp` / `Disable` (disable = stop outbound + AI; optional ops-only suspend)

**G. Webhook & tokens (internal / advanced)**
- Webhook URL and verify token are platform-level; vendors do not paste tokens.
- Optional advanced panel: display name / template status only.

**H. Final Go-Live Checklist**
- Send test inbound message (auto-logged)  
- Approve 3 message templates (welcome, order status, payment)  
- Payment connector test  
- Shipping connector test  
- Agree to terms & SLA

---

## 6. Backend processes & API calls (sequence)

**Assumption:** One ChatLogix Meta app; vendors onboard **their** WABA via Embedded Signup. ChatLogix must be a **Solution Partner** with an approved **extended credit line** and Credit Allocation API terms accepted.

1. **Embedded Signup (client):** Meta returns WABA ID, phone number ID, exchangeable code (Embedded Signup v4).
2. **Exchange code (server):** Business-scoped token for customer WABA; store **encrypted** per vendor/WABA.
3. **Register phone** for Cloud API (Cloud path) or complete CoEx handshake (CoEx path).
4. **Subscribe app** to customer WABA webhooks (same callback URL as production Lambda/Express).
5. **Attach credit line (Solution Partner only):**
   ```http
   POST /{EXTENDED_CREDIT_LINE_ID}/whatsapp_credit_sharing_and_attach
     ?waba_currency=INR
     &waba_id={CUSTOMER_WABA_ID}
   Authorization: Bearer {SYSTEM_USER_TOKEN}
   ```
   Verify: `GET /{WABA_ID}?fields=primary_funding_id` matches allocation. ChatLogix is **Bill To Party** for Meta usage on that WABA.
6. **Persist** `WhatsAppNumber` (`phoneNumberId`, `wabaId`, `vendorId`); migrate sends/media fetch to **per-tenant token** (not global `WHATSAPP_ACCESS_TOKEN` only).
7. **Template submission (optional):** Submit utility/order templates to **that** WABA namespace.
8. **Testing:** Inbound webhook → persist message; if `walletBalanceMilli` covers a worst-case turn, run AI pipeline + outbound; debit wallet through `pricingService.chargeVendor`. Today that charge is `ceil(aiCostMilli × (1 + markupPercent/100))` in millirupees; P2h adds the Meta base rate into the same `whatsappCostMilli` slot.
9. **Offboarding:** Revoke credit sharing; revoke token; disable webhooks for WABA.

**Wallet gating (live):** If balance is insufficient for estimated AI + outbound cost, **still store inbound** messages; **do not** enqueue conversation processor or response queue. Outbound templates and AI replies resume after top-up.

**Pricing:** WhatsApp debits = Meta INR rate card for category/destination × `(1 + Vendor.markupPercent/100)`. The markup field shipped as **`Vendor.markupPercent`** (default 50, admin-editable via `PATCH /api/vendors/:id/billing-config`) — there is no separate `whatsappMarkupPercent`. The rate-card lookup itself is the outstanding P2h work; until then `whatsappCostMilli` is 0 and ChatLogix absorbs Meta conversation fees.

References: [Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup/), [Share and revoke credit lines](https://developers.facebook.com/docs/whatsapp/embedded-signup/manage-accounts/share-and-revoke-credit-lines).

---

## 7. Automated verification tasks we can do for vendors
- **Document quality checks**: image resolution, required fields present (OCR), face match (optional).  
- **GST sanity check**: call government GST API (if available) to pre-fill business name.  
- **Phone number format & OTP**: auto OTP and retry logic.  
- **Automated template linting**: ensure variable placeholders and language are compliant.  

---

## 8. Human-assisted tasks and escalation
- **Escalation triggers:** Business verification rejected, phone migration failure, document mismatch, stuck meta status >72hrs.  
- **Ops tasks:** manual review of docs, call vendor to assist, resubmit business verification with corrections, coordinate with Meta support.  
- **SLA:** Ops response within 4 business hours, resolution within 48–72 hours for complex cases.

---

## 9. Error handling & user messaging
- For each failure state show clear user-facing messages, suggested fixes, and `Contact Ops` CTA.
- Common errors & messages:
  - `Invalid document image` → show sample & retry.
  - `Phone already on personal WhatsApp` → provide migration steps.
  - `Business verification rejected` → show reason & next steps.
  - `Template rejected` → show rejection reason & suggest changes.

---

## 10. Security, privacy & compliance
- Store docs in encrypted S3; access logged and RBAC enforced.  
- PII fields (phone, address, PAN) encrypted at rest with KMS.  
- Audit logs for every verification action (who did what & when).  
- Data residency: all vendor PII stored in ap‑south‑1 region.  
- Consent capture & opt‑in record for each customer/number.  

---

## 11. Assisted onboarding & edge cases
**Why assisted:** Some micro sellers lack GST, website, or Meta Business verification on first try.

**Options:**
- **Ops-assisted Embedded Signup** — screen-share / call; same Cloud API or CoEx paths; ops does not replace vendor Meta login where Meta requires it.
- **Browser sandbox** during trial — no live WABA required until post-approval connect.

**Not the default product path:** Reselling through a **third-party BSP** for Meta billing. ChatLogix **owns** Solution Partner + credit line.

**Churn:** Revoke credit line sharing and API access when vendor leaves; vendor retains WABA in their Business Manager.

---

## 12. SLA & timelines
- **Self‑serve completion target:** 48–72 hours average (depends on Meta review).  
- **Assisted completion target:** 72–120 hours.  
- **Template approval:** 24–72 hours (Meta dependent).  
- **Phone migration:** 5–30 minutes for technical steps + possible manual validation.

---

## 13. Acceptance criteria & telemetry
**Onboarding success:**
- Vendor `onboarding:completed` and `wa_number` active.  
- First inbound message received and a test outbound sent successfully.  
- Template approved & first transactional message successfully delivered.

**Telemetry to collect:**
- Time to complete each step, drop‑off rates, common rejection reasons, avg number of retries, ops time per vendor.

---

## 14. Implementation tickets (epics & sample issues)
**Epic: Onboarding Core**
- Ticket: Signup + onboarding wizard (UI) — fields, validations, file upload UI, retry UI.  
- Ticket: Store docs in S3 + encryption + presigned URLs.  
- Ticket: OTP phone verification + retry/backoff.  

**Epic: Meta Integration**
- Ticket: Embedded Signup v4 (Cloud API + Coexistence) in vendor settings.  
- Ticket: Token exchange, encrypted storage, webhook subscribe, **credit attach (INR)** + verify `primary_funding_id`.  
- Ticket: Per-vendor Graph token for send/media; deprecate global-only token path.  
- Ticket: Populate `whatsappCostMilli` on the existing wallet charge from the Meta base rate (reuse `chargeVendor`, do **not** add a parallel debit path); reconcile with status webhook pricing fields.  
- Ticket: Credit revoke on offboard.  
- Ticket: Phone migration / CoEx error playbooks (vendor-facing copy).  

**Epic: Ops & Assisted Flow**
- Ticket: Ops dashboard — list of vendors needing review, action buttons, notes.  
- Ticket: Scheduled call integration (Calendly) + canned scripts for ops.  

**Epic: Monitoring & Analytics**
- Ticket: Onboarding funnel dashboard + alerts for stuck vendors.  
- Ticket: Telemetry events for rejected templates, doc OCR failure rates.

---

## 15. Sample email / SMS / WhatsApp templates
**Welcome Email:**
> Subject: Welcome to [Product] — Let's connect your WhatsApp
> Hi {owner_name},
> Thanks for signing up. Click here to start onboarding: {onboard_link}

**OTP SMS:**
> Your OTP for verifying {phone} on [Product] is {otp}. Valid for 5 minutes.

**Verification Rejected (WhatsApp message):**
> Hi {owner_name}, your business verification was rejected because {reason}. Please re-upload {doc} or contact support at {support_link}.

---

*This document is a detailed working playbook. Use it to build the onboarding flows, write tickets, and train ops staff.*

