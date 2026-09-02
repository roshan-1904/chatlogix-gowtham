# Vendor Settings Page Documentation

## Overview

The Vendor Settings page is a comprehensive configuration interface that allows vendors to manage all aspects of their ChatLogix account, including AI behavior, business information, order preferences, notifications, and advanced settings.

## Primary Goal

Enable vendors to configure their ChatLogix account settings independently, ensuring their AI assistant behaves according to their business needs and preferences, ultimately supporting the platform's goal of automating 90% of vendor time spent on repetitive customer questions.

## Table of Contents

**📚 Start Here**: 
- **[Documentation Index](./INDEX.md)** - Complete navigation guide
- **[Open Questions](./OPEN_QUESTIONS.md)** ⚠️ **REVIEW FIRST** - Questions and decisions needed ✅ **DECISIONS MADE**
- **[Implementation Plan](./IMPLEMENTATION_PLAN.md)** 🎯 **START HERE** - Complete phased implementation guide
- **[File Structure](./STRUCTURE.md)** - File organization and cross-references

1. [Quick Reference](./QUICK_REFERENCE.md) - Quick access to tooltips and help text
2. [Architecture Overview](./ARCHITECTURE.md) - Technical architecture and component structure
3. [UI/UX Specifications](./UI_UX_SPECIFICATIONS.md) - Complete UI component specifications
4. [API Documentation](./API_DOCUMENTATION.md) - Complete API specifications and status

### Tab Documentation

5. [Account & Business Tab](./TAB_ACCOUNT_BUSINESS.md) - Business information management
6. [AI Configuration Tab](./TAB_AI_CONFIGURATION.md) - AI bot configuration
7. [Order Settings Tab](./TAB_ORDER_SETTINGS.md) - Order processing configuration
8. [Notifications Tab](./TAB_NOTIFICATIONS.md) - Notification preferences
9. [Advanced Tab](./TAB_ADVANCED.md) - Advanced settings (matching, timezone)

### Additional Resources

10. [Open Questions](./OPEN_QUESTIONS.md) ⚠️ **REVIEW FIRST** - Questions and decisions needed before implementation
11. [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Complete implementation guide with phases, timeline, and strategy
12. [File Structure](./STRUCTURE.md) - File organization and cross-reference map

## Features Overview

### 1. Account & Business Tab
- Business information management
- Contact details (phone, email)
- Subscription information display
- Business category selection

### 2. AI Configuration Tab
- Bot identity and personality
- AI model selection
- System prompts and conversation templates
- AI content sections (responsibilities, rules, instructions)
- Preparation time configuration

### 3. Order Settings Tab
- Order prefix customization
- Minimum order value
- Delivery date preferences
- Preparation time configuration (flexible types)

### 4. Notifications Tab
- Notification preferences (order updates, payment links, shipping)
- Order status notification settings
- Quiet hours configuration

### 5. Advanced Tab
- Product matching configuration
- Timezone settings
- Language support configuration

## Key Design Principles

1. **Self-Explanatory**: Every field has clear labels, help text, and tooltips
2. **User-Centric**: Intuitive interface that doesn't require technical knowledge
3. **Progressive Disclosure**: Organize settings into logical tabs and sections
4. **Contextual Help**: Tooltips and help text explain "why" not just "what"
5. **Examples Everywhere**: Show examples for complex fields
6. **Validation**: Real-time validation with helpful error messages
7. **Visual Indicators**: Clear feedback for all states (saved, error, loading)
8. **Auto-Save**: Draft saving to prevent data loss
9. **Responsive**: Works seamlessly on desktop and mobile devices
10. **Accessible**: Follows WCAG guidelines for accessibility

## Technical Stack

- **Frontend Framework**: React 18+ with TypeScript
- **Form Management**: React Hook Form + Zod validation
- **State Management**: TanStack Query for server state
- **UI Components**: Custom components from `@chatlogix/ui`
- **Styling**: TailwindCSS with design tokens
- **API Client**: `@chatlogix/api-client` for API calls

## Related Documentation

- [Order Delivery](../order-delivery/) - Related order configuration
- [Product Matching](../product-matching/) - Product matching configuration details
- [Multi-Stage AI](../multi-stage-ai/) - Legacy pipeline doc; production AI processing has since moved to the LLM-1 + CartEngine (+ optional LLM-2) pipeline in `backend/src/conversation/*` — see `docs/CONVERSATION_PROCESSOR_LAMBDA.md`

## Status

**Documentation Status**: ✅ Complete (as a Dec 2024 implementation plan — not a current-state description)
**Decisions Status**: ✅ All Decisions Made (Dec 2024)
**Implementation Status**: 🟡 Partially built — the Settings page shipped (`frontend_v2/apps/web-vendor/src/pages/Settings.tsx`), but several sections described in this doc set (AI model selection, order preparation-time config, notification quiet hours/per-status toggles, advanced matching field-mapping/language UI) were never added to the UI even though their backend support exists. See each tab doc for specifics.
**Last Updated**: December 2024

## Quick Start

1. ✅ **Decisions Made**: All questions answered in [Open Questions](./OPEN_QUESTIONS.md)
2. 🎯 **Start Implementation**: Follow [Implementation Plan](./IMPLEMENTATION_PLAN.md)
3. 📚 **Reference Docs**: Use [Quick Reference](./QUICK_REFERENCE.md) during development

