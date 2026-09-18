# 🤝 Meta Solution Partner Requirements - ChatLogix

> Complete requirements and implementation guide for becoming a Meta Solution Partner

## 🎯 Meta Partnership Overview

ChatLogix aims to become a **Meta Solution Partner** for WhatsApp Business API, enabling us to serve enterprise customers and scale to millions of users through the Meta ecosystem. This document outlines all requirements, capabilities, and implementation details needed for Meta partnership certification.

**Partnership Goal:** Meta Solution Partner for WhatsApp Business API  
**Target Timeline:** 6-10 weeks to partnership application  
**Business Impact:** Enterprise customers, global scale, Meta ecosystem access  

**Billing model (locked — product):** ChatLogix **owns** Solution Partner status and a Meta **line of credit (INR)**. Vendors connect **their** WABA via Embedded Signup; we **share our credit line** onto each onboarded WABA so **Meta bills ChatLogix**, not the vendor. Vendors pay **only ChatLogix** via a **single prepaid wallet** (AI + WhatsApp usage). WhatsApp charges = Meta INR base + **per-vendor markup %** (admin-configurable — `Vendor.markupPercent`, shipped; the Meta base rate is **not billed yet**, see the status snapshot below). The **Tech Provider** path (vendor adds Meta payment method) is **not** the product default. See [vendor-onboarding-workflow.md](../../modules/whatsapp-integration/guides/vendor-onboarding-workflow.md) §6 and [public-signup-onboarding.md](../../modules/features/vendor-onboarding/guides/public-signup-onboarding.md).

**Last reviewed against codebase:** 2026-09-16

---

## 📍 Project status snapshot (2026-09-16)

What is **live in code today** vs what this document still targets for **Meta Solution Partner** certification.

| Area | Status | Notes |
| --- | --- | --- |
| **Production WhatsApp pipeline** | ✅ Shipped | API Gateway `chatlogix-webhook-handler` → SQS → `chatlogix-incoming-response-generator` → `chatlogix-whatsapp-response-dispatcher`. Shared `webhookEventProcessor.ts` with Express `/webhook` (dev). See `backend/src/lambdas/README.md`, `docs/INCOMING_RESPONSE_GENERATOR_FLOW.md`. |
| **Vendor self-serve signup & trial** | ✅ Shipped (P2a–P2f) | Phone OTP signup, **₹50** trial wallet, 5-step onboarding UI, production `pipeline.ts` sandbox, submit for approval, route guards. See [vendor-onboarding README](../../modules/features/vendor-onboarding/README.md). |
| **Unified wallet billing (millirupees)** | ✅ Shipped 2026-09-16 | **Every** billable action — conversation turns, outbound media, catalog import/enhance, onboarding sandbox — debits `Vendor.walletBalanceMilli` through the single `pricingService.chargeVendor` path: `ceil((aiCost + whatsappCost + platformFee) × (1 + Vendor.markupPercent/100))`. Flat per-message credits and the monthly plan quota are **deleted**. Authority: [BILLING_AND_PRICING.md](../../../docs/BILLING_AND_PRICING.md). |
| **Per-vendor markup %** | ✅ Shipped 2026-09-16 | `Vendor.markupPercent`, default **50**, range 0–500, admin-editable via `PATCH /api/vendors/:id/billing-config` and the web-admin vendor detail panel. This closes the "admin-configurable markup" item that was scoped into P2h. |
| **WhatsApp message debits** | ❌ Not billed (P2h) | The `whatsappCostMilli` slot exists in the charge formula but is **always 0** (`PlatformSettings.platformFeePerTurnPaise = 0`) until the Meta rate card lands. **ChatLogix absorbs Meta conversation fees today** — a known, deliberate gap. Meta pricing reconciliation also not started. |
| **WhatsApp tenant mapping** | ✅ Partial | `WhatsAppNumber` maps `phoneNumberId` → `vendorId` for webhooks. Outbound send still uses **global** `WHATSAPP_ACCESS_TOKEN` + per-message `phoneNumberId` when present (`whatsappClient.ts`) — not per-vendor encrypted tokens. |
| **Embedded Signup + credit attach (INR)** | ❌ Not started (P2h) | No vendor settings UI, no token exchange, no `whatsapp_credit_sharing_and_attach`, no `primary_funding_id` verification in repo. **Plan:** [whatsapp-connect-p2h.md](../../modules/features/vendor-onboarding/guides/whatsapp-connect-p2h.md) (2026-09-17). |
| **Wallet top-up (P2g)** | ✅ Shipped (mock v1) | `/wallet`, mock top-up. Trial **carries forward** after onboarding (target). **No min top-up to go live** — wallet gate only. Razorpay parallel; **P2h built on mock wallet first**. |
| **Onboarding gate** | 🔶 Target vs shipped | **Target:** auto-approve on submit (24/7). **Shipped:** `pending_approval` + ops SQL/script. |
| **Meta Solution Partner / line of credit** | 🔶 Product + ops | Billing model documented and locked; **partnership application and INR credit line** are business/Meta ops steps — not reflected as implemented features in application code. |
| **Meta business verification (license/docs)** | ❌ Not started | Long-term requirements doc; v1 onboarding uses phone OTP only. |
| **Partnership application package** | ❌ Not started | Technical docs exist in-repo; formal Meta submission not tracked as done. |

**Recommended implementation order (engineering):** **P2h** (Embedded Signup onto a vendor-owned WABA, per-vendor tokens, credit attach, then `whatsappCostMilli`) — full plan [whatsapp-connect-p2h.md](../../modules/features/vendor-onboarding/guides/whatsapp-connect-p2h.md). **Razorpay** for P2g v2 when credentials exist (does not block P2h). Partnership application collateral in parallel with Meta credit-line approval.

✅ **Migrations:** the three millirupee migrations (`20250916120000_wallet_top_up_intent`, `20250916180000_wallet_milli_units`, `20250916210000_credit_usage_source`) plus `20250916220000_platform_settings` are **applied and recorded** as of 2026-09-16 evening, with zero drift from `schema.prisma`. Bootstrapping a fresh environment has caveats — see [BILLING_AND_PRICING.md](../../../docs/BILLING_AND_PRICING.md) §Migrations.

---

## 🏆 Meta Solution Partner Benefits

### **Business Benefits:**
- **Enterprise Customers:** Access to large enterprise clients
- **Global Scale:** Serve customers worldwide through Meta
- **Revenue Growth:** Higher-value enterprise contracts
- **Brand Recognition:** Meta partnership certification
- **Technical Support:** Direct Meta technical assistance

### **Technical Benefits:**
- **API Priority:** Priority access to WhatsApp Business API
- **Feature Access:** Early access to new WhatsApp features
- **Rate Limits:** Higher API rate limits for partners
- **Support Channels:** Direct Meta developer support
- **Testing Environment:** Access to Meta testing tools

---

## 📋 Meta Partnership Requirements

### **1. Technical Capabilities**
- ✅ **WhatsApp Business API Integration** — Send text, templates, typing indicators; Graph client in `backend/src/services/whatsappClient.ts`. Production path is Lambda-based (see snapshot above).
- ✅ **Webhook System** — Real-time ingress via `webhookEventProcessor.ts` / `waParser.ts` (text, interactive, media placeholders, status, reactions).
- 🔶 **Message Templates** — **Send** path + order-notification naming in `whatsappTemplateService.ts`; templates must exist in Meta BM. **No** in-app template create/submit/approval workflow or admin template library yet.
- ✅ **Media Handling** — Inbound **audio, image, video, document, and sticker** messages are persisted via `webhookEventProcessor.ts`, fetched/transcribed or processed by **`chatlogix-media-fetcher`** (S3 + Whisper where applicable), and eligible traffic is enqueued to **`chatlogix-incoming-response-generator`** for AI replies. See `backend/src/lambdas/README.md` and `docs/INCOMING_RESPONSE_GENERATOR_FLOW.md`.
- ✅ **Status Tracking** — Outbound delivery webhooks (`sent`, `delivered`, `read`, `failed`) are parsed in `waParser.ts`, handled in `webhookEventProcessor.ts#processStatus` (updates `Message.status`, appends `MessageStatusEvent`, stores failure reason). **Reactions** (`message_reaction_added` / `removed`) update `MessageReaction` in the same processor. Status/reaction events that arrive before the parent message is persisted are buffered in Redis and replayed on `message_created`. Same batch path for Express `/webhook` and `chatlogix-webhook-handler` Lambda via `processWebhookEventBatch`.
- ✅ **Multi-language Support** — Conversation pipeline handles regional languages (LLM replies + product match telemetry); not the same as Meta-approved multi-language **message templates**.

### **2. Business Verification System**
(Meta partnership / enterprise KYC — **not** the same as v1 vendor phone OTP signup.)

- [ ] **Business License Verification** - Automated verification
- [ ] **Address Verification** - Real-time address validation
- 🔶 **Phone Number Verification** - **Vendor login/signup:** Firebase OTP on `Vendor.phone` (P2). **Not** Meta business phone or WABA verification automation.
- [ ] **Document Verification** - Business document upload
- 🔶 **Verification Status Tracking** - `registrationStatus` + **target auto-approve** on onboarding complete; **shipped** manual approve (`pending_approval` → ops). Not Meta Business Verification API.

### **3. Advanced WhatsApp Features**
- 🔶 **Interactive Messages** — **Inbound:** button/list replies parsed in `waParser.ts`, billed as `interactive`, enqueued for AI. **Outbound:** `sendWhatsAppInteractive()` exists but is **not** used by the conversation pipeline or vendor tools.
- [ ] **Call-to-Action Buttons** - Action-oriented messaging (product/UI)
- 🔶 **Rich Media Messages** — Inbound media pipeline ✅; outbound rich templates beyond text + basic template send not productized.
- [ ] **Template Analytics** - Performance tracking
- [ ] **Multi-language Templates** - Localized messaging (Meta template objects; separate from AI reply language)

### **4. Meta Business Manager Integration**
- [ ] **Embedded Signup v4** — vendor connect in portal (Cloud API + Coexistence) — **planned P2h**; no frontend/backend implementation yet
- 🔶 **Credit line (INR)** — **Product decision locked** in docs; **ops/Meta approval** not tracked as complete in this repo
- [ ] **Credit attach automation** — `whatsapp_credit_sharing_and_attach` on each vendor WABA; verify `primary_funding_id`
- [ ] **Credit revoke** on vendor offboarding
- [ ] **Per-vendor business tokens** — encrypted storage; system user token for credit ops only (`WhatsAppNumber` has no token fields today)
- [ ] **Wallet reconciliation** — webhook pricing metadata vs ChatLogix wallet debits (Meta base × per-vendor `markupPercent`)
- 🔶 **Business Manager Connection** — Manual/ops onboarding for early vendors; **self-serve** connect flow not built
- [ ] **Ad Account Integration** — Facebook/Instagram ads (future)
- [ ] **Pixel Integration** — Conversion tracking (future)
- [ ] **Catalog Synchronization** — Product catalog sync (future; ChatLogix catalog is in-app, not Meta Commerce sync)
- [ ] **Business Insights** — Meta analytics integration (future)

---

## 🏗️ Technical Implementation

> **Note:** The TypeScript sketches below describe **target services** for Meta partnership. They are **not** implemented as named modules today; use the [project status snapshot](#-project-status-snapshot-2026-09-16) and `backend/src/services/*` (e.g. `whatsappClient.ts`, `vendorOnboardingService.ts`, `billingService.ts`) for what exists.

### **Meta Verification Service**
```typescript
// src/core/services/meta-verification.service.ts
export interface BusinessVerificationData {
  businessName: string;
  businessLicense: string;
  businessAddress: Address;
  phoneNumber: string;
  businessType: string;
  documents: BusinessDocument[];
}

export interface VerificationResult {
  status: 'pending' | 'verified' | 'rejected';
  verificationId: string;
  details: VerificationDetails;
  nextSteps: string[];
}

export class MetaVerificationService {
  async verifyBusinessAccount(data: BusinessVerificationData): Promise<VerificationResult> {
    // 1. Validate business license
    const licenseVerification = await this.verifyBusinessLicense(data.businessLicense);
    
    // 2. Verify business address
    const addressVerification = await this.verifyAddress(data.businessAddress);
    
    // 3. Validate phone number
    const phoneVerification = await this.verifyPhoneNumber(data.phoneNumber);
    
    // 4. Process business documents
    const documentVerification = await this.verifyDocuments(data.documents);
    
    // 5. Generate verification result
    return this.generateVerificationResult({
      licenseVerification,
      addressVerification,
      phoneVerification,
      documentVerification
    });
  }
  
  async submitMetaApplication(verificationResult: VerificationResult): Promise<ApplicationStatus> {
    // Submit Meta Solution Partner application
    // Include verification results
    // Provide technical capabilities documentation
    // Demonstrate compliance and security measures
  }
}
```

### **Advanced WhatsApp Features Service**
```typescript
// src/core/services/advanced-whatsapp.service.ts
export interface InteractiveMessage {
  type: 'quick_reply' | 'button' | 'list';
  header?: string;
  body: string;
  footer?: string;
  action: MessageAction;
}

export interface MessageAction {
  buttons?: QuickReplyButton[];
  sections?: ListSection[];
  callToAction?: CallToActionButton;
}

export class AdvancedWhatsAppService {
  async sendInteractiveMessage(conversationId: string, message: InteractiveMessage): Promise<MessageResult> {
    // Send interactive WhatsApp message
    // Handle quick reply buttons
    // Process call-to-action buttons
    // Track message engagement
  }
  
  async createMessageTemplate(template: MessageTemplate): Promise<TemplateResult> {
    // Create message template
    // Submit for Meta approval
    // Track approval status
    // Monitor template performance
  }
  
  async getTemplateAnalytics(templateId: string): Promise<TemplateAnalytics> {
    // Get template performance metrics
    // Track delivery rates
    // Monitor engagement rates
    // Analyze conversion data
  }
}
```

### **Meta Business Manager Service**
```typescript
// src/core/services/meta-business-manager.service.ts
export interface BusinessManagerConfig {
  businessId: string;
  adAccountId: string;
  pixelId: string;
  catalogId: string;
  accessToken: string;
}

export class MetaBusinessManagerService {
  async connectBusinessManager(config: BusinessManagerConfig): Promise<ConnectionResult> {
    // Connect to Meta Business Manager
    // Verify business account
    // Set up ad account connection
    // Configure pixel integration
    // Sync product catalog
  }
  
  async syncBusinessData(data: BusinessData): Promise<SyncResult> {
    // Sync product catalog
    // Sync customer data
    // Sync order data
    // Sync analytics data
  }
  
  async createAdCampaign(campaign: AdCampaign): Promise<CampaignResult> {
    // Create Facebook/Instagram ad campaign
    // Set targeting parameters
    // Configure ad creative
    // Set budget and schedule
  }
  
  async trackConversions(events: ConversionEvent[]): Promise<TrackingResult> {
    // Track conversion events
    // Send pixel events
    // Monitor campaign performance
    // Optimize ad spend
  }
}
```

---

## 🔐 Security & Compliance Requirements

### **Meta Security Standards**
- **Data Encryption:** AES-256 encryption for all data
- **Secure Transmission:** TLS 1.3 for all communications
- **Access Control:** Role-based access control (RBAC)
- **Audit Logging:** Complete audit trail for all operations
- **Data Privacy:** GDPR compliance for data handling

### **Business Verification Security**
- **Document Security:** Secure document storage and verification
- **Identity Verification:** Multi-factor identity verification
- **Fraud Prevention:** Anti-fraud measures and monitoring
- **Compliance Monitoring:** Regular compliance audits
- **Incident Response:** Security incident response plan

---

## 📊 Meta Partnership Application Process

### **Phase 1: Preparation (Weeks 1-2)**
1. **Technical Documentation**
   - API implementation documentation
   - Security architecture documentation
   - Compliance documentation
   - Performance metrics documentation

2. **Business Documentation**
   - Business verification system
   - Customer case studies
   - Financial stability proof
   - Team expertise documentation

### **Phase 2: Application Submission (Week 3)**
1. **Meta Application Form**
   - Company information
   - Technical capabilities
   - Business verification results
   - Compliance certifications

2. **Supporting Documents**
   - Technical architecture diagrams
   - Security assessment reports
   - Customer testimonials
   - Financial statements

### **Phase 3: Meta Review (Weeks 4-6)**
1. **Technical Review**
   - API implementation review
   - Security assessment
   - Performance testing
   - Scalability evaluation

2. **Business Review**
   - Business model review
   - Customer base evaluation
   - Financial stability assessment
   - Partnership potential

### **Phase 4: Partnership Approval (Week 7-8)**
1. **Partnership Agreement**
   - Terms and conditions
   - Revenue sharing agreement
   - Technical support agreement
   - Marketing collaboration

2. **Go-Live Preparation**
   - Partner portal access
   - Marketing materials
   - Training and certification
   - Launch announcement

---

## 🎯 Success Metrics & KPIs

### **Technical Success Metrics**
- **API Performance:** < 2 second response time
- **Uptime:** 99.9% availability
- **Scalability:** Support 10,000+ concurrent merchants
- **Security:** 0 security vulnerabilities
- **Compliance:** 100% compliance with Meta standards

### **Business Success Metrics**
- **Verification Success Rate:** > 95% business verification success
- **Customer Satisfaction:** > 4.5/5 rating
- **Enterprise Adoption:** > 100 enterprise customers
- **Revenue Growth:** > 200% year-over-year growth
- **Global Reach:** Serve customers in 10+ countries

---

## 🚀 Implementation Timeline

Original 8-week plan assumed greenfield build. **As of 2026-09-16**, core WhatsApp + AI pipeline and vendor trial onboarding are largely done; remaining work clusters on **billing/connect** and **Meta partnership ops**.

### **Done (2025–2026) — foundation for partnership demo**
- ✅ Lambda webhook → conversation processor → response dispatcher
- ✅ Media fetch/transcribe path; inbound interactive + status/reactions
- ✅ Vendor public signup, trial wallet, onboarding wizard, admin approval gate (P2a–P2f)
- ✅ **Unified millirupee AI billing** across the conversation pipeline, catalog import/enhance and the onboarding sandbox, with per-vendor markup (2026-09-16)
- ✅ Wallet top-up (P2g v1, mock provider) + admin markup editing in `web-admin`

### **Next — product engineering (sequenced)**
| Phase | Scope | Status |
| --- | --- | --- |
| **P2g v2** | Razorpay replacing the mock wallet provider | Not started — needs account credentials |
| **P2h** | Embedded Signup v4, token exchange, encrypted per-vendor tokens, webhook subscribe, INR credit attach + verify, WhatsApp wallet debits (populate `whatsappCostMilli`), outbound gating | Not started — **blocks self-serve Meta connect**. Plan: [whatsapp-connect-p2h.md](../../modules/features/vendor-onboarding/guides/whatsapp-connect-p2h.md) |
| **P2h+** | Credit revoke on offboard; pricing reconciliation from status webhooks; approval notification via real WhatsApp template (stub logs today) | Not started |

### **Parallel — Meta Solution Partner (business + compliance)**
- [ ] Secure **extended line of credit (INR)** + accept Credit Allocation API terms
- [ ] Business verification system (if required for application tier you target)
- [ ] Partnership application package (architecture, security, case studies, financials)
- [ ] Meta review → approval

### **Later — enterprise WhatsApp feature depth**
- [ ] Outbound interactive/CTA in product; template CRUD + analytics
- [ ] Ads, pixel, Meta catalog sync, Business Insights (future rows in §4)

---

## 📚 Meta Partnership Resources

### **Official Documentation**
- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)
- [Meta Business Manager](https://business.facebook.com/)
- [Meta for Developers](https://developers.facebook.com/)
- [Meta Business Verification](https://business.facebook.com/verification)

### **Partnership Guidelines**
- [Meta Solution Partner Program](https://developers.facebook.com/partners/)
- [WhatsApp Solution Providers](https://developers.facebook.com/docs/whatsapp/solution-providers/) (Solution Partner vs Tech Provider billing)
- [Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup/)
- [Share and revoke credit lines](https://developers.facebook.com/docs/whatsapp/embedded-signup/manage-accounts/share-and-revoke-credit-lines)
- [Partnership Requirements](https://developers.facebook.com/partners/requirements)
- [Application Process](https://developers.facebook.com/partners/apply)
- [Best Practices](https://developers.facebook.com/partners/best-practices)

---

## 🎯 Ready for Meta Partnership?

### **Immediate next steps (aligned with repo, 2026-09-16)**

**Engineering (unblocks self-serve WABA + locked billing model):**
1. **P2g v2 — Razorpay** — mock provider v1 has shipped (see [wallet-top-up-p2g.md](../../modules/features/vendor-onboarding/guides/wallet-top-up-p2g.md)); swap in Razorpay when credentials exist so approved vendors can fund `walletBalanceMilli` with real money.
2. **P2h — WhatsApp connect slice** — Full plan: [whatsapp-connect-p2h.md](../../modules/features/vendor-onboarding/guides/whatsapp-connect-p2h.md). `/settings/whatsapp`: Embedded Signup v4 (Cloud API + Coexistence), server-side code exchange, subscribe webhooks, `whatsapp_credit_sharing_and_attach` (`waba_currency=INR`), verify `primary_funding_id`, store **encrypted** per-vendor token on `WhatsAppNumber`, route Graph sends through tenant credentials with global-token fallback for existing mapped numbers. Vendor number lives on the **vendor’s WABA**, not ChatLogix’s.
3. **Wallet + WhatsApp usage** — Populate `whatsappCostMilli` on the **existing** charge from the Meta INR base rate; the `× (1 + markupPercent/100)` step, the `WalletTransaction.metadata` breakdown and the wallet gate already exist and should be reused, not reimplemented. See [BILLING_AND_PRICING.md](../../../docs/BILLING_AND_PRICING.md) §7.
4. **Wire approval notification** — Replace `vendorApprovalNotificationService` stub with approved WhatsApp template or SMS.

**Meta / business (parallel):**
5. **Line of credit (INR)** — Meta ops: extended credit approval + Credit Allocation API terms (prerequisite for P2h attach in production).
6. **Application collateral** — Export architecture from `docs/`, Lambda runbooks, security posture (RBAC in `authorize.ts`, encryption at rest for tokens once built), load/availability notes (`docs/LOAD_TESTING.md`).
7. **Partnership submission** — After P2h is demonstrable end-to-end on a test WABA.

**Defer until post-P2h unless partnership form explicitly requires them:**
- Full business license/document verification automation (§2)
- Ads, pixel, Meta catalog sync, template analytics (§3–§4 future rows)

### **Meta Partnership Checklist:**
- [ ] Extended **line of credit** approved (INR) + Credit Allocation API terms
- [ ] Embedded Signup + **credit attach** in vendor WhatsApp connect flow
- [ ] Per-vendor tokens + Graph send/media on tenant credentials
- 🔶 Wallet billing for WhatsApp (Meta base + per-vendor markup %) + AI — **AI billing ✅, per-vendor markup ✅; WhatsApp base rate / debits ❌**
- 🔶 Business verification — **vendor approval workflow ✅; Meta/KYC automation ❌**
- 🔶 Advanced WhatsApp features — **core API + inbound interactive ✅; outbound interactive + template ops ❌**
- 🔶 Security and compliance — **auth/RBAC/logging ✅; token encryption + partnership audit pack ❌**
- 🔶 Technical documentation — **pipeline docs ✅; formal partner submission bundle ❌**
- [ ] Meta application submitted
- [ ] Partnership approved

---

**From WhatsApp automation to Meta Solution Partner - we've got the roadmap covered! 🚀**

*Meta partnership is the gateway to enterprise customers and global scale.*
