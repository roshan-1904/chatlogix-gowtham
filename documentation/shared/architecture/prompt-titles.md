# Customizable Prompt Section Content for Vendor AI Configuration

## Overview
This update enables vendors to customize the content (bullets, text, guidelines) under each section title in their AI assistant prompts, allowing for more personalized and brand-consistent AI interactions.

## Changes Made

### 1. Database Schema Updates
**File:** `backend/prisma/schema.prisma`

Added 4 new fields to the Vendor model for customizable prompt section content:
- `aiContentResponsibilities` - Custom content for Responsibilities section (bullets)
- `aiContentConversationRules` - Custom content for Conversation Rules section
- `aiContentImportantInstructions` - Custom content for Important Instructions section
- `aiContentProductRecommendations` - Custom content for Product Recommendations guidelines

**Note:** The section TITLES remain fixed (e.g., "Responsibilities", "Conversation Rules"). Only the CONTENT under each title can be customized. The "OUTPUT CONTRACT" and "Response JSON Format" sections remain fixed as they define the structured response format.

### 2. TypeScript Type Updates
**File:** `backend/src/types/aiResponse.ts`

Updated `VendorAIConfig` interface to include the new customizable content fields:
```typescript
export interface VendorAIConfig {
  // ... existing fields
  aiPersonality?: string;
  // Customizable prompt section content (text/bullets under each section)
  aiContentResponsibilities?: string;
  aiContentConversationRules?: string;
  aiContentImportantInstructions?: string;
  aiContentProductRecommendations?: string;
}
```

### 3. AI Service Updates
**File:** `backend/src/services/aiService.ts`

#### Updated `buildStructuredSystemPrompt` method:
- Extracts customizable content from vendor config
- Falls back to defaults if not specified
- Uses content dynamically in prompt generation

Default content includes:
- **Responsibilities**: Product introduction, pricing sharing, order collection guidelines
- **Conversation Rules**: WhatsApp-friendly communication, topic staying, uncertainty handling
- **Important Instructions**: Insight usage, avoiding repetition, capturing preferences
- **Product Recommendations**: Recommendation guidelines and criteria

#### Updated `getVendorAIConfig` method:
- Fetches all customizable content fields from database
- Includes them in the vendor configuration object

### 4. Migration
**File:** `backend/prisma/migrations/20251026131044_add_customizable_prompt_section_content/migration.sql`

Migration created to add the new columns to the Vendor table.

## How to Apply Migration

To apply the migration and enable the feature:

```bash
cd backend
npx prisma migrate dev
```

Or for production:
```bash
npx prisma migrate deploy
```

Then regenerate the Prisma client:
```bash
npx prisma generate
```

## Usage

### Setting Custom Content for a Vendor

Update vendor configuration through your admin interface or directly via SQL:

```sql
UPDATE "Vendor" 
SET 
  "aiContentResponsibilities" = '- Greet customers warmly and introduce yourself
- Show available products with clear descriptions
- Answer questions about ingredients and availability
- Collect delivery address and preferred time
- Confirm all order details before finalizing
- Thank customers sincerely',
  "aiContentConversationRules" = '- Use natural, friendly language
- Keep messages under 160 characters when possible
- Use emojis sparingly but appropriately (🎂❤️😊)
- Never make up information you don't know
- Always reference past conversation context',
  -- ... etc
WHERE id = 'vendor-id';
```

### Example Customization

A vendor could customize their content to be more brand-specific:

**Responsibilities:**
```
- Greet customers like old friends
- Introduce our artisanal brownie collection
- Share ingredients and sourcing details
- Collect delivery address with clear landmarks
- Confirm fresh baking schedule (same-day)
- End with heartfelt appreciation
```

**Conversation Rules:**
```
- Use warm, bakery-style language ("freshly baked", "made with love")
- Keep messages personal and genuine
- Use emojis that match our brand (🍫❤️😊)
- Always remember customer preferences from past orders
- Apologize sincerely for any delays
```

**Important Instructions:**
```
- Reference past customer preferences (gluten-free, extra chocolate, etc.)
- Don't ask for info already in customer history
- Capture new dietary restrictions immediately
- Document special occasion details (birthday, anniversary)
- Note delivery preferences (leave at door, call before delivery)
```

**Product Recommendations:**
```
- Suggest complementary flavors (chocolate pairs with vanilla)
- Recommend seasonal specials
- Upsell gift wrapping for special occasions
- Suggest larger quantities with bulk discounts
- Always mention freshness and ingredient quality
```

## Benefits

1. **Brand Consistency**: Vendors can customize content to match their brand voice and tone
2. **Industry-Specific**: Each business type can have industry-appropriate guidelines
3. **Personalization**: Vendors can adapt AI behavior to their unique workflow
4. **Flexibility**: Easy to update content without code changes
5. **Localization**: Content can be translated for different languages

## Technical Notes

- Default content ensures backward compatibility
- If a vendor doesn't specify custom content, defaults are used
- The OUTPUT CONTRACT section remains fixed as it defines the response structure
- Type safety is maintained through TypeScript interfaces
- Content is stored as TEXT in the database

## Section Structure

The prompt has the following structure:
1. **Role** - Fixed (defines bot identity)
2. **Responsibilities** - ✅ Customizable content
3. **Conversation Rules** - ✅ Customizable content
4. **Vendor Prompt** - Uses aiSystemPrompt (already customizable)
5. **CUSTOMER INSIGHTS** - Dynamic (generated from customer data)
6. **CURRENT ORDER STATE** - Dynamic (generated from order data)
7. **VENDOR PRODUCTS** - Uses aiProducts (already customizable)
8. **IMPORTANT INSTRUCTIONS** - ✅ Customizable content
9. **PRODUCT RECOMMENDATIONS** - ✅ Customizable content
10. **OUTPUT CONTRACT** - Fixed (defines response structure)
11. **Response JSON Format** - Fixed (defines JSON structure)
