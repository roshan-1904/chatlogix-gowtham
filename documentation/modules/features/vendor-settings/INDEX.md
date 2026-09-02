# Vendor Settings Documentation - Index

## 📚 Documentation Structure

This index provides a clear navigation structure for all Vendor Settings documentation. Use this as your starting point during implementation.

## Quick Navigation

### 🚀 Start Here
- **[Open Questions](./OPEN_QUESTIONS.md)** ⚠️ **REVIEW FIRST** - Questions and decisions needed before implementation
- **[Implementation Plan](./IMPLEMENTATION_PLAN.md)** 🎯 **START IMPLEMENTATION** - Complete phased implementation guide
- **[Quick Reference](./QUICK_REFERENCE.md)** - Quick access to tooltips, help text, and field specifications
- **[README](./README.md)** - Overview and introduction to Vendor Settings

### 📋 Planning & Architecture
- **[Architecture Overview](./ARCHITECTURE.md)** - Technical architecture, component structure, data flow
- **[UI/UX Specifications](./UI_UX_SPECIFICATIONS.md)** - Complete UI component specifications, tooltips, help text

### 📑 Tab Documentation (Detailed)
Each tab has its own detailed documentation:

1. **[Account & Business Tab](./TAB_ACCOUNT_BUSINESS.md)**
   - Business information management
   - Contact details
   - Subscription information
   - Related API: `GET /api/vendors/:id/config`, `PUT /api/vendors/:id/business-info`

2. **[AI Configuration Tab](./TAB_AI_CONFIGURATION.md)**
   - Bot identity and personality
   - AI model selection
   - System prompts and templates
   - AI content sections
   - Related API: `GET /api/vendors/:id/ai-config`, `PUT /api/vendors/:id/ai-prompts`

3. **[Order Settings Tab](./TAB_ORDER_SETTINGS.md)**
   - Order prefix configuration
   - Minimum order value
   - Delivery preferences
   - Preparation time configuration
   - Related API: `GET /api/vendors/:id/order-settings`, `PUT /api/vendors/:id/order-settings`

4. **[Notifications Tab](./TAB_NOTIFICATIONS.md)**
   - Notification preferences
   - Order status notifications
   - Quiet hours configuration
   - Related API: `GET /api/vendors/:id/notification-settings`, `PUT /api/vendors/:id/notification-settings`

5. **[Advanced Tab](./TAB_ADVANCED.md)**
   - Product matching configuration
   - Language support
   - Timezone settings
   - Related API: `GET /api/vendors/:id/matching-config`, `PUT /api/vendors/:id/matching-config`, `PUT /api/vendors/:id/timezone`

### 🔌 API Documentation
- **[API Documentation](./API_DOCUMENTATION.md)** - Complete API specifications, status, and implementation checklist

### 🚀 Implementation
- **[Open Questions](./OPEN_QUESTIONS.md)** ⚠️ **START HERE** - Questions and decisions needed before implementation
- **[Implementation Plan](./IMPLEMENTATION_PLAN.md)** - Complete implementation guide with phases, timeline, and strategy
- **[File Structure](./STRUCTURE.md)** - File organization and cross-reference map

## Implementation Workflow

### Phase 1: Backend APIs
1. Read **[API Documentation](./API_DOCUMENTATION.md)** - Understand what needs to be created/updated
2. Check implementation checklist in API Documentation
3. Reference tab documentation for field specifications and validation

### Phase 2: Frontend Components
1. Read **[Architecture Overview](./ARCHITECTURE.md)** - Understand component structure
2. Read **[UI/UX Specifications](./UI_UX_SPECIFICATIONS.md)** - Understand UI components and design
3. Reference **[Quick Reference](./QUICK_REFERENCE.md)** - For tooltips and help text during development
4. Reference tab documentation for:
   - Form layouts
   - Validation schemas
   - Component specifications
   - User interactions

### Phase 3: Integration
1. Use tab documentation to understand data flow
2. Reference API Documentation for endpoint integration
3. Use Quick Reference for consistent tooltips and help text

## Document Dependencies

```
INDEX.md (You are here)
│
├── README.md
│   └── Overview and introduction
│
├── QUICK_REFERENCE.md
│   └── Quick access during development
│
├── ARCHITECTURE.md
│   ├── Component structure
│   ├── Data flow
│   └── File structure
│
├── UI_UX_SPECIFICATIONS.md
│   ├── Component specifications
│   ├── Tooltip library
│   └── Help text examples
│
├── API_DOCUMENTATION.md
│   ├── Endpoint specifications
│   ├── Validation schemas
│   └── Implementation checklist
│
└── Tab Documentation
    ├── TAB_ACCOUNT_BUSINESS.md
    │   ├── Field specifications
    │   ├── Validation schemas
    │   └── References: API_DOCUMENTATION.md
    │
    ├── TAB_AI_CONFIGURATION.md
    │   ├── Field specifications
    │   ├── Validation schemas
    │   └── References: API_DOCUMENTATION.md
    │
    ├── TAB_ORDER_SETTINGS.md
    │   ├── Field specifications
    │   ├── Validation schemas
    │   └── References: API_DOCUMENTATION.md
    │
    ├── TAB_NOTIFICATIONS.md
    │   ├── Field specifications
    │   ├── Validation schemas
    │   └── References: API_DOCUMENTATION.md
    │
    └── TAB_ADVANCED.md
        ├── Field specifications
        ├── Validation schemas
        └── References: API_DOCUMENTATION.md
```

## Quick Links by Task

### When Creating Backend APIs
1. **[API Documentation](./API_DOCUMENTATION.md)** - Endpoint specifications
2. **[Tab Documentation](./TAB_*.md)** - Field details and validation
3. **[Quick Reference](./QUICK_REFERENCE.md)** - Validation rules and defaults

### When Creating Frontend Components
1. **[Architecture Overview](./ARCHITECTURE.md)** - Component structure
2. **[UI/UX Specifications](./UI_UX_SPECIFICATIONS.md)** - Component design
3. **[Tab Documentation](./TAB_*.md)** - Form layouts and interactions
4. **[Quick Reference](./QUICK_REFERENCE.md)** - Tooltips and help text

### When Writing Tooltips/Help Text
1. **[UI/UX Specifications](./UI_UX_SPECIFICATIONS.md)** - Tooltip library
2. **[Quick Reference](./QUICK_REFERENCE.md)** - All tooltips in table format
3. **[Tab Documentation](./TAB_*.md)** - Field-specific help text

### When Validating Forms
1. **[Tab Documentation](./TAB_*.md)** - Validation schemas (Zod)
2. **[API Documentation](./API_DOCUMENTATION.md)** - Server-side validation
3. **[Quick Reference](./QUICK_REFERENCE.md)** - Validation rules summary

## File Organization

All documentation files are in: `documentation/modules/features/vendor-settings/`

See **[STRUCTURE.md](./STRUCTURE.md)** for detailed file organization and cross-reference map.

```
documentation/modules/features/vendor-settings/
├── INDEX.md (this file) ⭐ START HERE
├── README.md
├── STRUCTURE.md (file organization guide)
├── QUICK_REFERENCE.md
├── ARCHITECTURE.md
├── UI_UX_SPECIFICATIONS.md
├── API_DOCUMENTATION.md
├── TAB_ACCOUNT_BUSINESS.md
├── TAB_AI_CONFIGURATION.md
├── TAB_ORDER_SETTINGS.md
├── TAB_NOTIFICATIONS.md
└── TAB_ADVANCED.md
```

## Implementation Checklist Reference

### Backend Implementation
- [ ] Review [API Documentation](./API_DOCUMENTATION.md) implementation checklist
- [ ] Create missing API endpoints
- [ ] Update existing API endpoints
- [ ] Add validation schemas
- [ ] Test all endpoints

### Frontend Implementation
- [ ] Review [Architecture Overview](./ARCHITECTURE.md) for component structure
- [ ] Create Settings page component
- [ ] Create tab components (reference tab documentation)
- [ ] Create form components (reference UI/UX Specifications)
- [ ] Add tooltips and help text (reference Quick Reference)
- [ ] Implement validation (reference tab documentation schemas)
- [ ] Integrate with APIs (reference API Documentation)

## Related Documentation

- [Order Delivery](../order-delivery/) - Related order configuration
- [Product Matching](../product-matching/) - Product matching details
- [Multi-Stage AI](../multi-stage-ai/) - Legacy pipeline doc; production AI processing has since moved to the LLM-1 + CartEngine (+ optional LLM-2) pipeline in `backend/src/conversation/*` — see `docs/CONVERSATION_PROCESSOR_LAMBDA.md`

## Status

**Documentation Status**: ✅ Complete (as a Dec 2024 implementation plan — not a current-state description)
**Implementation Status**: 🟡 Partially built — see note below
**Last Updated**: December 2024

> **Implementation reality check (Sep 2026)**: The Settings page this plan describes was largely built (`frontend_v2/apps/web-vendor/src/pages/Settings.tsx` and `components/settings/`), and most backend endpoints listed as "missing" throughout this doc set now exist (`business-info`, `notification-settings`, `matching-config`, `timezone`, phone/email verification). However, several described UI sections were never implemented client-side even though their backend/schema support exists: AI Model selection, Order Settings' preparation-time-type configuration, Notifications' per-status toggles and quiet hours, and Advanced tab's product-field mapping / language-support / AI-matching-model dropdowns. Each affected file below has been annotated accordingly — verify against the actual components under `frontend_v2/apps/web-vendor/src/components/settings/` before treating any single-field claim here as current.

---

**Next Steps**: 
1. **First**: Review [Open Questions](./OPEN_QUESTIONS.md) and make decisions ✅ **COMPLETED**
2. **Then**: Follow [Implementation Plan](./IMPLEMENTATION_PLAN.md) for phased implementation
3. **Reference**: Use [API Documentation](./API_DOCUMENTATION.md) for backend, [Architecture Overview](./ARCHITECTURE.md) for frontend

