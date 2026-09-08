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
│   ├── signup-page-marketing-copy.md
│   └── approval-runbook.md
└── status/
```

## 📚 Documentation

### Requirements
- **[Vendor Onboarding Requirements](./requirements/VENDOR_ONBOARDING_REQUIREMENTS.md)** - Complete requirements specification (long-term vision; partial overlap with public signup guide)

### Guides
- **[Public Signup & Trial Onboarding (Page-by-Page)](./guides/public-signup-onboarding.md)** - **Approved v1 spec** for vendor portal signup, ₹100 trial wallet, admin approval gate, and onboarding UI flow (2026-09-05)
- **[Signup Page — Marketing Copy & Layout](./guides/signup-page-marketing-copy.md)** - **Approved copy & SEO spec** for `/signup` 65%/35% layout (documented, pending UI implementation)
- **[Approval Runbook](./guides/approval-runbook.md)** - Manual vendor approval ops

### Status
- Implementation status tracking

## 🎯 Overview

The vendor onboarding system enables automated, self-service vendor registration with minimal manual intervention.

**Current priority (v1):** [Public signup & trial onboarding](./guides/public-signup-onboarding.md) — phone OTP signup, ₹100 trial wallet, sandbox demo, admin approval, then prepaid wallet + WhatsApp connect.

The long-term requirements doc targets **90%+ automation** and complete onboarding in under **30 minutes** (documents, Meta verification, etc.).

## 🔗 Related Modules

- **[WhatsApp Integration](../../whatsapp-integration/)** - WhatsApp API integration
- **[Vendor Settings](../vendor-settings/)** - Vendor configuration

