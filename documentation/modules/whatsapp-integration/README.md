# WhatsApp Integration Module

Documentation for WhatsApp Business API integration.

## 📁 Structure

```
whatsapp-integration/
├── README.md (this file)
└── guides/
    ├── webhook-api.md
    ├── vendor-onboarding-workflow.md
    ├── conversation-parity-implementation-plan.md
    ├── conversation-parity-rollout-runbook.md
    └── uat-scenarios.md

P2h product spec: [../features/vendor-onboarding/guides/whatsapp-connect-p2h.md](../features/vendor-onboarding/guides/whatsapp-connect-p2h.md)
```

## 📚 Documentation

- **[Webhook API Guide](./guides/webhook-api.md)** - Original design brief for the webhook API (historical — see the note at the top of that file for how it relates to the actual implementation)
- **[P2h — WhatsApp connect](../features/vendor-onboarding/guides/whatsapp-connect-p2h.md)** - **Product + engineering plan** for self-serve Embedded Signup (vendor-owned WABA, no ChatLogix ops setup). Planned 2026-09-17.
- **[Vendor Onboarding Workflow](./guides/vendor-onboarding-workflow.md)** - Older Meta API playbook. Graph sequence in §6 is still useful; document-upload / ops-assisted default is **not** P2h v1.
- **[Conversation Parity Implementation Plan](./guides/conversation-parity-implementation-plan.md)** - Business logic, phased execution plan, and exit criteria for WhatsApp conversation fidelity
- **[Conversation Parity Rollout Runbook](./guides/conversation-parity-rollout-runbook.md)** - Staged flag-enablement runbook for the conversation parity rollout
- **[UAT Scenario Matrix](./guides/uat-scenarios.md)** - Acceptance-test matrix for the conversation parity rollout

## 🔗 Related Modules

- **[Vendor Onboarding](../features/vendor-onboarding/)** - Vendor onboarding system
- **[Architecture](../../shared/architecture/)** - System architecture

