# Vendor Settings Page - UI/UX Specifications

> **📚 Related Documentation**: [Documentation Index](./INDEX.md) | [Architecture Overview](./ARCHITECTURE.md) | [Tab Documentation](./TAB_*.md) | [Quick Reference](./QUICK_REFERENCE.md)

## Overview

This document provides detailed UI/UX specifications for the Vendor Settings page, with emphasis on clarity, tooltips, help text, and clear instructions. Since multiple vendors with different configurations will use this page, every field must be self-explanatory with contextual help.

## Design Principles

1. **Self-Explanatory**: Every field should have clear labels, help text, and tooltips
2. **Progressive Disclosure**: Show information when needed, hide complexity
3. **Contextual Help**: Tooltips and help text explain "why" not just "what"
4. **Visual Hierarchy**: Clear distinction between sections, fields, and actions
5. **Error Prevention**: Validation and helpful guidance prevent mistakes
6. **Examples Everywhere**: Show examples for complex fields
7. **Status Indicators**: Visual feedback for all states (saved, error, loading)

## Global UI Components

### Tooltip Component

**Design**:
- Light gray background (#374151)
- White text
- 12px font size
- Rounded corners (4px)
- Shadow (0 4px 6px rgba(0,0,0,0.1))
- Max width: 300px
- Arrow pointing to trigger element
- Appears on hover (desktop) or tap (mobile)
- Delay: 300ms before showing

**Usage**:
- Info icon (ℹ️) next to field labels
- Question mark icon (?) for complex fields
- Hover/tap to reveal tooltip

### Help Text Component

**Design**:
- Gray text (#6B7280)
- 14px font size
- Below input field
- Italic style
- Max 2 lines, then truncate with "Read more" link

**Usage**:
- Always visible below fields
- Explains what the field does and why it matters
- Includes examples when helpful

### Note Component

**Design**:
- Light blue background (#EFF6FF)
- Blue border left (4px solid #3B82F6)
- Blue text (#1E40AF)
- Padding: 12px
- Rounded corners (4px)
- Info icon (ℹ️) on left

**Usage**:
- Important information that affects behavior
- Warnings about changes
- Tips for best practices

### Warning Component

**Design**:
- Light yellow background (#FEF3C7)
- Yellow border left (4px solid #F59E0B)
- Yellow text (#92400E)
- Warning icon (⚠️) on left

**Usage**:
- Warnings about potential issues
- Changes that affect existing orders
- Cost implications

### Example Component

**Design**:
- Light gray background (#F9FAFB)
- Gray border (1px solid #E5E7EB)
- Monospace font for code examples
- Padding: 8px
- Rounded corners (4px)
- "Example:" label in smaller gray text

**Usage**:
- Show example values
- Format examples
- Sample outputs

## Page Layout

### Header Section

```
┌─────────────────────────────────────────────────────────┐
│ ⚙️ Settings                                              │
│                                                          │
│ Configure your ChatLogix account settings. Changes      │
│ are saved automatically when you click Save.             │
│                                                          │
│ [Auto-save: Enabled] [Last saved: 2 minutes ago]        │
└─────────────────────────────────────────────────────────┘
```

**Components**:
- Page title with icon
- Description text
- Auto-save indicator (if implemented)
- Last saved timestamp

### Tab Navigation

```
┌─────────────────────────────────────────────────────────┐
│ [Account] [AI Config] [Orders] [Notifications] [Advanced]│
│ ─────────────────────────────────────────────────────── │
└─────────────────────────────────────────────────────────┘
```

**Design**:
- Horizontal tabs
- Active tab: Blue underline, blue text
- Inactive tabs: Gray text, hover effect
- Badge on tab if unsaved changes: Red dot
- Mobile: Scrollable horizontal tabs

### Content Area

**Layout**:
- White background
- Sections in cards with subtle shadows
- Section headers with icons
- Consistent spacing (24px between sections)
- Max width: 1200px (centered)
- Padding: 24px

### Footer Actions

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│ [Cancel]                    [Save Changes]              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Design**:
- Sticky footer (on scroll)
- Right-aligned action buttons
- Cancel: Gray button, left side
- Save: Primary blue button, right side
- Disabled state when no changes
- Loading spinner in Save button when saving

## Field Component Specifications

### Standard Text Input

**Structure**:
```
┌─────────────────────────────────────────────────────────┐
│ Field Label *                    [ℹ️]                  │
│ ────────────────────────────────────────────────────── │
│ [Input field with placeholder]                           │
│ Help text explaining what this field does and why       │
│                                                          │
│ Example: "VENDI"                                        │
│                                                          │
│ [Note: This affects future orders only]                 │
└─────────────────────────────────────────────────────────┘
```

**Components**:
1. **Label Row**:
   - Field name (bold, 14px)
   - Required indicator (*) in red
   - Info icon (ℹ️) with tooltip
   - Character count (if applicable): "45/100"

2. **Input Field**:
   - Border: 1px solid #D1D5DB
   - Border radius: 6px
   - Padding: 10px 12px
   - Focus: Blue border (#3B82F6), shadow
   - Error: Red border (#EF4444)
   - Disabled: Gray background (#F3F4F6)

3. **Help Text** (always visible):
   - Gray text (#6B7280)
   - 13px font size
   - Explains purpose and impact

4. **Example** (when helpful):
   - Light gray box
   - Shows example value

5. **Note/Warning** (when applicable):
   - Colored box with icon
   - Important information

### Text Area

**Additional Features**:
- Character count: "245 / 5000 characters"
- Word count: "42 words"
- Auto-resize: Up to 6 lines, then scroll
- Formatting toolbar (for prompts): Bold, Italic, Bullets
- Preview button (for prompts)

### Select Dropdown

**Structure**:
```
┌─────────────────────────────────────────────────────────┐
│ Field Label                    [ℹ️]                    │
│ ────────────────────────────────────────────────────── │
│ [Select option ▼]                                      │
│ Help text explaining options                            │
│                                                          │
│ Options:                                                 │
│ • Option 1 - Description                                │
│ • Option 2 - Description                                │
└─────────────────────────────────────────────────────────┘
```

**Features**:
- Searchable dropdown (if many options)
- Option descriptions
- Recommended badge on default option
- Cost/performance indicators (for AI models)

### Toggle Switch

**Structure**:
```
┌─────────────────────────────────────────────────────────┐
│ Field Label                    [ℹ️]                    │
│ ────────────────────────────────────────────────────── │
│ [Toggle Switch: ON/OFF]                                 │
│ Help text explaining what happens when enabled          │
│                                                          │
│ When enabled:                                            │
│ • Feature 1 happens                                       │
│ • Feature 2 happens                                      │
└─────────────────────────────────────────────────────────┘
```

**Design**:
- Large toggle (48px width)
- Smooth animation
- Color: Blue when ON, Gray when OFF
- Clear ON/OFF labels

### Number Input

**Structure**:
```
┌─────────────────────────────────────────────────────────┐
│ Field Label                    [ℹ️]                    │
│ ────────────────────────────────────────────────────── │
│ [Input] [Unit]                                          │
│ Help text with range and examples                        │
│                                                          │
│ Range: 0 - 1440 minutes (24 hours)                      │
│ Example: 60 minutes = 1 hour                            │
└─────────────────────────────────────────────────────────┘
```

**Features**:
- Unit display (minutes, rupees, etc.)
- Min/max indicators
- Step controls (+/- buttons)
- Range validation

### Radio Button Group

**Structure**:
```
┌─────────────────────────────────────────────────────────┐
│ Field Label                    [ℹ️]                    │
│ ────────────────────────────────────────────────────── │
│ ○ Option 1                                              │
│   Description of option 1                                │
│                                                          │
│ ○ Option 2                                              │
│   Description of option 2                                │
│                                                          │
│ ● Option 3 (Selected)                                   │
│   Description of option 3                                │
│                                                          │
│ Help text explaining the options                         │
└─────────────────────────────────────────────────────────┘
```

**Design**:
- Large clickable area (entire row)
- Hover effect
- Selected: Blue fill
- Descriptions below each option

## Tooltip Content Library

### Account & Business Tab

#### Business Name
**Tooltip**: "This is your business name as it appears to customers in conversations and order confirmations. Choose a name that customers will recognize."

#### Business Category
**Tooltip**: "Selecting a category helps us optimize AI responses for your business type. This affects product matching and conversation flow."

#### Phone Number
**Tooltip**: "Your business phone number. This is used for account verification and important system notifications. Changing this number requires verification."

#### Email Address
**Tooltip**: "Your business email address. Used for account notifications, password recovery, and important updates. Must be unique."

#### Subscription Plan
**Tooltip**: "Your current subscription plan determines features and limits. To upgrade or change plans, contact support or visit the Billing page."

#### Wallet Balance
**Tooltip**: "Your wallet balance is used to pay for AI message processing. Each message costs approximately ₹0.002. Recharge through the Billing page."

### AI Configuration Tab

#### Bot Name
**Tooltip**: "Give your AI assistant a friendly name. This name appears in conversations with customers. Examples: 'Sarah', 'BrownieBakerBot', 'Your Store Assistant'."

#### Personality
**Tooltip**: "Describe your bot's personality in a few words. This influences the tone and style of responses. Examples: 'Friendly and helpful', 'Professional and efficient', 'Warm and welcoming'."

#### AI Model
**Tooltip**: "Choose the AI model that powers your bot. GPT-4o-mini is recommended for most businesses as it balances cost (~₹0.002/message) and quality. More powerful models cost more but provide better responses."

#### System Prompt
**Tooltip**: "The system prompt is the most important setting. It defines how your bot behaves, what it knows, and how it responds. Be specific and clear. Longer prompts provide more context but cost more per message."

#### Product Information
**Tooltip**: "Provide information about your products that the AI should know. This can include descriptions, categories, pricing, or special features. You can import this from your product catalog or write it manually."

#### Greeting Message
**Tooltip**: "The first message customers see when starting a conversation. Make it welcoming and informative. Keep it concise (under 100 characters recommended)."

#### Closing Message
**Tooltip**: "A friendly message sent when wrapping up conversations. Use this to thank customers and encourage future orders."

#### Responsibilities
**Tooltip**: "Define what your AI bot is responsible for. Be specific about tasks, limitations, and boundaries. This helps the AI understand its role."

#### Conversation Rules
**Tooltip**: "Rules and guidelines for how the AI should conduct conversations. Define tone, style, and conversation flow. These rules are applied to every conversation."

#### Important Instructions
**Tooltip**: "Critical instructions that override default behavior. Use this for business-specific rules that must always be followed, such as minimum order values or delivery restrictions."

#### Preparation Time
**Tooltip**: "Default preparation time in minutes. This is used when calculating delivery estimates. Can be overridden by order-specific settings in the Order Settings tab."

### Order Settings Tab

#### Order Prefix
**Tooltip**: "A 5-letter prefix for your order numbers. This makes orders easier to identify. Once set, it applies to all future orders. Example: 'VENDI' creates orders like 'VENDI-20241228-001'."

#### Minimum Order Value
**Tooltip**: "Set a minimum order value in rupees. Orders below this amount will be rejected with an error message. Leave empty for no minimum. This helps ensure orders are worth processing."

#### Ask for Preferred Delivery Date
**Tooltip**: "When enabled, the AI will ask customers for their preferred delivery date during order placement. When disabled, the AI uses only the preparation time to estimate delivery."

#### Preparation Time Type
**Tooltip**: "Choose how preparation time is calculated. 'After Order' starts counting when order is confirmed. 'Fixed Minutes' uses the same time for all orders. 'Variable' adjusts based on order complexity. 'Ready to Ship' means no preparation needed."

#### Fixed Minutes
**Tooltip**: "The fixed number of minutes needed to prepare any order. This is added to the order confirmation time to calculate when the order will be ready."

#### Base Minutes (Variable)
**Tooltip**: "The base preparation time in minutes that applies to all orders, regardless of size or complexity."

#### Minutes Per Item (Variable)
**Tooltip**: "Additional minutes added for each item in the order. This accounts for the extra time needed to prepare multiple items."

#### Maximum Minutes (Variable)
**Tooltip**: "The maximum preparation time cap. Even if the calculated time exceeds this, the preparation time will be capped at this value. Prevents unrealistic estimates for very large orders."

### Notifications Tab

#### Order Updates
**Tooltip**: "Send automatic notifications to customers when their order status changes (confirmed, preparing, ready, etc.). This keeps customers informed without manual effort."

#### Payment Links
**Tooltip**: "Automatically send payment links to customers when orders are confirmed. This streamlines the payment process."

#### Shipping Updates
**Tooltip**: "Send notifications when orders are out for delivery or delivered. This improves customer experience and reduces support inquiries."

#### Enabled Order Statuses
**Tooltip**: "Select which order status changes trigger notifications. Only selected statuses will send notifications. This helps you control notification frequency."

#### Quiet Hours
**Tooltip**: "Prevent notifications from being sent during specified hours. This respects customer rest times and avoids sending messages too early or too late."

### Advanced Tab

#### Matching Threshold
**Tooltip**: "The similarity score (0.0 to 1.0) required for product matching. Higher values (0.8-0.9) require exact matches. Lower values (0.6-0.7) allow more flexible matching. Recommended: 0.7 for most businesses."

#### Enable Fuzzy Matching
**Tooltip**: "Allow matching products even with slight spelling variations or typos. This improves matching accuracy when customers misspell product names."

#### Enable AI Matching
**Tooltip**: "Use AI to understand customer intent and match products even when names don't match exactly. This is more powerful but costs more per match."

#### Supported Languages
**Tooltip**: "Select languages your customers use. The AI will understand and respond in these languages. This improves matching and conversation quality."

#### Timezone
**Tooltip**: "Your business timezone. This affects order timestamps, delivery estimates, and quiet hours. Select the timezone where your business operates."

## Help Text Examples

### Account & Business Tab

**Business Name**:
"Enter your business name as it appears to customers. This name is used in conversations, order confirmations, and customer communications. Maximum 100 characters."

**Phone Number**:
"Your business phone number in international format (e.g., +919876543210). This number is used for account verification and important notifications. Changing this number requires verification."

**Email Address**:
"Your business email address. Used for account notifications, password recovery, and important system updates. Must be a valid, unique email address."

### AI Configuration Tab

**System Prompt**:
"The system prompt is the most important setting for your AI bot. It defines how the bot behaves, what it knows, and how it responds to customers. Be specific and clear. Include information about your business, products, policies, and desired conversation style. Longer prompts provide more context but increase cost per message. Recommended: 500-2000 characters."

**Product Information**:
"Provide detailed information about your products that the AI should know. Include product names, descriptions, categories, pricing, and any special features. You can import this automatically from your product catalog or write it manually. This information helps the AI answer product questions accurately."

**Greeting Message**:
"The first message customers see when starting a conversation. Make it welcoming and informative. Keep it concise (under 100 characters recommended). Include your business name and how you can help. Example: 'Hello! Welcome to Brownie Bakery! How can I help you today?'"

### Order Settings Tab

**Order Prefix**:
"A 5-letter uppercase prefix for your order numbers. This makes orders easier to identify and reference. Once set, it applies to all future orders. Existing orders keep their original prefix. Example: 'VENDI' creates orders like 'VENDI-20241228-001'."

**Minimum Order Value**:
"Set a minimum order value in rupees. Orders below this amount will be rejected with an error message asking customers to add more items. Leave empty for no minimum. This helps ensure orders are worth processing and covers delivery costs."

**Preparation Time Type - Variable**:
"Variable preparation time adjusts based on order complexity. Set a base time that applies to all orders, then add time per item. Optionally set a maximum cap. Example: Base 30 min + 5 min per item, max 120 min. An order with 3 items = 45 minutes. An order with 20 items = 120 minutes (capped)."

### Notifications Tab

**Quiet Hours**:
"Prevent notifications from being sent during specified hours. This respects customer rest times and avoids sending messages too early in the morning or too late at night. Notifications scheduled during quiet hours will be sent after quiet hours end."

## Visual Indicators

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
- Red border on field
- Error icon
- Error message below field
- Toast notification for server errors

### Success State
- Green toast notification
- "Settings saved successfully"
- Auto-dismiss after 3 seconds

## Mobile Responsiveness

### Breakpoints
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

### Mobile Adaptations
- Tabs: Horizontal scroll
- Sections: Full width, stacked
- Tooltips: Tap to show, tap outside to dismiss
- Forms: Full width inputs
- Buttons: Full width, stacked vertically
- Help text: Always visible (no hover)

### Touch Targets
- Minimum 44px height
- Adequate spacing between elements
- Large tap areas for toggles and buttons

## Accessibility Features

### Keyboard Navigation
- Tab through all fields
- Enter to submit
- Escape to cancel
- Arrow keys for radio buttons
- Space/Enter for toggles

### Screen Reader Support
- All fields have labels
- Help text announced
- Tooltips accessible via keyboard
- Status messages announced
- Error messages announced

### Focus Indicators
- Blue outline (2px solid)
- Visible on all interactive elements
- Maintains focus order

## Examples and Templates

### System Prompt Template

**Basic Template**:
```
You are a helpful assistant for [Business Name]. Your role is to:
- Answer customer questions about products
- Help customers place orders
- Provide information about delivery and pricing
- Be friendly, professional, and concise

Guidelines:
- Always confirm order details before finalizing
- Ask clarifying questions when needed
- Use the customer's name when known
```

**Advanced Template**:
```
You are [Bot Name], the AI assistant for [Business Name], a [Category] business.

Your responsibilities:
1. Product inquiries: Answer questions about products, prices, availability
2. Order assistance: Help customers place orders through natural conversation
3. Order updates: Provide status updates on existing orders
4. Customer service: Handle complaints, returns, and general inquiries

Important rules:
- Minimum order value: ₹[Amount]
- Delivery available: [Areas]
- Payment: [Payment methods]
- Returns: [Return policy]

Conversation style:
- Be polite and professional
- Use the customer's name when known
- Confirm order details before finalizing
- Ask one question at a time
```

### Order Prefix Examples

**Examples**:
- "VENDI" → VENDI-20241228-001
- "BAKER" → BAKER-20241228-001
- "SHOP1" → SHOP1-20241228-001

**Format Explanation**:
- Prefix: Your 5-letter code
- Date: YYYYMMDD format
- Sequence: 3-digit number (resets daily)

### Preparation Time Examples

**Fixed Minutes**:
- 60 minutes → Order at 2:00 PM = Ready at 3:00 PM

**Variable**:
- Base: 30 min, Per item: 5 min, Max: 120 min
- 1 item: 35 minutes
- 5 items: 55 minutes
- 20 items: 120 minutes (capped)

## Best Practices

### Writing Help Text
1. Start with what the field does
2. Explain why it matters
3. Provide examples
4. Mention any limitations or side effects
5. Keep it concise (1-2 sentences)

### Writing Tooltips
1. One key insight or tip
2. Maximum 2 sentences
3. Focus on "why" not "what"
4. Include examples when helpful

### Writing Notes
1. Use for important information
2. Explain impact of changes
3. Warn about side effects
4. Provide actionable guidance

### Visual Hierarchy
1. Most important fields at top
2. Related fields grouped together
3. Clear section separation
4. Consistent spacing
5. Visual indicators for status

## Implementation Notes

### Tooltip Library
Create a reusable tooltip component that:
- Accepts content as prop
- Handles positioning automatically
- Works on hover (desktop) and tap (mobile)
- Accessible via keyboard

### Help Text Component
Create a reusable help text component that:
- Always visible below fields
- Supports markdown formatting
- Can expand/collapse for long text
- Accessible to screen readers

### Note Component
Create reusable note/warning components:
- InfoNote: Blue background, info icon
- WarningNote: Yellow background, warning icon
- ErrorNote: Red background, error icon

### Example Component
Create a reusable example component:
- Light gray background
- Monospace font for code
- Supports multiple examples
- Copy-to-clipboard functionality

