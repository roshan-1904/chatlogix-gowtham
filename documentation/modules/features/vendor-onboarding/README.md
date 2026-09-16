# Vendor Onboarding Module

Complete documentation for the vendor onboarding system.

## 📁 Structure

```
vendor-onboarding/
├── README.md (this file)
├── requirements/
│   ├── README.md
│   └── VENDOR_ONBOARDING_REQUIREMENTS.md
├── guides/
│   ├── public-signup-onboarding.md
│   ├── wallet-top-up-p2g.md
│   ├── signup-page-marketing-copy.md
│   └── approval-runbook.md
└── status/
```

## 📚 Documentation

### Requirements
- **[Vendor Onboarding Requirements](./requirements/VENDOR_ONBOARDING_REQUIREMENTS.md)** - Complete requirements specification (long-term vision; partial overlap with public signup guide)

### Guides
- **[Public Signup & Trial Onboarding (Page-by-Page)](./guides/public-signup-onboarding.md)** - **Approved v1 spec** for vendor portal signup, ₹50 trial wallet, admin approval gate, and onboarding UI flow (P2–P3 shipped 2026-09-06; **P4 conversion UX overhaul** shipped and verified 2026-09-11)
- **[Signup Page — Marketing Copy & Layout](./guides/signup-page-marketing-copy.md)** - Copy & layout spec for `/signup`; job-first headline and trust-line copy lock implemented in P4 (2026-09-11)
- **[Approval Runbook](./guides/approval-runbook.md)** - Manual vendor approval ops, plus the billing knobs ops can change
- **[P2g — Wallet top-up](./guides/wallet-top-up-p2g.md)** - Post-approval prepaid wallet; **mock payments v1 shipped**, Razorpay v2 when credentials exist
- **[Billing and Pricing](../../../../docs/BILLING_AND_PRICING.md)** - Single source of truth for the millirupee wallet, the charge formula, and per-vendor markup

### Status
- Implementation status tracking

## 🎯 Overview

The vendor onboarding system enables automated, self-service vendor registration with minimal manual intervention.

**Shipped:** P2a–P2f (public signup, trial wallet, onboarding wizard, sandbox, approval gate) — see [public-signup-onboarding.md](./guides/public-signup-onboarding.md) — plus **P2g v1** [wallet top-up](./guides/wallet-top-up-p2g.md) with the mock payment provider, and the unified **millirupee billing** rework (every charge is real cost × the vendor's `markupPercent`; no more flat per-message credits).

**Current engineering priority:** Razorpay for P2g v2 when credentials exist, then **P2h** Meta Embedded Signup + credit line attach — [WhatsApp vendor connect workflow](../../whatsapp-integration/guides/vendor-onboarding-workflow.md). P2h is also what unblocks billing WhatsApp conversation fees; ChatLogix absorbs them today.

The long-term requirements doc targets **90%+ automation** and complete onboarding in under **30 minutes** (documents, Meta verification, etc.).

## 🔗 Related Modules

- **[WhatsApp Integration](../../whatsapp-integration/)** - WhatsApp API integration
- **[Vendor Settings](../vendor-settings/)** - Vendor configuration

