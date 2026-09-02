# Vendor Settings - Quick Reference Guide

> **📚 Related Documentation**: [Documentation Index](./INDEX.md) | [UI/UX Specifications](./UI_UX_SPECIFICATIONS.md) | [Tab Documentation](./TAB_*.md)

## Overview

This quick reference guide provides a condensed view of all tooltips, help text, and UI components for the Vendor Settings page. Use this during implementation for quick access to field specifications.

> **Implementation status (Sep 2026)**: this is a Dec 2024 design-spec reference — most tooltip/field content below describes fields that were never built into the shipped tabs (AI Model, Enabled Order Statuses, Quiet Hours, Preparation Time Type and its sub-fields, Product Name/Keywords/Price Field, Supported Languages, AI Matching Model). See each `TAB_*.md` file's status note for exactly what's live vs. spec-only. Two entries below are also factually wrong regardless of build status: the AI Model default is `gpt-4.1-mini` in code, not `gpt-4o-mini`, and there is no vendor-facing AI Model control at all; and the Order Prefix isn't required to be "exactly 5" letters — it's validated as up to 5 uppercase letters/digits.

## Tooltip Quick Reference

### Account & Business Tab

| Field | Tooltip |
|-------|---------|
| Business Name | "This is your business name as it appears to customers in conversations and order confirmations. Choose a name that customers will recognize." |
| Business Category | "Selecting a category helps us optimize AI responses for your business type. This affects product matching and conversation flow." |
| Phone Number | "Your business phone number. This is used for account verification and important system notifications. Changing this number requires verification." |
| Email Address | "Your business email address. Used for account notifications, password recovery, and important updates. Must be unique." |
| Subscription Plan | "Your current subscription plan determines features and limits. To upgrade or change plans, contact support or visit the Billing page." |
| Wallet Balance | "Your wallet balance is used to pay for AI message processing. Each message costs approximately ₹0.002. Recharge through the Billing page." |

### AI Configuration Tab

| Field | Tooltip |
|-------|---------|
| Bot Name | "Give your AI assistant a friendly name. This name appears in conversations with customers. Examples: 'Sarah', 'BrownieBakerBot', 'Your Store Assistant'." |
| Personality | "Describe your bot's personality in a few words. This influences the tone and style of responses. Examples: 'Friendly and helpful', 'Professional and efficient', 'Warm and welcoming'." |
| AI Model | "Choose the AI model that powers your bot. GPT-4o-mini is recommended for most businesses as it balances cost (~₹0.002/message) and quality. More powerful models cost more but provide better responses." |
| System Prompt | "The system prompt is the most important setting. It defines how your bot behaves, what it knows, and how it responds. Be specific and clear. Longer prompts provide more context but cost more per message." |
| Product Information | "Provide information about your products that the AI should know. This can include descriptions, categories, pricing, or special features. You can import this from your product catalog or write it manually." |
| Greeting Message | "The first message customers see when starting a conversation. Make it welcoming and informative. Keep it concise (under 100 characters recommended)." |
| Closing Message | "A friendly message sent when wrapping up conversations. Use this to thank customers and encourage future orders." |
| Responsibilities | "Define what your AI bot is responsible for. Be specific about tasks, limitations, and boundaries. This helps the AI understand its role." |
| Conversation Rules | "Rules and guidelines for how the AI should conduct conversations. Define tone, style, and conversation flow. These rules are applied to every conversation." |
| Important Instructions | "Critical instructions that override default behavior. Use this for business-specific rules that must always be followed, such as minimum order values or delivery restrictions." |
| Preparation Time | "Default preparation time in minutes. This is used when calculating delivery estimates. Can be overridden by order-specific settings in the Order Settings tab." |

### Order Settings Tab

| Field | Tooltip |
|-------|---------|
| Order Prefix | "A 5-letter prefix for your order numbers. This makes orders easier to identify. Once set, it applies to all future orders. Example: 'VENDI' creates orders like 'VENDI-20241228-001'." |
| Minimum Order Value | "Set a minimum order value in rupees. Orders below this amount will be rejected with an error message. Leave empty for no minimum. This helps ensure orders are worth processing." |
| Ask for Preferred Delivery Date | "When enabled, the AI will ask customers for their preferred delivery date during order placement. When disabled, the AI uses only the preparation time to estimate delivery." |
| Preparation Time Type | "Choose how preparation time is calculated. 'After Order' starts counting when order is confirmed. 'Fixed Minutes' uses the same time for all orders. 'Variable' adjusts based on order complexity. 'Ready to Ship' means no preparation needed." |
| Fixed Minutes | "The fixed number of minutes needed to prepare any order. This is added to the order confirmation time to calculate when the order will be ready." |
| Base Minutes (Variable) | "The base preparation time in minutes that applies to all orders, regardless of size or complexity." |
| Minutes Per Item (Variable) | "Additional minutes added for each item in the order. This accounts for the extra time needed to prepare multiple items." |
| Maximum Minutes (Variable) | "The maximum preparation time cap. Even if the calculated time exceeds this, the preparation time will be capped at this value. Prevents unrealistic estimates for very large orders." |

### Notifications Tab

| Field | Tooltip |
|-------|---------|
| Order Updates | "Send automatic notifications to customers when their order status changes (confirmed, preparing, ready, etc.). This keeps customers informed without manual effort." |
| Payment Links | "Automatically send payment links to customers when orders are confirmed. This streamlines the payment process." |
| Shipping Updates | "Send notifications when orders are out for delivery or delivered. This improves customer experience and reduces support inquiries." |
| Enabled Order Statuses | "Select which order status changes trigger notifications. Only selected statuses will send notifications. This helps you control notification frequency." |
| Quiet Hours | "Prevent notifications from being sent during specified hours. This respects customer rest times and avoids sending messages too early or too late." |

### Advanced Tab

| Field | Tooltip |
|-------|---------|
| Matching Threshold | "The similarity score (0.0 to 1.0) required for product matching. Higher values (0.8-0.9) require exact matches. Lower values (0.6-0.7) allow more flexible matching. Recommended: 0.7 for most businesses." |
| Enable Fuzzy Matching | "Allow matching products even with slight spelling variations or typos. This improves matching accuracy when customers misspell product names." |
| Enable AI Matching | "Use AI to understand customer intent and match products even when names don't match exactly. This is more powerful but costs more per match." |
| Supported Languages | "Select languages your customers use. The AI will understand and respond in these languages. This improves matching and conversation quality." |
| Timezone | "Your business timezone. This affects order timestamps, delivery estimates, and quiet hours. Select the timezone where your business operates." |

## Help Text Quick Reference

### Common Patterns

**Text Inputs**:
- "Enter [what] as it appears to [who]. [How it's used]. [Limitations/format]."

**Select Dropdowns**:
- "Select [what]. [Why it matters]. [Impact on system]."

**Toggles**:
- "When enabled, [what happens]. [Benefits]. When disabled, [what happens]."

**Number Inputs**:
- "[What] in [unit]. [Range/limits]. [How it's used]. Example: [example]."

**Text Areas**:
- "[What] for [purpose]. [Guidelines]. [Character limit]. [Best practices]."

## UI Component Specifications

### Tooltip Component
- Background: #374151 (gray-700)
- Text: White
- Font: 12px
- Max width: 300px
- Arrow pointing to trigger
- Delay: 300ms
- Hover (desktop) / Tap (mobile)

### Help Text Component
- Color: #6B7280 (gray-500)
- Font: 14px
- Position: Below input field
- Style: Italic
- Max 2 lines, then "Read more"

### Note Component (Info)
- Background: #EFF6FF (blue-50)
- Border: 4px solid #3B82F6 (blue-500) left
- Text: #1E40AF (blue-800)
- Icon: ℹ️
- Padding: 12px

### Warning Component
- Background: #FEF3C7 (yellow-100)
- Border: 4px solid #F59E0B (yellow-500) left
- Text: #92400E (yellow-800)
- Icon: ⚠️
- Padding: 12px

### Example Component
- Background: #F9FAFB (gray-50)
- Border: 1px solid #E5E7EB (gray-200)
- Font: Monospace
- Padding: 8px
- Label: "Example:" in smaller gray text

## Character Limits

| Field | Limit |
|-------|-------|
| Business Name | 100 |
| Bot Name | 50 |
| Personality | 500 |
| System Prompt | 5000 |
| Product Information | 10000 |
| Greeting Message | 500 |
| Closing Message | 500 |
| Responsibilities | 2000 |
| Conversation Rules | 2000 |
| Important Instructions | 2000 |
| Order Prefix | 5 (exact) |

## Validation Rules

### Order Prefix
- Up to 5 characters (not required to be exactly 5 — actual schema: `z.string().max(5).regex(/^[A-Z0-9]*$/)`)
- Uppercase letters and digits (not letters-only)
- No spaces or other special characters
- Auto-convert to uppercase (frontend behavior; not enforced server-side)

### Minimum Order Value
- Positive integer
- Display in rupees, store in paise
- Can be empty (no minimum)

### Preparation Time
- Integer (whole number)
- Range: 0 - 1440 minutes (24 hours)
- Cannot be negative

### Matching Threshold
- Number between 0.0 and 1.0
- Step: 0.1
- Default: 0.7

### Quiet Hours
- Time format: HH:MM (24-hour)
- Start and end must be different
- Required when quiet hours enabled

## Default Values

| Field | Default |
|-------|---------|
| AI Model | `"gpt-4.1-mini"` in code (Prisma default on `Vendor.aiModel`), not `"gpt-4o-mini"` — and there's no UI control to change it (see `TAB_AI_CONFIGURATION.md`) |
| Matching Threshold | 0.7 |
| Enable Fuzzy Matching | true |
| Enable AI Matching | true |
| Supported Languages | ["en"] |
| Timezone | "Asia/Kolkata" |
| Order Updates | true |
| Payment Links | true |
| Shipping Updates | true |
| Ask for Preferred Delivery Date | false |
| Quiet Hours Enabled | false |
| Quiet Hours Start | "22:00" |
| Quiet Hours End | "09:00" |

## Cost Indicators

| Feature | Cost |
|---------|------|
| AI Message (GPT-4o-mini) | ~₹0.002 per message |
| AI Matching | ~₹0.001 per match attempt |
| GPT-4o Model | Higher cost (varies) |

## Status Indicators

### Saved State
- Green checkmark icon
- "Saved" text in green
- Fade out after 3 seconds

### Unsaved Changes
- Red dot on tab
- "Unsaved changes" text in footer
- Warning icon next to Save button

### Loading State
- Spinner in Save button
- "Saving..." text
- Disable form inputs

### Error State
- Red border on field (#EF4444)
- Error icon
- Error message below field
- Toast notification for server errors

## Mobile Adaptations

- Tabs: Horizontal scroll
- Sections: Full width, stacked
- Tooltips: Tap to show, tap outside to dismiss
- Forms: Full width inputs
- Buttons: Full width, stacked vertically
- Help text: Always visible (no hover)

## Accessibility

- All inputs have labels
- Tooltips accessible via keyboard
- Screen reader announcements
- Focus indicators (2px blue outline)
- Keyboard navigation support

## Related Documentation

- [UI/UX Specifications](./UI_UX_SPECIFICATIONS.md) - Complete UI component specifications
- [Account & Business Tab](./TAB_ACCOUNT_BUSINESS.md) - Detailed account settings
- [AI Configuration Tab](./TAB_AI_CONFIGURATION.md) - Detailed AI settings
- [Order Settings Tab](./TAB_ORDER_SETTINGS.md) - Detailed order settings
- [Notifications Tab](./TAB_NOTIFICATIONS.md) - Detailed notification settings
- [Advanced Tab](./TAB_ADVANCED.md) - Detailed advanced settings
- [Architecture](./ARCHITECTURE.md) - Technical architecture

