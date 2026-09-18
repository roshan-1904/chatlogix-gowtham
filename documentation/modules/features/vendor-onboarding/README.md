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
│   ├── whatsapp-connect-p2h.md
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
- **[P2h — WhatsApp connect](./guides/whatsapp-connect-p2h.md)** - Self-serve Embedded Signup onto a **vendor-owned WABA**; planned 2026-09-17 (not shipped)
- **[Billing and Pricing](../../../../docs/BILLING_AND_PRICING.md)** - Single source of truth for the millirupee wallet, the charge formula, and per-vendor markup

### Status
- Implementation status tracking

## 🎯 Overview

The vendor onboarding system enables automated, self-service vendor registration with minimal manual intervention.

**Shipped:** P2a–P2f (public signup, trial wallet, onboarding wizard, sandbox) — see [public-signup-onboarding.md](./guides/public-signup-onboarding.md) — plus **P2g v1** [wallet top-up](./guides/wallet-top-up-p2g.md), and the unified **millirupee billing** rework.

**Funnel policy (2026-09-18):** auto-approve on **Finish setup**, trial carry-forward, **no min top-up to go live**, P2h on **mock wallet first** — [public-signup-onboarding.md](./guides/public-signup-onboarding.md#implementation-gaps-doc-vs-code-2026-09-17).

**Current engineering priority:** **P2h** self-serve WhatsApp — [whatsapp-connect-p2h.md](./guides/whatsapp-connect-p2h.md). Razorpay (P2g v2) when credentials exist.

The long-term requirements doc targets **90%+ automation** and complete onboarding in under **30 minutes** (documents, Meta verification, etc.).

## 🔗 Related Modules

- **[WhatsApp Integration](../../whatsapp-integration/)** - WhatsApp API integration
- **[Vendor Settings](../vendor-settings/)** - Vendor configuration

