# Order Delivery & Preparation Settings Feature

## Overview

This feature enables food vendors (and other vendors) to configure order delivery preferences and preparation time settings. Vendors can:

1. **Ask customers for preferred delivery date** - For food vendors who prepare orders after placement
2. **Configure order preparation time** - Set how long orders take to prepare (after order, fixed minutes, variable, or ready-to-ship)

## Business Goal

Enable vendors to customize their order flow based on their business model:
- **Food vendors**: Often need to ask for preferred delivery date since orders are prepared fresh
- **Retail vendors**: May have ready-to-ship products or fixed preparation times
- **Service vendors**: May have variable preparation times

## Feature Components

### 1. Vendor Settings
- **Category**: Vendor business category (food, retail, service, etc.)
- **Ask for Preferred Delivery Date**: Boolean flag to enable/disable asking customers for delivery date
- **Order Preparation Config**: Flexible configuration for preparation time messaging

### 2. AI Integration
- AI automatically asks for preferred delivery date when:
  - Vendor category is "food"
  - `askForPreferredDeliveryDate` is enabled
  - Delivery date is not already provided
- AI uses preparation time config to provide appropriate messaging

> **2026-09 note:** the "AI asks for delivery date" behavior above is implemented in the old, pre-Lambda pipeline (`promptBuilderService.ts`), which is no longer on the hot path for live WhatsApp traffic — see `docs/CONVERSATION_WORKER_GAPS.md`. The current live pipeline (`backend/src/conversation/*`) treats delivery date as advisory prep-timing copy only and never has the AI ask for or promise a date; see [Order Flow](./ORDER_FLOW.md) for details.

### 3. Order Validation
- Validates that preferred delivery date is provided when required
- Ensures order can only be confirmed with all required information

## Documentation Structure

- **[Implementation Guide](./IMPLEMENTATION_GUIDE.md)** - Step-by-step implementation details
- **[API Documentation](./API_DOCUMENTATION.md)** - API endpoints and usage
- **[Configuration Guide](./CONFIGURATION_GUIDE.md)** - How to configure settings
- **[Flow Documentation](./ORDER_FLOW.md)** - Order flow with delivery date
- **[Migration Guide](./MIGRATION_GUIDE.md)** - Migrating from aiPreparationTimeMinutes

## Related Documentation

- [Order New Intent](../../ai_processing/03_order_new.md) - Order placement flow
- [Multi-Stage AI Processing](../multi-stage-ai/) - AI processing pipeline
- [Intent Classification](../intent-classification/) - Intent handling

