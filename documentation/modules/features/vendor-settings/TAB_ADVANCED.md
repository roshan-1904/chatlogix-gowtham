# Advanced Tab - Detailed Documentation

> **📚 Related Documentation**: [API Documentation](./API_DOCUMENTATION.md#5-product-matching-configuration-apis) | [UI/UX Specifications](./UI_UX_SPECIFICATIONS.md) | [Quick Reference](./QUICK_REFERENCE.md)

## Overview

The Advanced tab contains technical settings for product matching, language support, and timezone configuration. These settings affect how the AI matches products and handles multilingual conversations.

## Purpose

Enable vendors to:
- Configure product matching behavior and accuracy
- Select supported languages for customer conversations
- Set business timezone for accurate timestamps
- Fine-tune AI matching parameters

> **Implementation status (verified against code, Sep 2026)**: `frontend_v2/apps/web-vendor/src/components/settings/tabs/AdvancedTab.tsx` implements Timezone (a plain text input, not the searchable region-grouped dropdown Section 3 describes) and three matching-config fields: Matching Threshold, Enable Fuzzy Matching, Enable AI Matching. **Product Name/Keywords/Price Field dropdowns, Supported Languages (Section 2), and the AI Matching Model dropdown were never built into the UI.** The backend fully supports all of it via `matchingConfigSchema` (`backend/src/utils/validation/settingsSchemas.ts`) and `GET/PUT /api/vendors/:id/matching-config` — and unlike the AI Configuration tab's model field, **`aiMatchingModel` is actually consumed by the live pipeline**: `backend/src/utils/productMatcher.ts` reads `matchingConfig.aiMatchingModel` (falling back to `gpt-4o-mini`) and is imported by `backend/src/conversation/cart/candidateSearch.ts`, part of the current production CartEngine flow. So this field is live and functional in production — it's just only settable via a direct API call or DB write today, not through the Settings UI.

## Sections

### 1. Product Matching Configuration

#### Matching Threshold
- **Field Type**: Slider with Number Input
- **Required**: No (defaults to 0.7)
- **Range**: 0.0 to 1.0
- **Step**: 0.1
- **Default**: 0.7
- **Help Text**: "The similarity score required for product matching. Higher values require more exact matches, while lower values allow more flexible matching."
- **Tooltip**: "This threshold determines how similar a customer's request must be to a product name for a match. Higher values (0.8-0.9) require exact or near-exact matches. Lower values (0.6-0.7) allow more flexible matching with typos or variations. Recommended: 0.7 for most businesses."
- **Visual Indicator**:
  - 0.0 - 0.5: Very Flexible (green)
  - 0.6 - 0.7: Balanced (blue) ← Recommended
  - 0.8 - 0.9: Strict (yellow)
  - 1.0: Exact Match Only (red)
- **API Field**: `matchingConfig.threshold`

**Examples**:
- **Threshold 0.9**: "chocolate cake" matches "chocolate cake" but not "choclate cake"
- **Threshold 0.7**: "chocolate cake" matches "chocolate cake" and "choclate cake"
- **Threshold 0.5**: "chocolate cake" matches "chocolate cake", "choclate cake", and "choc cake"

#### Enable Fuzzy Matching
- **Field Type**: Toggle Switch
- **Default**: true
- **Help Text**: "Allow matching products even with slight spelling variations or typos. This improves matching accuracy when customers misspell product names."
- **Tooltip**: "When enabled, the system uses fuzzy matching algorithms to find products even when names are misspelled. For example, 'choclate' will match 'chocolate'. This improves customer experience but may occasionally match incorrect products."
- **When Enabled**:
  - Handles typos and spelling variations
  - More flexible matching
  - Better customer experience
- **When Disabled**:
  - Only exact matches
  - May miss matches due to typos
  - More precise but less flexible
- **API Field**: `matchingConfig.enableFuzzy`

#### Enable AI Matching
- **Field Type**: Toggle Switch
- **Default**: true
- **Help Text**: "Use AI to understand customer intent and match products even when names don't match exactly. This is more powerful but costs more per match."
- **Tooltip**: "When enabled, AI analyzes customer requests to understand intent and match products semantically. For example, 'sweet treat' might match 'chocolate brownie'. This provides better matching but costs approximately ₹0.001 per match attempt."
- **When Enabled**:
  - Semantic understanding
  - Better matching for descriptive requests
  - Higher cost per match
- **When Disabled**:
  - Name-based matching only
  - Lower cost
  - May miss descriptive requests
- **API Field**: `matchingConfig.enableAIMatching`
- **Cost Indicator**: "~₹0.001 per match attempt"

**Note Component**:
```
ℹ️ Note: AI Matching provides better results for descriptive requests 
(e.g., "something sweet" matching "chocolate brownie") but increases 
costs. For businesses with clear product names, fuzzy matching may be 
sufficient.
```

#### Product Name Field
- **Field Type**: Select Dropdown
- **Required**: No (defaults to "name")
- **Options**: 
  - "name" - Product name field
  - "keywords" - Keywords field
  - "description" - Description field
- **Help Text**: "Select which product field to use for matching. 'name' is recommended for most businesses."
- **Tooltip**: "Choose the primary field used for product matching. 'name' matches against product names, 'keywords' matches against keywords, and 'description' matches against descriptions. Most businesses should use 'name'."
- **API Field**: `matchingConfig.productNameField`

#### Product Keywords Field
- **Field Type**: Select Dropdown
- **Required**: No (defaults to "keywords")
- **Options**:
  - "keywords" - Keywords array field
  - "tags" - Tags array field
  - "name" - Product name field
- **Help Text**: "Select which field contains product keywords for matching."
- **Tooltip**: "Choose the field that contains keywords or tags for products. This is used as secondary matching criteria."
- **API Field**: `matchingConfig.productKeywordsField`

#### Product Price Field
- **Field Type**: Select Dropdown
- **Required**: No (defaults to "basePrice")
- **Options**:
  - "basePrice" - Base price field
  - "price" - Price field
- **Help Text**: "Select which field contains product prices."
- **Tooltip**: "Choose the field that contains product prices. This is used when customers ask about pricing."
- **API Field**: `matchingConfig.productPriceField`

### 2. Language Support

#### Supported Languages
- **Field Type**: Multi-select Checkboxes
- **Required**: No (defaults to ["en"])
- **Help Text**: "Select languages your customers use. The AI will understand and respond in these languages. This improves matching and conversation quality."
- **Tooltip**: "Choose languages your customers commonly use. The AI will understand requests in these languages and can respond appropriately. Adding more languages improves customer experience but may slightly increase processing time."
- **Options**:
  - **English (en)** - Default
    - "Primary language for most businesses"
  - **Hindi (hi)** - हिंदी
    - "Widely spoken in India"
  - **Tamil (ta)** - தமிழ்
    - "Common in South India"
  - **Telugu (te)** - తెలుగు
    - "Common in South India"
  - **Kannada (kn)** - ಕನ್ನಡ
    - "Common in South India"
  - **Malayalam (ml)** - മലയാളം
    - "Common in South India"
  - **Bengali (bn)** - বাংলা
    - "Common in East India"
  - **Marathi (mr)** - मराठी
    - "Common in West India"
  - **Gujarati (gu)** - ગુજરાતી
    - "Common in West India"
- **API Field**: `matchingConfig.supportedLanguages` (array)

**Note Component**:
```
ℹ️ Note: At minimum, select English. Adding regional languages 
improves customer experience for local customers but may slightly 
increase processing time and cost.
```

#### AI Matching Model
- **Field Type**: Select Dropdown
- **Required**: No (defaults to "gpt-4o-mini")
- **Options**:
  - "gpt-4o-mini" - Fast and cost-effective (Recommended)
  - "gpt-4.1-mini" - Alternative mini model
  - "gpt-4o" - More capable but expensive
- **Help Text**: "Choose the AI model used for semantic product matching. GPT-4o-mini is recommended for most businesses."
- **Tooltip**: "Select the AI model for semantic matching. GPT-4o-mini balances cost and quality. More powerful models provide better matching but cost more."
- **API Field**: `matchingConfig.aiMatchingModel`

### 3. Timezone Settings

#### Timezone
- **Field Type**: Select Dropdown (Searchable)
- **Required**: No (defaults to "Asia/Kolkata")
- **Help Text**: "Your business timezone. This affects order timestamps, delivery estimates, and quiet hours. Select the timezone where your business operates."
- **Tooltip**: "Select your business timezone. This ensures order timestamps, delivery estimates, and quiet hours are calculated correctly for your location. Changing this affects how times are displayed and calculated."
- **Options**: Common timezones grouped by region
  - **Asia**
    - Asia/Kolkata (IST) - India Standard Time
    - Asia/Dubai (GST) - Gulf Standard Time
    - Asia/Singapore (SGT) - Singapore Time
  - **Europe**
    - Europe/London (GMT) - Greenwich Mean Time
    - Europe/Paris (CET) - Central European Time
  - **Americas**
    - America/New_York (EST) - Eastern Standard Time
    - America/Los_Angeles (PST) - Pacific Standard Time
- **Default**: "Asia/Kolkata"
- **API Field**: `timezone`

**Warning Component**:
```
⚠️ Warning: Changing timezone affects how order timestamps and 
delivery estimates are calculated. Existing orders will keep their 
original timestamps, but new orders will use the new timezone.
```

## Form Layout

```
┌─────────────────────────────────────────────────────────┐
│ Advanced                                                 │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Product Matching Configuration                       │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Matching Threshold                    [ℹ️]          │ │
│ │ [━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━] │ │
│ │ [0.7] (Balanced - Recommended)                      │ │
│ │ The similarity score required for product matching   │ │
│ │                                                       │ │
│ │ [Toggle: ON] Enable Fuzzy Matching                   │ │
│ │ Allow matching with spelling variations              │ │
│ │                                                       │ │
│ │ [Toggle: ON] Enable AI Matching                      │ │
│ │ Use AI for semantic matching (~₹0.001 per match)    │ │
│ │                                                       │ │
│ │ Product Name Field                                   │ │
│ │ [name ▼]                                             │ │
│ │                                                       │ │
│ │ Product Keywords Field                               │ │
│ │ [keywords ▼]                                         │ │
│ │                                                       │ │
│ │ Product Price Field                                  │ │
│ │ [basePrice ▼]                                        │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Language Support                                     │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Supported Languages                  [ℹ️]            │ │
│ │ Select languages your customers use                  │ │
│ │                                                       │ │
│ │ ☑ English (en) - Default                             │ │
│ │ ☑ Hindi (hi) - हिंदी                                │ │
│ │ ☐ Tamil (ta) - தமிழ்                                │ │
│ │ ☐ Telugu (te) - తెలుగు                              │ │
│ │                                                       │ │
│ │ AI Matching Model                                    │ │
│ │ [GPT-4o-mini ▼] (Recommended)                       │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Timezone Settings                                    │ │
│ │ ─────────────────────────────────────────────────── │ │
│ │                                                       │ │
│ │ Timezone                              [ℹ️]            │ │
│ │ [Asia/Kolkata (IST) ▼]                               │ │
│ │ Your business timezone                                │ │
│ │                                                       │ │
│ │ ⚠️ Warning: Changing timezone affects order          │ │
│ │ timestamps and delivery estimates                    │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Validation Schema (Zod)

```typescript
import { z } from 'zod';

export const matchingConfigSchema = z.object({
  threshold: z
    .number()
    .min(0, 'Threshold must be between 0 and 1')
    .max(1, 'Threshold must be between 0 and 1')
    .default(0.7),
  
  enableFuzzy: z.boolean().default(true),
  
  enableAIMatching: z.boolean().default(true),
  
  productNameField: z
    .enum(['name', 'keywords', 'description'])
    .default('name'),
  
  productKeywordsField: z
    .enum(['keywords', 'tags', 'name'])
    .default('keywords'),
  
  productPriceField: z
    .enum(['basePrice', 'price'])
    .default('basePrice'),
  
  supportedLanguages: z
    .array(z.string())
    .min(1, 'At least one language must be selected')
    .default(['en']),
  
  aiMatchingModel: z
    .enum(['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o'])
    .default('gpt-4o-mini'),
});

export const timezoneSchema = z.string().default('Asia/Kolkata');

export const advancedSettingsSchema = z.object({
  matchingConfig: matchingConfigSchema.optional().nullable(),
  timezone: timezoneSchema,
});
```

## API Endpoints

### GET `/api/vendors/:id/matching-config`
**Purpose**: Fetch matching configuration

**Response**:
```json
{
  "threshold": 0.7,
  "enableFuzzy": true,
  "enableAIMatching": true,
  "productNameField": "name",
  "productKeywordsField": "keywords",
  "productPriceField": "basePrice",
  "supportedLanguages": ["en", "hi"],
  "aiMatchingModel": "gpt-4o-mini"
}
```

### PUT `/api/vendors/:id/matching-config`
**Purpose**: Update matching configuration

**Request Body**:
```json
{
  "threshold": 0.7,
  "enableFuzzy": true,
  "enableAIMatching": true,
  "productNameField": "name",
  "productKeywordsField": "keywords",
  "productPriceField": "basePrice",
  "supportedLanguages": ["en", "hi", "ta"],
  "aiMatchingModel": "gpt-4o-mini"
}
```

### GET `/api/vendors/:id`
**Purpose**: Fetch vendor including timezone

**Response**:
```json
{
  "id": "vendor-uuid",
  "timezone": "Asia/Kolkata",
  ...
}
```

### PUT `/api/vendors/:id/timezone`
**Purpose**: Update timezone

**Request Body**:
```json
{
  "timezone": "Asia/Kolkata"
}
```

## Component Implementation Details

### AdvancedTab Component

```typescript
interface AdvancedTabProps {
  vendorId: string;
}

export function AdvancedTab({ vendorId }: AdvancedTabProps) {
  const { data, isLoading, error } = useAdvancedSettings(vendorId);
  const form = useForm({
    resolver: zodResolver(advancedSettingsSchema),
    defaultValues: data,
  });

  const onSubmit = async (values: AdvancedSettingsFormData) => {
    await updateAdvancedSettings(vendorId, values);
    toast.success('Advanced settings updated successfully');
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <MatchingConfigSection form={form} />
      <LanguageSupportSection form={form} />
      <TimezoneSection form={form} />
      <SettingsFooter />
    </form>
  );
}
```

### ThresholdSlider Component

**Props**:
- `form`: React Hook Form instance
- `min`: Minimum value (0)
- `max`: Maximum value (1)
- `step`: Step size (0.1)

**Features**:
- Slider with number input
- Visual indicator for range
- Real-time value update
- Help text with examples

## User Interactions

### Adjusting Matching Threshold
1. User drags slider or enters value
2. Visual indicator updates (color changes)
3. Example scenarios update
4. Help text explains impact
5. Save button enables when changed

### Enabling/Disabling Matching Options
1. User toggles fuzzy matching or AI matching
2. Help text updates to show impact
3. Cost indicator updates (for AI matching)
4. Save button enables when changed

### Selecting Languages
1. User clicks language checkboxes
2. At least one language must be selected
3. Visual feedback on selection
4. Help text explains impact
5. Save button enables when changed

### Changing Timezone
1. User opens timezone dropdown
2. User searches or selects timezone
3. Warning appears about impact
4. Confirmation may be required
5. Save button enables when changed

## Business Logic

### Matching Threshold Impact
- **Low (0.5-0.6)**: Very flexible, may match incorrectly
- **Medium (0.7)**: Balanced, recommended
- **High (0.8-0.9)**: Strict, may miss matches
- **Very High (1.0)**: Exact match only

### Language Support
- AI processes requests in selected languages
- Responses can be in customer's language
- Matching works across languages
- More languages = slightly higher cost

### Timezone Impact
- Order timestamps use business timezone
- Delivery estimates calculated in business timezone
- Quiet hours use business timezone
- Existing orders keep original timestamps

## Error Handling

### Validation Errors
- Threshold out of range: Show error
- No languages selected: Show error, disable save
- Invalid timezone: Show error

### Server Errors
- Show toast with error message
- Maintain form state
- Allow retry

## Accessibility

- Slider accessible via keyboard
- Checkboxes properly grouped
- Dropdowns accessible via keyboard
- Screen reader announcements
- Focus management

## Mobile Responsiveness

- Full-width slider
- Stack checkboxes vertically
- Touch-friendly dropdowns
- Readable font sizes
- Adequate spacing

## Related API Endpoints

- **GET** `/api/vendors/:id/matching-config` - Get matching configuration (built; see status note above for which fields have no UI yet)
- **PUT** `/api/vendors/:id/matching-config` - Update matching configuration (built)
- **PUT** `/api/vendors/:id/timezone` - Update timezone (built)

See [API Documentation](./API_DOCUMENTATION.md#5-product-matching-configuration-apis) for complete API specifications.

## Testing Checklist

- [ ] Matching threshold slider works
- [ ] Threshold validation (0-1 range)
- [ ] Fuzzy matching toggle works
- [ ] AI matching toggle works
- [ ] Product field dropdowns work
- [ ] Language checkboxes work
- [ ] At least one language required
- [ ] AI matching model selection works
- [ ] Timezone dropdown works
- [ ] Timezone search works
- [ ] Save button enables on changes
- [ ] Form validation works
- [ ] Error handling works
- [ ] Mobile layout works

