# AI Configuration Tab - Detailed Documentation

> **📚 Related Documentation**: [API Documentation](./API_DOCUMENTATION.md#2-ai-configuration-apis) | [UI/UX Specifications](./UI_UX_SPECIFICATIONS.md) | [Quick Reference](./QUICK_REFERENCE.md)

## Overview

The AI Configuration tab is the most comprehensive settings section, allowing vendors to customize how their AI assistant behaves, responds, and interacts with customers. This tab controls the personality, knowledge, and behavior of the AI bot.

## Purpose

Enable vendors to:
- Customize their AI bot's identity and personality
- Configure AI model selection and prompts
- Set conversation templates (greeting, closing)
- Define AI responsibilities and conversation rules
- Configure preparation time for orders

## Sections

### 1. Bot Identity

#### Bot Name
- **Field Type**: Text Input
- **Required**: No (optional)
- **Validation**:
  - Maximum length: 50 characters
  - Should be unique and memorable
- **Help Text**: "A friendly name for your AI assistant (e.g., 'BrownieBakerBot', 'Sarah'). This name will be used in conversations."
- **Tooltip**: "Give your AI assistant a friendly name. This name appears in conversations with customers. Examples: 'Sarah', 'BrownieBakerBot', 'Your Store Assistant'."
- **Placeholder**: "Enter bot name"
- **Example**: "BrownieBakerBot", "Sarah", "Your Store Assistant"
- **Character Count**: Show "X / 50 characters"
- **API Field**: `aiBotName`

#### Personality
- **Field Type**: Text Area
- **Required**: No (optional)
- **Validation**:
  - Maximum length: 500 characters
- **Help Text**: "Describe your bot's personality in a few words. Examples: 'Friendly and helpful', 'Professional and efficient', 'Warm and welcoming'"
- **Tooltip**: "Describe your bot's personality in a few words. This influences the tone and style of responses. Examples: 'Friendly and helpful', 'Professional and efficient', 'Warm and welcoming'."
- **Placeholder**: "e.g., Friendly, helpful, and always ready to assist"
- **Character Count**: Show "X / 500 characters"
- **API Field**: `aiPersonality`

### 2. AI Model & System Configuration

#### AI Model Selection
- **Field Type**: Select Dropdown
- **Required**: No (defaults to "gpt-4o-mini")
- **Options**:
  - "gpt-4o-mini" - Fast and cost-effective (Recommended)
  - "gpt-4.1-mini" - Alternative mini model
  - "gpt-4o" - More capable but expensive
  - "gpt-4-turbo" - High performance
- **Default**: "gpt-4o-mini"
- **Help Text**: "Choose the AI model for your bot. GPT-4o-mini is recommended for most businesses as it balances cost and quality."
- **Tooltip**: "Choose the AI model that powers your bot. GPT-4o-mini is recommended for most businesses as it balances cost (~₹0.002/message) and quality. More powerful models cost more but provide better responses."
- **Cost Indicator**: Show estimated cost per message (e.g., "~₹0.002 per message")
- **Note Component**: "ℹ️ Note: More powerful models provide better responses but increase costs. GPT-4o-mini is recommended for most businesses."
- **API Field**: `aiModel`

#### System Prompt
- **Field Type**: Large Text Area (with syntax highlighting)
- **Required**: No (optional but highly recommended)
- **Validation**:
  - Maximum length: 5000 characters
- **Help Text**: "The system prompt is the most important setting for your AI bot. It defines how the bot behaves, what it knows, and how it responds to customers. Be specific and clear. Include information about your business, products, policies, and desired conversation style. Longer prompts provide more context but increase cost per message. Recommended: 500-2000 characters."
- **Tooltip**: "The system prompt is the most important setting. It defines how your bot behaves, what it knows, and how it responds. Be specific and clear. Longer prompts provide more context but cost more per message."
- **Placeholder**: "You are a helpful assistant for [Business Name]..."
- **Features**:
  - Character count indicator: "X / 5000 characters"
  - Word count: "Y words"
  - Preview button (shows how prompt will be used)
  - Template examples dropdown
  - Formatting toolbar (Bold, Italic, Bullets)
- **API Field**: `aiSystemPrompt`
- **Note Component**: "⚠️ Important: This is the most important field for AI behavior. A well-written system prompt significantly improves bot performance. Use the template examples to get started."

**System Prompt Template Examples**:
```markdown
Template 1: Basic
"You are a helpful assistant for [Business Name]. Your role is to:
- Answer customer questions about products
- Help customers place orders
- Provide information about delivery and pricing
- Be friendly, professional, and concise"

Template 2: Detailed
"You are [Bot Name], the AI assistant for [Business Name]. 
Your responsibilities include:
1. Product inquiries: Answer questions about products, prices, availability
2. Order assistance: Help customers place orders through natural conversation
3. Order updates: Provide status updates on existing orders
4. Customer service: Handle complaints, returns, and general inquiries

Guidelines:
- Always be polite and professional
- Use the customer's name when known
- Confirm order details before finalizing
- Ask clarifying questions when needed"
```

### 3. Product Information

#### Product Catalog Description
- **Field Type**: Large Text Area
- **Required**: No (optional)
- **Validation**:
  - Maximum length: 10000 characters
- **Help Text**: "Provide information about your products that the AI should know. This can include product descriptions, categories, pricing information, or any other relevant details."
- **Placeholder**: "Describe your products, categories, and key information..."
- **Features**:
  - Character count
  - Formatting tips
  - Link to product catalog page
- **API Field**: `aiProducts`
- **Note**: Can be auto-generated from product catalog or manually entered

**Example Format**:
```markdown
## Product Categories

### Cakes
- Chocolate Cake: ₹500 (1kg), ₹800 (2kg)
- Vanilla Cake: ₹450 (1kg), ₹750 (2kg)
- Custom cakes available on request

### Cookies
- Chocolate Chip: ₹50 per piece, ₹450 per dozen
- Oatmeal Raisin: ₹45 per piece, ₹400 per dozen

### Brownies
- Classic Brownie: ₹60 per piece
- Fudge Brownie: ₹70 per piece
- Available in boxes of 6, 12, or 24
```

### 4. Conversation Templates

#### Greeting Message
- **Field Type**: Text Area
- **Required**: No (optional)
- **Validation**:
  - Maximum length: 500 characters
- **Help Text**: "The initial message sent when a customer starts a conversation. Make it welcoming and informative."
- **Placeholder**: "Hello! Welcome to [Business Name]. How can I help you today?"
- **Character Count**: Show remaining characters
- **Preview**: Show how it appears to customers
- **API Field**: `aiGreeting`

**Example Greetings**:
- "Hello! 👋 Welcome to Brownie Bakery! I'm here to help you with orders, product information, or any questions you might have."
- "Hi there! Thanks for reaching out to [Business Name]. How can I assist you today?"

#### Closing Message
- **Field Type**: Text Area
- **Required**: No (optional)
- **Validation**:
  - Maximum length: 500 characters
- **Help Text**: "A friendly closing message for conversations. Used when wrapping up or ending a conversation."
- **Placeholder**: "Thank you for choosing [Business Name]! Have a great day!"
- **Character Count**: Show remaining characters
- **API Field**: `aiClosing`

**Example Closings**:
- "Thank you for your order! We'll send you updates soon. Have a wonderful day! 😊"
- "Thanks for chatting with us! If you need anything else, just message us anytime."

### 5. AI Content Sections

These sections allow vendors to provide structured information that the AI uses during conversations.

#### Responsibilities
- **Field Type**: Text Area
- **Required**: No (optional)
- **Validation**:
  - Maximum length: 2000 characters
- **Help Text**: "Define what your AI bot is responsible for. Be specific about tasks, limitations, and boundaries."
- **Placeholder**: "List the bot's responsibilities..."
- **Formatting**: Supports bullet points and numbered lists
- **API Field**: `aiContentResponsibilities`

**Example**:
```markdown
The AI bot is responsible for:
- Answering product questions
- Helping customers place orders
- Providing order status updates
- Handling basic customer service inquiries

The AI bot should NOT:
- Process payments directly
- Make changes to orders after confirmation
- Provide medical or legal advice
```

#### Conversation Rules
- **Field Type**: Text Area
- **Required**: No (optional)
- **Validation**:
  - Maximum length: 2000 characters
- **Help Text**: "Rules and guidelines for how the AI should conduct conversations. Define tone, style, and conversation flow."
- **Placeholder**: "Define conversation rules..."
- **API Field**: `aiContentConversationRules`

**Example**:
```markdown
Conversation Rules:
1. Always greet customers warmly
2. Use the customer's name when available
3. Confirm order details before finalizing
4. Be concise but thorough
5. Ask one question at a time
6. Never make assumptions about customer preferences
7. Always provide order confirmation numbers
```

#### Important Instructions
- **Field Type**: Text Area
- **Required**: No (optional)
- **Validation**:
  - Maximum length: 2000 characters
- **Help Text**: "Critical instructions that the AI must always follow. These override default behavior."
- **Placeholder**: "Add important instructions..."
- **API Field**: `aiContentImportantInstructions`

**Example**:
```markdown
IMPORTANT:
- Always confirm delivery address before processing order
- Minimum order value is ₹500
- Delivery available only within city limits
- Custom cakes require 48 hours notice
- Payment links expire after 30 minutes
```

### 6. Preparation Time

#### Preparation Time (Minutes)
- **Field Type**: Number Input
- **Required**: No (optional)
- **Validation**:
  - Minimum: 0
  - Maximum: 1440 (24 hours)
  - Must be a whole number
- **Help Text**: "Default preparation time in minutes. This is used when calculating delivery estimates. Can be overridden by order-specific settings."
- **Placeholder**: "60"
- **Unit Display**: "minutes"
- **API Field**: `aiPreparationTimeMinutes`
- **Note**: This is a legacy field. New orders use `orderPreparationConfig` from Order Settings tab.

## Form Layout

```
┌─────────────────────────────────────────────────────────┐
│ AI Configuration                                         │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Bot Identity                                         │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Bot Name                                             │ │
│ │ [________________________________]                   │ │
│ │ A friendly name for your AI assistant                │ │
│ │                                                       │ │
│ │ Personality                                           │ │
│ │ [________________________________]                   │ │
│ │ [________________________________]                   │ │
│ │ Describe your bot's personality (500 chars max)      │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ AI Model & System Configuration                      │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ AI Model                                             │ │
│ │ [GPT-4o-mini ▼] (Recommended)                       │ │
│ │ Estimated cost: ~₹0.002 per message                 │ │
│ │                                                       │ │
│ │ System Prompt                                         │ │
│ │ ┌─────────────────────────────────────────────────┐ │ │
│ │ │ [Large text area with syntax highlighting]      │ │ │
│ │ │                                                  │ │ │
│ │ │                                                  │ │ │
│ │ └─────────────────────────────────────────────────┘ │ │
│ │ Characters: 245 / 5000                              │ │
│ │ [Preview] [Load Template ▼]                        │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Product Information                                  │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Product Catalog Description                          │ │
│ │ ┌─────────────────────────────────────────────────┐ │ │
│ │ │ [Large text area]                               │ │ │
│ │ │                                                  │ │ │
│ │ └─────────────────────────────────────────────────┘ │ │
│ │ Characters: 1,234 / 10,000                           │ │
│ │ [Import from Catalog]                                │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Conversation Templates                               │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Greeting Message                                     │ │
│ │ ┌─────────────────────────────────────────────────┐ │ │
│ │ │ [Text area]                                      │ │ │
│ │ └─────────────────────────────────────────────────┘ │ │
│ │ Characters: 89 / 500                                  │ │
│ │                                                       │ │
│ │ Closing Message                                      │ │
│ │ ┌─────────────────────────────────────────────────┐ │ │
│ │ │ [Text area]                                      │ │ │
│ │ └─────────────────────────────────────────────────┘ │ │
│ │ Characters: 45 / 500                                  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ AI Content Sections                                  │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Responsibilities                                     │ │
│ │ ┌─────────────────────────────────────────────────┐ │ │
│ │ │ [Text area]                                      │ │ │
│ │ └─────────────────────────────────────────────────┘ │ │
│ │                                                       │ │
│ │ Conversation Rules                                   │ │
│ │ ┌─────────────────────────────────────────────────┐ │ │
│ │ │ [Text area]                                      │ │ │
│ │ └─────────────────────────────────────────────────┘ │ │
│ │                                                       │ │
│ │ Important Instructions                               │ │
│ │ ┌─────────────────────────────────────────────────┐ │ │
│ │ │ [Text area]                                      │ │ │
│ │ └─────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Preparation Time                                     │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Default Preparation Time                             │ │
│ │ [____] minutes                                       │ │
│ │ Default preparation time for orders                  │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Validation Schema (Zod)

```typescript
import { z } from 'zod';

export const aiConfigSchema = z.object({
  aiBotName: z
    .string()
    .max(50, 'Bot name must be 50 characters or less')
    .optional()
    .nullable(),
  
  aiPersonality: z
    .string()
    .max(500, 'Personality description must be 500 characters or less')
    .optional()
    .nullable(),
  
  aiModel: z
    .enum(['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4-turbo'])
    .optional()
    .default('gpt-4o-mini'),
  
  aiSystemPrompt: z
    .string()
    .max(5000, 'System prompt must be 5000 characters or less')
    .optional()
    .nullable(),
  
  aiProducts: z
    .string()
    .max(10000, 'Product information must be 10000 characters or less')
    .optional()
    .nullable(),
  
  aiGreeting: z
    .string()
    .max(500, 'Greeting message must be 500 characters or less')
    .optional()
    .nullable(),
  
  aiClosing: z
    .string()
    .max(500, 'Closing message must be 500 characters or less')
    .optional()
    .nullable(),
  
  aiContentResponsibilities: z
    .string()
    .max(2000, 'Responsibilities must be 2000 characters or less')
    .optional()
    .nullable(),
  
  aiContentConversationRules: z
    .string()
    .max(2000, 'Conversation rules must be 2000 characters or less')
    .optional()
    .nullable(),
  
  aiContentImportantInstructions: z
    .string()
    .max(2000, 'Important instructions must be 2000 characters or less')
    .optional()
    .nullable(),
  
  aiPreparationTimeMinutes: z
    .number()
    .int('Preparation time must be a whole number')
    .min(0, 'Preparation time cannot be negative')
    .max(1440, 'Preparation time cannot exceed 24 hours')
    .optional()
    .nullable(),
});
```

## API Endpoints

### GET `/api/vendors/:id/ai-config`
**Purpose**: Fetch AI configuration

**Response**:
```json
{
  "vendorId": "vendor-uuid",
  "businessName": "Brownie Bakery",
  "ai": {
    "botName": "BrownieBakerBot",
    "personality": "Friendly and helpful",
    "systemPrompt": "You are a helpful assistant...",
    "products": "## Cakes\n- Chocolate Cake: ₹500...",
    "greeting": "Hello! Welcome to Brownie Bakery!",
    "closing": "Thank you for your order!"
  }
}
```

### PUT `/api/vendors/:id/ai-prompts`
**Purpose**: Update AI configuration

**Request Body**:
```json
{
  "botName": "BrownieBakerBot",
  "personality": "Friendly and helpful",
  "systemPrompt": "You are a helpful assistant...",
  "products": "## Cakes\n- Chocolate Cake: ₹500...",
  "greeting": "Hello! Welcome to Brownie Bakery!",
  "closing": "Thank you for your order!",
  "preparationTimeMinutes": 60
}
```

**Response**:
```json
{
  "ok": true,
  "id": "vendor-uuid"
}
```

**Note**: This endpoint currently requires admin role. Should be updated to allow vendor access.

### PUT `/api/vendors/:id/ai-content`
**Purpose**: Update AI content sections (new endpoint needed)

**Request Body**:
```json
{
  "aiContentResponsibilities": "The AI bot is responsible for...",
  "aiContentConversationRules": "Conversation Rules:\n1. Always greet...",
  "aiContentImportantInstructions": "IMPORTANT:\n- Always confirm..."
}
```

## Component Implementation Details

### AIConfigTab Component

```typescript
interface AIConfigTabProps {
  vendorId: string;
}

export function AIConfigTab({ vendorId }: AIConfigTabProps) {
  const { data, isLoading, error } = useAIConfig(vendorId);
  const form = useForm({
    resolver: zodResolver(aiConfigSchema),
    defaultValues: data,
  });

  const onSubmit = async (values: AIConfigFormData) => {
    await updateAIConfig(vendorId, values);
    toast.success('AI configuration updated successfully');
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <BotIdentitySection form={form} />
      <AIModelSection form={form} />
      <ProductInfoSection form={form} />
      <ConversationTemplatesSection form={form} />
      <AIContentSections form={form} />
      <PreparationTimeSection form={form} />
      <SettingsFooter />
    </form>
  );
}
```

### AIPromptEditor Component

**Props**:
- `name`: Form field name
- `label`: Field label
- `maxLength`: Maximum character count
- `placeholder`: Placeholder text
- `helpText`: Help text below field
- `form`: React Hook Form instance

**Features**:
- Character count indicator
- Word count
- Syntax highlighting (optional)
- Auto-resize or scroll
- Preview button

### AIModelSelector Component

**Props**:
- `form`: React Hook Form instance
- `onModelChange?`: Callback when model changes

**Features**:
- Model comparison table
- Cost estimation
- Performance indicators
- Recommended badge

## User Interactions

### Editing System Prompt
1. User clicks in system prompt text area
2. User types or pastes prompt
3. Character count updates in real-time
4. User can click "Preview" to see formatted prompt
5. User can select template from dropdown
6. Save button enables when changes detected

### Selecting AI Model
1. User clicks model dropdown
2. User sees model options with cost/performance info
3. User selects model
4. Cost estimate updates
5. Warning shown if switching to expensive model

### Importing Product Information
1. User clicks "Import from Catalog" button
2. Modal shows product catalog
3. User selects products to include
4. Product info auto-formatted and inserted
5. User can edit imported content

### Testing Greeting/Closing
1. User clicks "Preview" button
2. Modal shows how message appears to customers
3. User can edit and preview again
4. User saves when satisfied

## Advanced Features

### Prompt Templates
- Pre-built templates for common business types
- Customizable templates
- Save user's own templates
- Template marketplace (future)

### Prompt Validation
- Check for common issues
- Suggest improvements
- Warn about too-short prompts
- Validate formatting

### A/B Testing (Future)
- Test different prompts
- Compare performance metrics
- Switch between variants

## Error Handling

### Validation Errors
- Character limit exceeded: Show error and disable save
- Invalid format: Show specific error message
- Required field missing: Highlight field

### Server Errors
- Show toast with error details
- Maintain form state
- Allow retry

### Token Limit Warnings
- Warn if prompt too long (affects cost)
- Suggest optimizations
- Show estimated token count

## Accessibility

- All text areas have labels
- Character counts announced to screen readers
- Keyboard navigation for all controls
- Focus management
- ARIA labels for complex components

## Mobile Responsiveness

- Full-width text areas
- Scrollable content
- Touch-friendly controls
- Readable font sizes
- Adequate spacing

## Related API Endpoints

- **GET** `/api/vendors/:id/ai-config` - Get AI configuration
- **PUT** `/api/vendors/:id/ai-prompts` - Update AI prompts (needs authorization fix and missing fields)

See [API Documentation](./API_DOCUMENTATION.md#2-ai-configuration-apis) for complete API specifications.

## Testing Checklist

- [ ] Bot name validation (max length)
- [ ] Personality character limit
- [ ] AI model selection works
- [ ] System prompt character limit
- [ ] Product info character limit
- [ ] Greeting/closing character limits
- [ ] Content sections character limits
- [ ] Preparation time validation
- [ ] Preview functionality works
- [ ] Template loading works
- [ ] Import from catalog works
- [ ] Character counts update correctly
- [ ] Save button enables on changes
- [ ] Form validation works
- [ ] Error handling works
- [ ] Mobile layout works

