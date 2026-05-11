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
11. Migration path & BSP fallback
12. SLA & timelines
13. Acceptance criteria & telemetry
14. Implementation tickets (epics & sample issues)
15. Sample email / SMS / WhatsApp templates

---

## 1. Goals
- Make Direct Meta Cloud API onboarding **frictionless** for small vendors.
- Automate all repeatable steps and surface only the minimal actions the vendor must take.
- Achieve **70%+ automated onboarding completion** without human ops.
- Provide a **fallback**: if a vendor cannot complete Direct Meta onboarding, offer BSP-managed onboarding.

---

## 2. User personas
- **Micro Seller (MS)**: home baker / tailor / craft seller. Limited tech literacy; may not have GST/PAN ready.
- **SMB Owner (SMB)**: small shop with GST, email, and basic digital literacy.
- **Operations Agent (Ops)**: internal staff who assist vendors for KYC & verification.
- **Admin (Platform)**: manages the dashboard, reviews verification events, and handles escalations.

---

## 3. High-level flow
1. Vendor signs up on our dashboard (phone number + email).  
2. Vendor selects onboarding path: `Self-Serve` or `Assisted`.
3. Dashboard collects required documents & metadata.  
4. Dashboard initiates Meta Business Verification flow via API (or prepares payload for manual submission).  
5. Vendor verifies phone number & accepts migration steps (if required).  
6. Once Meta approves Business and phone number, we register the number on our tenant & enable the webhook.  
7. Final tests: send/receive test messages, template approvals, and go-live checklist.  

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

**E. Phone Number Migration / Linking Screen**
- If vendor uses personal WhatsApp: show migration guide with clear steps and warnings.
- Provide `Test Mode` number option for early testing.

**F. Webhook & Tokens (for internal use)**
- For advanced vendors: show webhook URL, verify token, and CSR key.  
- For regular vendors: show toggles `Enable WhatsApp` / `Disable`.

**G. Final Go-Live Checklist**
- Send test inbound message (auto-logged)  
- Approve 3 message templates (welcome, order status, payment)  
- Payment connector test  
- Shipping connector test  
- Agree to terms & SLA

---

## 6. Backend processes & API calls (sequence)
**Assumption:** We manage a central Meta Cloud App on behalf of tenants via our own Meta Business Manager (app). We submit Business Verification on vendor's behalf when possible.

1. **Create Vendor Account (DB)**: create tenant record, initial state `onboarding:started`.
2. **Collect Docs**: store documents in S3 (encrypted), create verification request record.
3. **Business Manager Flow**:
   - If vendor consents, create a Business Manager invitation payload (Meta APIs).  
   - Generate business verification submission package: company name, website (optional), address, documents.
   - POST to Meta Business Verification endpoints (as per Meta docs).
4. **Phone Number Setup**:
   - Validate phone format.  
   - If migrating existing WhatsApp number: follow Meta's `migrating a number` protocol (request code, vendor confirms migration on their phone).  
   - If new number: register number via Cloud API and request verification.
5. **Webhook & Callback**:
   - Wait for webhook callbacks from Meta for verification status & message events.  
   - On approval, create `wa_number` entry (phone_number_id, waba_id) in DB.
6. **Template Submission (optional)**:
   - Vendor can submit templates; we submit to Meta via API for approval.
7. **Testing**:
   - Send test interactive message (list/buttons) and ensure delivery & session handling.
8. **Mark Go‑Live**: set vendor `onboarding:completed` and enable production keys.

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

## 11. Migration path & BSP fallback
**Why fallback:** Some micro sellers won’t have GST or business docs.  
**Fallback options:**
- Offer **BSP-assisted onboarding** (we act as reseller): BSP handles verification; we bill vendor.  
- Offer **sandbox mode** with leased numbers (temporary) until vendor completes verification.  

**Migration strategy:** allow moving from BSP-managed number to Direct Meta once vendor completes verification.

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
- Ticket: Business verification API client & submit flow.  
- Ticket: Phone migration flow & verification.  
- Ticket: Webhook handling for verification callbacks.  

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

