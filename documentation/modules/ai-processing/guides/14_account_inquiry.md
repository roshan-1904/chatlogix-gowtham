# Detailed Actions for `account_inquiry` Intent

## Overview

The `account_inquiry` intent handles customer questions about their account and profile, including profile updates, address changes, phone number updates, and account information requests. This document details every action taken at each stage of the multi-stage AI processing pipeline.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "update my address pls 😊"
- Output: `{ original: "update my address pls 😊", cleaned: "update my address please" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Checks for account information in memory
- Uses memory to understand account context

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `account_inquiry` as primary intent

**Process:**
- Analyzes message for account keywords:
  - "account", "profile", "update address", "change phone", "my details", "personal information", "update profile", "change address", "update phone", "my account"
- Detects account field being updated:
  - Address: "update address", "change address"
  - Phone: "change phone", "update phone"
  - Email: "change email", "update email"
  - Name: "change name", "update name"
- **Note:** Account updates are for profile (not for order)
- Detects secondary intents (rare for account_inquiry)

**Extracted Info:**
- Account field: address, phone, email, name, other
- Update type
- Urgency level

**Output:** `{ primaryIntent: "account_inquiry", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected (rare for account_inquiry)

**Process:**
- Usually not applicable for account inquiries

---

## Stage 1.7: Correction Detection

**Action:** Detects if message corrects a previous one

**Process:**
- Compares with last 5 messages
- Checks for correction patterns
- If correction detected, adjusts context

**Output:** `{ isCorrection: true/false, correctedField: "..." }`

---

## Stage 2: Context-Aware Data Fetching

**Action:** Fetches data needed for account inquiry

**Data Fetched:**

1. **Customer Insights:** **REQUIRED** - Account info, profile details
2. **Vendor Config:** Business info

**Caching:** Uses Redis cache (customer insights cached for 10 minutes)

**Output:** `{ insights: {...}, vendorConfig: {...} }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Help with account and profile management. Update customer information as requested. Confirm updates with customer. Store changes in customer insights."
3. **Current Account Info:** From customer insights:
   - Address
   - Phone number
   - Email
   - Name
   - Other profile details
4. **Conversation Memory:** Key facts, preferences
5. **Recent Messages:** Last 3 customer messages
6. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- Update customer information as requested
- Confirm updates with customer
- Store changes in customer insights
- Don't ask for information already available

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response for account inquiry

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Account information (if requested)
   - Update confirmation (if updating)
   - Updated information display
   - Confirmation message

**Output:** `{ response: "...", extractedData: { accountField: "...", customerInfo: {...} }, needsClarification: false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `account_inquiry` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true`

**Process:**
- Fetches additional account details if needed
- Gets validation rules for account fields

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed

**Process:**
- Refines response with additional context
- Improves update confirmation

---

## Stage 7: Message Composition

**Action:** Formats final message for customer

**Process:**

1. Takes AI response
2. Applies vendor personality and tone
3. Formats with line breaks for readability
4. Adds emojis appropriately
5. Ensures professional and clear tone
6. Includes updated information

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates account update data

**Validations:**

1. **Account Validation:**
   - Account field is valid
   - Update data format is correct
   - Address format (if updating address)
   - Phone format (if updating phone)
   - Email format (if updating email)

**Output:** `{ isValid: true, errors: [...], validatedData: {} }`

---

## Stage 8: Database Update

**Action:** Updates customer account information

**Process:**

### 8.1 Account Update

**Steps:**

1. **Update Customer Insights:**
   - Update address (if provided)
   - Update phone (if provided)
   - Update email (if provided)
   - Update name (if provided)
   - Update other profile fields

2. **Update Customer Record:**
   - Save updated account information
   - Set update timestamp

### 8.2 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer updated [account field]"
- Ongoing topics: ["account_inquiry"]
- Customer preferences: Updated account info
- Conversation stage: "account_update"
- Increments turn number

### 8.3 Cache Invalidation

**Invalidates:**
- Conversation cache
- Customer insights cache (critical - account updated)

---

## Stage 9: Response Queuing

**Action:** Queues message to WhatsApp

**Process:**
- Adds message to response queue
- Message sent to customer via WhatsApp API

**Output:** Message queued for delivery

---

## Summary: Complete Flow for `account_inquiry`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `account_inquiry` + account field
4. **Fetch Data** → Customer insights, vendor config
5. **Build Prompt** → Focused prompt with account context
6. **Generate AI Response** → Account information or update confirmation
7. **Validate Data** → Validate account update format
8. **Update Account** → Save account changes
9. **Update Memory** → Store account update facts
10. **Queue Response** → Send message to customer

---

## Key Features for `account_inquiry`

- ✅ **Account Updates:** Updates customer profile information
- ✅ **Field Validation:** Validates account field formats
- ✅ **Confirmation:** Confirms updates with customer
- ✅ **Profile Management:** Manages customer account details
- ✅ **No Order Changes:** Updates profile, not order

---

## Account Fields

### Address
- "update address", "change address"
- Process: Update delivery address in customer insights

### Phone
- "change phone", "update phone"
- Process: Update phone number in customer insights

### Email
- "change email", "update email"
- Process: Update email in customer insights

### Name
- "change name", "update name"
- Process: Update name in customer insights

---

## Related Files

- `backend/src/services/multiStageOrchestrator.ts` - Main orchestrator
- `backend/src/services/intentClassificationService.ts` - Intent classification
- `backend/src/services/contextFetcherService.ts` - Data fetching
- `backend/src/services/promptBuilderService.ts` - Prompt construction
- `backend/src/services/primaryAIResponseService.ts` - AI response generation
- `backend/src/services/dataValidationService.ts` - Data validation
- `backend/src/services/dataExtractionService.ts` - Database updates
- `backend/src/services/customerInsightsService.ts` - Customer insights management

---

*Last Updated: 2024*

