# Multi-Stage AI Processing Optimization - Requirements Document

## Executive Summary

**Current State:**
- Single AI call per message consuming 4000-5000 tokens
- Massive prompt includes full conversation state, vendor config, customer insights, product catalog, and system instructions
- High cost per message (~$0.002-0.003)
- Risk of token limit issues as conversations grow

**Proposed Solution:**
- Break processing into 15+ focused stages (including conditional stages)
- Use smaller, targeted AI calls (50-1000 tokens each)
- Estimated 70-75% cost reduction
- **Enhanced natural conversation flow** with conversation memory
- **Multi-intent detection** for complex customer messages
- **Correction handling** for improved accuracy
- **Order update validation** for data integrity
- **Proactive assistance** for better customer experience
- Ensure no information loss

---

## Current Architecture Analysis

### Current Flow (`generateStructuredResponse`)

1. Fetch conversation state (full JSON with all context)
2. Fetch customer insights (full profile)
3. Fetch pending orders (full order details)
4. Fetch vendor config (full product catalog + prompts)
5. Build massive system prompt (~3000-4000 tokens)
6. Single AI call with all context (~4000-5000 tokens total)
7. Parse structured response
8. Process events
9. Queue response

**Issues:**
- High token usage (4000-5000 per message)
- Redundant data sent repeatedly
- No early filtering of irrelevant context
- Single point of failure
- Difficult to optimize individual steps

---

## Proposed Multi-Stage Architecture

### Stage 0: Message Normalization (50-100 tokens)

**Purpose:** Clean and normalize customer message for better processing

**Input:**
- Raw customer message

**Processing:**
```typescript
interface NormalizedMessage {
  original: string;
  cleaned: string;
  language: string;
  emojisInterpreted: string[]; // ["happy", "thumbs_up", "pizza"]
  typosCorrected: boolean;
  abbreviationsExpanded: boolean;
  hasEmojis: boolean;
  informalPatterns: string[]; // ["pls", "thx", "u"]
}

async function normalizeMessage(rawMessage: string): Promise<NormalizedMessage> {
  // 1. Clean text (remove extra spaces, normalize punctuation)
  // 2. Detect language
  // 3. Interpret emojis (using AI for context-aware interpretation)
  // 4. Correct typos (fuzzy matching against product catalog)
  // 5. Expand abbreviations ("pls" -> "please", "thx" -> "thanks")
  // 6. Detect informal patterns
  return normalizedMessage;
}
```

**AI Call (for emoji interpretation and typo correction):**
```
System: You are a text normalizer for a WhatsApp business assistant.

Task: Normalize the customer message for better processing.

Customer Message: "{rawMessage}"

Tasks:
1. Interpret emojis in context (e.g., 🍕 = pizza, 😊 = happy/positive)
2. Correct obvious typos (e.g., "piza" -> "pizza", "browni" -> "brownie")
3. Expand common abbreviations (e.g., "pls" -> "please", "thx" -> "thanks")
4. Detect language

Return JSON:
{
  "cleaned": "normalized text",
  "language": "en|hi|ta|te|...",
  "emojisInterpreted": ["pizza", "happy"],
  "typosCorrected": true|false,
  "abbreviationsExpanded": true|false,
  "informalPatterns": ["pls", "thx"]
}
```

**Expected Tokens:** 50-100  
**Model:** `gpt-4o-mini`  
**Cost:** ~$0.00001-0.00002 per call

**Output:**
- Normalized message ready for processing
- Language detection
- Emoji interpretations
- Typo corrections

---

### Stage 0.5: Conversation Memory Retrieval

**Purpose:** Retrieve relevant conversation context and key facts

**Input:**
- Conversation ID
- Normalized message
- Current conversation turn number

**Processing:**
```typescript
interface ConversationMemory {
  keyFacts: string[]; // ["Customer prefers morning delivery", "Allergic to nuts", "Likes extra cheese"]
  ongoingTopics: string[]; // ["Ordering birthday cake", "Discussing payment method"]
  customerPreferences: Record<string, any>; // {deliveryTime: "morning", dietaryRestrictions: ["nuts"]}
  lastOrderSummary?: string; // "Ordered 2kg brownie on Oct 15"
  conversationSummary: string; // Summary of last 10-15 messages
  importantContext: string[]; // ["Customer mentioned birthday on Oct 20", "Address: 123 Main St"]
}

async function retrieveConversationMemory(
  conversationId: string, 
  normalizedMessage: string
): Promise<ConversationMemory> {
  // 1. Fetch conversation summary (stored every 10-15 messages)
  // 2. Extract key facts from customer insights
  // 3. Identify ongoing topics from recent messages
  // 4. Use semantic search to find relevant past context
  // 5. Build memory object
  return memory;
}
```

**No AI Call** - Uses database and semantic search

**Benefits:**
- Maintains conversation continuity
- Prevents information loss
- Enables natural references to past conversations
- Reduces need to re-ask for information

---

### Stage 1: Intent Understanding (Enhanced) (200-350 tokens)

**Purpose:** Classify customer intent(s) and extract key information with multi-intent support

**Input:**
- Normalized customer message
- Conversation memory (from Stage 0.5)
- Last 5-6 messages for context

**AI Prompt Structure:**
```
System: You are an intent classifier for a WhatsApp business assistant.

Task: Analyze the customer message and classify intent(s), then extract key information.

Customer Message: "{normalizedMessage}"

Conversation Memory:
Key Facts: {memory.keyFacts}
Ongoing Topics: {memory.ongoingTopics}
Previous Context: {last5Messages}

Return JSON:
{
  "primaryIntent": "order_new|order_update|order_status|product_inquiry|greeting|support|cancel_order|confirm_order|other",
  "secondaryIntents": ["intent1", "intent2"], // Optional: multiple intents
  "confidence": 0.0-1.0,
  "extractedInfo": {
    "products": ["product1", "product2"],
    "quantities": ["2kg", "3 pieces"],
    "orderUpdateType": "add_items|remove_items|change_quantity|modify_delivery|replace_order|partial_update" | null,
    "itemsToAdd": [...], // If orderUpdateType is add_items
    "itemsToRemove": [...], // If orderUpdateType is remove_items
    "quantityChanges": [{product: "brownie", newQuantity: 3}], // If orderUpdateType is change_quantity
    "hasDeliveryInfo": true|false,
    "hasSpecialRequests": true|false,
    "mentionsOrder": true|false,
    "orderNumber": "ORD-123" | null,
    "urgency": "low|medium|high"
  },
  "needsMoreContext": true|false,
  "reasoning": "brief explanation"
}
```

**Expected Tokens:** 200-350 (increased due to multi-intent detection)  
**Model:** `gpt-4o-mini`  
**Cost:** ~$0.0001-0.0002 per call

**Output:**
- Primary and secondary intent classification
- Detailed extracted information
- Order update type (if applicable)
- Flag for additional context needs

---

### Stage 1.5: Intent Prioritization (100-150 tokens)

**Purpose:** Determine which intent to handle first when multiple intents detected

**Input:**
- Intent classification from Stage 1
- Conversation context

**AI Call (only if secondaryIntents.length > 0):**
```
System: Prioritize intents for handling.

Primary Intent: {primaryIntent}
Secondary Intents: {secondaryIntents}
Customer Message: {normalizedMessage}

Determine:
1. Which intent should be handled first?
2. Can multiple intents be handled in one response?
3. Should follow-up questions be asked?

Return JSON:
{
  "handlingStrategy": "handle_all|handle_primary_first|ask_clarification",
  "intentOrder": ["intent1", "intent2"],
  "canCombine": true|false,
  "followUpNeeded": true|false
}
```

**Expected Tokens:** 100-150  
**Cost:** ~$0.00005-0.00008 (only when needed)

**Output:**
- Handling strategy for multiple intents
- Intent processing order

---

### Stage 1.7: Correction Detection (100-150 tokens)

**Purpose:** Detect when customer is correcting previous understanding

**Input:**
- Current message
- Previous AI understanding
- Last 2-3 messages

**AI Call:**
```
System: Detect if customer is correcting previous understanding.

Current Message: "{normalizedMessage}"
Previous Messages:
{customer}: "{message1}"
{assistant}: "{message2}"
{customer}: "{message3}"

Look for correction patterns:
- "no, I meant..."
- "actually..."
- "correction..."
- "that's wrong..."
- "I said..."

Return JSON:
{
  "isCorrection": true|false,
  "correctedField": "quantity|product|address|delivery_time|other" | null,
  "originalUnderstanding": "what AI understood before",
  "correctedValue": "what customer actually meant",
  "confidence": 0.0-1.0
}
```

**Expected Tokens:** 100-150  
**Cost:** ~$0.00005-0.00008 per call

**Output:**
- Correction detection
- Field being corrected
- Corrected value

**Benefits:**
- Immediate error correction
- Learning from mistakes
- Improved accuracy over time

---

### Stage 2: Context-Aware Data Fetching (Enhanced)

**Purpose:** Fetch only relevant data based on intent

**Logic:**
```typescript
async function fetchRelevantData(intent: string, extractedInfo: any, conversationId: string, vendorId: string) {
  const dataToFetch = {
    customerInsights: false,
    pendingOrder: false,
    productCatalog: false,
    orderHistory: false,
    vendorConfig: false
  };

  // Enhanced logic based on order update type
  switch(intent) {
    case 'order_new':
      dataToFetch.pendingOrder = true; // Check if order already exists
      dataToFetch.productCatalog = true;
      dataToFetch.customerInsights = true; // For address/preferences
      break;
    
    case 'order_update':
      dataToFetch.pendingOrder = true; // Required for updates
      dataToFetch.productCatalog = true; // For validation
      dataToFetch.customerInsights = true;
      
      // Fetch based on update type
      if (extractedInfo.orderUpdateType === 'add_items') {
        dataToFetch.productCatalog = true; // Validate new items
      } else if (extractedInfo.orderUpdateType === 'remove_items') {
        // Only need current order
      } else if (extractedInfo.orderUpdateType === 'modify_delivery') {
        // May need customer insights for address validation
      }
      break;
    
    case 'order_status':
      dataToFetch.pendingOrder = true;
      dataToFetch.orderHistory = true;
      break;
    
    case 'product_inquiry':
      dataToFetch.productCatalog = true;
      // Fetch customer's order history for personalized recommendations
      dataToFetch.orderHistory = true;
      break;
    
    case 'greeting':
      dataToFetch.customerInsights = true; // Check if new customer
      dataToFetch.productCatalog = true; // Show products
      dataToFetch.orderHistory = true; // For "repeat order" suggestions
      break;
    
    case 'confirm_order':
    case 'cancel_order':
      dataToFetch.pendingOrder = true;
      break;
  }
  
  // Always fetch conversation memory if available
  if (conversationMemory) {
    // Use memory to optimize what to fetch
    if (conversationMemory.ongoingTopics.includes('order')) {
      dataToFetch.pendingOrder = true;
    }
  }

  // Fetch only what's needed
  const data = {};
  if (dataToFetch.customerInsights) {
    data.insights = await getCustomerInsights(conversationId, vendorId);
  }
  if (dataToFetch.pendingOrder) {
    data.pendingOrder = await getPendingOrder(conversationId, vendorId);
  }
  if (dataToFetch.productCatalog) {
    // Only fetch products mentioned or relevant to intent
    data.products = await getRelevantProducts(vendorId, extractedInfo.products);
  }
  // ... etc

  return data;
}
```

**Benefits:**
- Reduces data fetching by 40-60%
- Faster database queries
- Less data to process

---

### Stage 3: Simplified Prompt Construction

**Purpose:** Build focused prompt with only necessary context

**Prompt Structure:**
```typescript
function buildFocusedPrompt(intent: string, extractedInfo: any, fetchedData: any, vendorConfig: any) {
  const basePrompt = getBasePromptForIntent(intent, vendorConfig);
  
  // Add only relevant context sections
  const contextSections = [];
  
  if (intent.includes('order')) {
    contextSections.push(`Current Order: ${formatOrder(fetchedData.pendingOrder)}`);
  }
  
  if (extractedInfo.hasDeliveryInfo) {
    contextSections.push(`Delivery Info: ${extractDeliveryInfo(extractedInfo)}`);
  }
  
  if (intent === 'product_inquiry') {
    contextSections.push(`Products: ${formatRelevantProducts(fetchedData.products)}`);
  }
  
  // Minimal customer insights (only what's needed)
  if (fetchedData.insights && needsCustomerContext(intent)) {
    contextSections.push(`Customer: ${formatMinimalInsights(fetchedData.insights)}`);
  }
  
  return `${basePrompt}\n\nContext:\n${contextSections.join('\n\n')}`;
}
```

**Expected Tokens:** 500-800 (vs 3000-4000 currently)  
**Reduction:** ~75-80%

---

### Stage 4: Primary AI Response Generation (Enhanced)

**Purpose:** Generate initial response based on intent and context with conversation flow awareness

**AI Call:**
```
System: {focusedPrompt}

Conversation Flow Context:
- Turn Number: {turnNumber}
- Conversation Stage: {conversationStage}
- Previous Topic: {previousTopic}
- Natural Transitions: {naturalTransitions}

User: {normalizedMessage}
```

**Expected Tokens:** 600-1000 total  
**Model:** `gpt-4o-mini` (faster, cheaper)  
**Cost:** ~$0.0003-0.0005 per call

**Output:**
```json
{
  "response": "Natural response text",
  "extractedData": {
    "orderItems": [...],
    "deliveryAddress": "...",
    "specialRequests": "...",
    "customerInfo": {...}
  },
  "needsClarification": true|false,
  "clarificationStrategy": {
    "missingFields": ["quantity", "address"],
    "clarificationQuestions": [
      {
        "field": "quantity",
        "question": "How many would you like?",
        "priority": "high",
        "naturalPhrasing": "Just to confirm, how many pieces would you like?"
      }
    ],
    "canProceedWithDefaults": false
  },
  "conversationFlow": {
    "nextStage": "information_gathering|order_confirmation|closing",
    "naturalTransition": "Let me help you with that..."
  }
}
```

---

### Stage 4.5: Order Update Validation (200-300 tokens)

**Purpose:** Validate order updates before applying changes

**Input:**
- Extracted order update data
- Current pending order
- Product catalog

**Processing:**
```typescript
interface OrderUpdateValidation {
  isValid: boolean;
  conflicts: Array<{
    type: 'product_unavailable' | 'price_mismatch' | 'quantity_invalid' | 'delivery_conflict';
    message: string;
    severity: 'error' | 'warning';
  }>;
  priceChanges: {
    oldTotal: number;
    newTotal: number;
    difference: number;
  };
  requiresConfirmation: boolean; // If significant changes
  validatedUpdate: OrderUpdate;
}

async function validateOrderUpdate(
  update: OrderUpdate,
  currentOrder: Order,
  products: Product[]
): Promise<OrderUpdateValidation> {
  // 1. Validate products exist and are available
  // 2. Validate quantities are positive
  // 3. Check price consistency
  // 4. Detect conflicts (e.g., delivery date conflicts)
  // 5. Calculate price changes
  // 6. Determine if confirmation needed (>20% price change)
  return validation;
}
```

**AI Call (for complex validations):**
```
System: Validate order update for consistency and conflicts.

Current Order: {currentOrder}
Proposed Update: {update}
Products: {products}

Check for:
1. Product availability
2. Price consistency
3. Quantity validity
4. Delivery date conflicts
5. Special request conflicts

Return validation result.
```

**Expected Tokens:** 200-300  
**Cost:** ~$0.0001-0.00015 (only for order updates)

**Output:**
- Validation result
- Conflicts detected
- Price change calculations
- Confirmation requirements

---

### Stage 4.7: Proactive Assistance (150-200 tokens)

**Purpose:** Generate proactive suggestions and recommendations

**Input:**
- Customer insights
- Order history
- Current conversation context

**AI Call (conditional - only when appropriate):**
```
System: Generate proactive suggestions based on customer context.

Customer Insights: {insights}
Order History: {orderHistory}
Current Conversation: {context}

Suggest:
1. Related products (based on order history)
2. Reorder favorites
3. Complementary items
4. Special offers

Return suggestions if relevant, otherwise return empty array.
```

**Expected Tokens:** 150-200  
**Cost:** ~$0.00008-0.0001 (only when appropriate)

**Output:**
```json
{
  "suggestions": [
    {
      "type": "reorder_favorite|related_product|complementary_item|special_offer",
      "product": "brownie",
      "reason": "You ordered this last time",
      "naturalPhrasing": "Would you like to order brownie again? You seemed to enjoy it last time!"
    }
  ],
  "shouldInclude": true|false
}
```

**Benefits:**
- Increases order value
- Improves customer experience
- Personalizes interactions

---

### Stage 5: Conditional Data Enrichment (Enhanced)

**Purpose:** Fetch additional data if needed with smart clarification strategy

**Trigger Conditions:**
- `needsClarification === true`
- Missing critical information (address, payment, etc.)
- Complex order requiring validation
- Low confidence in extracted data

**Logic:**
```typescript
if (response.needsClarification || hasMissingCriticalInfo(response)) {
  // Use clarification strategy from Stage 4
  const strategy = response.clarificationStrategy;
  
  // Fetch additional context only for high-priority missing fields
  const additionalData = await fetchAdditionalContext(
    conversationId,
    vendorId,
    strategy.missingFields.filter(f => 
      strategy.clarificationQuestions.find(q => q.field === f)?.priority === 'high'
    )
  );
  
  // If can proceed with defaults, use them
  if (strategy.canProceedWithDefaults) {
    // Apply defaults and continue
  } else {
    // Return to Stage 6 for refinement
    return { needsRefinement: true, additionalData, initialResponse: response };
  }
}
```

**Benefits:**
- Smarter clarification (one question at a time)
- Uses defaults when appropriate
- Reduces customer friction

---

### Stage 6: Response Refinement (Conditional)

**Purpose:** Refine response with additional context if needed

**AI Call (only if Stage 5 triggered):**
```
System: Refine the response with additional context. Previous response: {initialResponse}

Additional Context:
{additionalData}

Customer Message: {currentMessage}

Return refined response.
```

**Expected Tokens:** 400-600  
**Cost:** ~$0.0002-0.0003 (only when needed)

---

### Stage 7: Message Composition & Personalization (Enhanced)

**Purpose:** Compose final user-friendly message with natural conversation flow

**AI Call:**
```
System: You are a friendly WhatsApp assistant. Compose a natural, conversational response.

Intent: {intent}
Response Data: {responseData}
Customer Name: {customerName}
Conversation Memory: {conversationMemory}
Previous Messages: {last5Messages}
Conversation Flow: {conversationFlow}
Vendor Personality: {vendorPersonality}

Requirements:
- Keep it conversational and warm
- Use customer's name naturally (not forced)
- Reference previous conversation naturally using conversation memory
- Maintain conversation flow and stage
- Use natural transitions
- Include emojis appropriately (match customer's style)
- Match vendor's personality and tone
- Keep under 150 words
- If correction detected, acknowledge gracefully
- If proactive suggestions, include naturally

Conversation Context:
- Turn: {turnNumber}
- Stage: {conversationStage}
- Previous Topic: {previousTopic}

Return only the message text, no JSON.
```

**Expected Tokens:** 400-600 (increased for better naturalness)  
**Model:** `gpt-4o-mini`  
**Cost:** ~$0.0002-0.0003

**Output:** Final customer message (string)

**Enhancements:**
- Uses conversation memory for natural references
- Maintains conversation flow
- Handles corrections gracefully
- Matches vendor personality
- Includes proactive suggestions naturally

---

### Stage 7.5: Data Validation (NEW)

**Purpose:** Validate extracted data before database updates

**Processing:**
```typescript
interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    error: string;
    severity: 'error' | 'warning';
  }>;
  validatedData: any;
}

async function validateExtractedData(
  extractedData: any,
  vendorId: string,
  conversationId: string
): Promise<ValidationResult> {
  const errors = [];
  
  // 1. Validate order items against product catalog
  if (extractedData.orderItems) {
    for (const item of extractedData.orderItems) {
      const product = await findProduct(vendorId, item.product);
      if (!product) {
        errors.push({
          field: 'orderItems',
          error: `Product "${item.product}" not found in catalog`,
          severity: 'error'
        });
      }
      if (item.quantity <= 0) {
        errors.push({
          field: 'orderItems',
          error: `Invalid quantity for "${item.product}"`,
          severity: 'error'
        });
      }
    }
  }
  
  // 2. Validate delivery address format
  if (extractedData.deliveryAddress) {
    if (!isValidAddressFormat(extractedData.deliveryAddress)) {
      errors.push({
        field: 'deliveryAddress',
        error: 'Invalid address format',
        severity: 'warning'
      });
    }
  }
  
  // 3. Validate prices
  if (extractedData.orderItems) {
    const calculatedTotal = calculateTotal(extractedData.orderItems);
    if (Math.abs(calculatedTotal - extractedData.totalAmount) > 10) {
      errors.push({
        field: 'totalAmount',
        error: 'Price mismatch detected',
        severity: 'error'
      });
    }
  }
  
  // 4. Check for conflicts with existing orders
  if (extractedData.deliveryDate) {
    const conflicts = await checkDeliveryConflicts(
      conversationId,
      extractedData.deliveryDate
    );
    if (conflicts.length > 0) {
      errors.push({
        field: 'deliveryDate',
        error: `Delivery conflicts with existing order`,
        severity: 'warning'
      });
    }
  }
  
  return {
    isValid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    validatedData: extractedData
  };
}
```

**No AI Call** - Pure validation logic

**Benefits:**
- Prevents incorrect data in database
- Catches errors before they cause issues
- Improves data quality

---

### Stage 8: Information Extraction & Database Update (Enhanced)

**Purpose:** Extract structured data and update database with conflict resolution

**Logic:**
```typescript
async function extractAndSave(
  response: any, 
  conversationId: string, 
  vendorId: string,
  validationResult: ValidationResult
) {
  // Only proceed if validation passed
  if (!validationResult.isValid) {
    // Handle validation errors
    await handleValidationErrors(validationResult.errors, conversationId);
    return;
  }
  
  const extractedData = validationResult.validatedData;
  
  // Extract order information with conflict resolution
  if (extractedData.orderItems) {
    const currentOrder = await getPendingOrder(conversationId, vendorId);
    
    if (extractedData.orderUpdateType === 'add_items') {
      // Add items to existing order
      await addItemsToOrder(currentOrder.id, extractedData.orderItems);
    } else if (extractedData.orderUpdateType === 'remove_items') {
      // Remove items from order
      await removeItemsFromOrder(currentOrder.id, extractedData.itemsToRemove);
    } else if (extractedData.orderUpdateType === 'change_quantity') {
      // Update quantities
      await updateOrderQuantities(currentOrder.id, extractedData.quantityChanges);
    } else if (extractedData.orderUpdateType === 'replace_order') {
      // Replace entire order
      await replaceOrder(currentOrder.id, extractedData.orderItems);
    } else {
      // Default: update or create order
      await updateOrCreateOrder(conversationId, vendorId, extractedData);
    }
  }
  
  // Extract customer information
  if (extractedData.customerInfo) {
    await updateCustomerInsights(conversationId, vendorId, extractedData.customerInfo);
  }
  
  // Extract delivery information
  if (extractedData.deliveryAddress) {
    await saveDeliveryInfo(conversationId, extractedData.deliveryAddress);
  }
  
  // Update conversation memory
  await updateConversationMemory(conversationId, {
    keyFacts: extractKeyFacts(extractedData),
    ongoingTopics: extractOngoingTopics(response),
    lastOrderSummary: extractOrderSummary(extractedData)
  });
  
  // Log all updates
  await logConversationUpdates(conversationId, extractedData);
}
```

**No AI Call** - Pure data processing

**Enhancements:**
- Handles different order update types
- Updates conversation memory
- Resolves conflicts
- Uses validated data

---

### Stage 8.5: Quality Assessment (NEW)

**Purpose:** Assess response quality and log metrics

**Processing:**
```typescript
interface QualityAssessment {
  naturalnessScore: number; // 0-5
  informationCompleteness: number; // 0-1
  conversationContinuity: number; // 0-1
  overallScore: number; // 0-5
  issues: string[];
}

async function assessQuality(
  finalMessage: string,
  intent: string,
  extractedData: any,
  conversationMemory: ConversationMemory
): Promise<QualityAssessment> {
  // 1. Naturalness scoring (using AI)
  const naturalnessScore = await scoreNaturalness(finalMessage);
  
  // 2. Information completeness check
  const completeness = checkInformationCompleteness(intent, extractedData);
  
  // 3. Conversation continuity check
  const continuity = checkConversationContinuity(
    finalMessage,
    conversationMemory
  );
  
  // 4. Overall score calculation
  const overallScore = (
    naturalnessScore * 0.4 +
    completeness * 0.3 +
    continuity * 0.3
  ) * 5;
  
  return {
    naturalnessScore,
    informationCompleteness: completeness,
    conversationContinuity: continuity,
    overallScore,
    issues: identifyIssues(finalMessage, extractedData)
  };
}
```

**AI Call (for naturalness scoring):**
```
System: Score the naturalness of this WhatsApp message.

Message: {finalMessage}
Context: {conversationContext}

Rate naturalness on scale 0-5 considering:
1. Conversational tone
2. Natural flow
3. Appropriate use of language
4. Personalization
5. Emoji usage

Return score and brief reasoning.
```

**Expected Tokens:** 150-200  
**Cost:** ~$0.00008-0.0001

**Output:**
- Quality scores
- Issues identified
- Metrics for improvement

**Benefits:**
- Continuous quality monitoring
- Identifies areas for improvement
- Tracks quality over time

---

### Stage 9: Response Queuing

**Purpose:** Queue final message to response worker

**Action:**
```typescript
await publishToQueue(env.RESPONSE_QUEUE_URL, {
  to: customerPhone,
  text: finalMessage,
  conversationId,
  vendorId,
  customerId,
  metadata: {
    intent,
    tokensUsed: totalTokensUsed,
    stagesExecuted: stagesExecuted
  }
});
```

---

## Cost Analysis

### Current Cost (Per Message)
- **Tokens:** 4000-5000
- **Model:** `gpt-4o-mini` (~$0.15/1M input, ~$0.60/1M output)
- **Estimated Cost:** ~$0.002-0.003 per message

### Proposed Cost (Per Message)

**Best Case** (simple message, no refinement):
- Stage 0 (Normalization): 80 tokens = $0.00001
- Stage 0.5 (Memory): $0 (DB only)
- Stage 1 (Intent): 300 tokens = $0.00005
- Stage 1.5 (Prioritization): $0 (skipped - single intent)
- Stage 1.7 (Correction): $0 (skipped - no correction)
- Stage 2 (Data Fetch): $0 (DB only)
- Stage 3 (Prompt Build): $0 (logic only)
- Stage 4 (Primary AI): 800 tokens = $0.00012
- Stage 4.5 (Validation): $0 (skipped - not order update)
- Stage 4.7 (Proactive): $0 (skipped - not appropriate)
- Stage 5 (Enrichment): $0 (skipped)
- Stage 6 (Refinement): $0 (skipped)
- Stage 7 (Composition): 500 tokens = $0.00008
- Stage 7.5 (Validation): $0 (logic only)
- Stage 8 (Save): $0 (DB only)
- Stage 8.5 (Quality): 150 tokens = $0.00002
- Stage 9 (Queue): $0 (queue only)

**Total:** ~$0.00028 per message  
**Savings:** ~86% reduction

**Average Case** (moderate complexity):
- Stage 0: 80 tokens = $0.00001
- Stage 0.5: $0 (DB only)
- Stage 1: 300 tokens = $0.00005
- Stage 1.5: 120 tokens = $0.00002 (multi-intent)
- Stage 1.7: $0 (no correction)
- Stage 4: 1000 tokens = $0.00015
- Stage 4.5: $0 (not order update)
- Stage 4.7: 150 tokens = $0.00002 (proactive suggestion)
- Stage 5: Triggered (DB only)
- Stage 6: 500 tokens = $0.00008
- Stage 7: 500 tokens = $0.00008
- Stage 7.5: $0 (logic only)
- Stage 8: $0 (DB only)
- Stage 8.5: 150 tokens = $0.00002
- Stage 9: $0 (queue only)

**Total:** ~$0.00043 per message  
**Savings:** ~81% reduction

**Complex Case** (order update with correction):
- Stage 0: 100 tokens = $0.00002
- Stage 0.5: $0 (DB only)
- Stage 1: 350 tokens = $0.00005
- Stage 1.5: 120 tokens = $0.00002
- Stage 1.7: 150 tokens = $0.00002 (correction detected)
- Stage 4: 1000 tokens = $0.00015
- Stage 4.5: 250 tokens = $0.00004 (order validation)
- Stage 4.7: $0 (skipped)
- Stage 5: Triggered (DB only)
- Stage 6: 600 tokens = $0.00009
- Stage 7: 600 tokens = $0.00009
- Stage 7.5: $0 (logic only)
- Stage 8: $0 (DB only)
- Stage 8.5: 200 tokens = $0.00003
- Stage 9: $0 (queue only)

**Total:** ~$0.00051 per message  
**Savings:** ~79% reduction

---

## Quality Assurance Requirements

### Conversation Quality Metrics
1. **Naturalness Score:** ≥ 4.7/5.0 (enhanced from 4.5)
2. **Context Retention:** 100% (no information loss)
3. **Intent Accuracy:** ≥ 95%
4. **Multi-Intent Handling:** ≥ 95% accuracy
5. **Correction Handling:** < 2% of conversations need manual correction
6. **Order Update Accuracy:** ≥ 98%
7. **Response Relevance:** ≥ 90%
8. **Customer Satisfaction:** ≥ 4.6/5.0 (enhanced)
9. **Conversation Continuity:** ≥ 95%

### Information Completeness
- ✅ All customer-provided information must be captured
- ✅ Order details must be accurate
- ✅ Delivery information must be preserved
- ✅ Special requests must be recorded
- ✅ Customer preferences must be updated

### Conversation Continuity
- ✅ Reference previous messages naturally using conversation memory
- ✅ Remember customer name and preferences across sessions
- ✅ Maintain conversation flow and stage awareness
- ✅ Avoid repeating questions (use conversation memory)
- ✅ Build on previous context seamlessly
- ✅ Handle corrections gracefully
- ✅ Detect and learn from mistakes
- ✅ Maintain topic continuity across multiple turns

---

## Implementation Requirements

### Phase 1: Core Infrastructure (Week 1)

1. **Create `MessageNormalizationService`** (Stage 0)
   - Implement text cleaning and normalization
   - Add emoji interpretation
   - Add typo correction with fuzzy matching
   - Add abbreviation expansion
   - Add language detection
   - Unit tests

2. **Create `ConversationMemoryService`** (Stage 0.5)
   - Implement conversation memory storage
   - Add key facts extraction
   - Add semantic search for context retrieval
   - Add conversation summarization
   - Add memory update logic
   - Unit tests

3. **Create `IntentClassifierService`** (Stage 1 - Enhanced)
   - Implement multi-intent detection
   - Add enhanced extraction logic
   - Add order update type detection
   - Integrate with conversation memory
   - Unit tests

4. **Create `IntentPrioritizationService`** (Stage 1.5)
   - Implement intent prioritization logic
   - Add handling strategy determination
   - Add multi-intent combination logic
   - Unit tests

5. **Create `CorrectionDetectionService`** (Stage 1.7)
   - Implement correction pattern detection
   - Add field identification
   - Add correction value extraction
   - Add feedback loop integration
   - Unit tests

6. **Create `ContextFetcherService`** (Stage 2 - Enhanced)
   - Implement enhanced conditional data fetching
   - Add order update type-based fetching
   - Optimize database queries
   - Add caching layer
   - Integrate with conversation memory
   - Unit tests

7. **Create `PromptBuilderService`** (Stage 3 - Enhanced)
   - Implement enhanced prompt construction
   - Add conversation flow awareness
   - Add intent-specific prompt templates
   - Add context formatting with memory
   - Add prompt optimization
   - Unit tests

### Phase 2: AI Processing Stages (Week 2)

8. **Create `PrimaryAIResponseService`** (Stage 4 - Enhanced)
   - Implement enhanced response generation
   - Add conversation flow awareness
   - Add smart clarification strategy
   - Add data extraction
   - Add clarification detection
   - Integrate with conversation memory
   - Unit tests

9. **Create `OrderUpdateValidationService`** (Stage 4.5)
   - Implement order update validation
   - Add conflict detection
   - Add price change calculation
   - Add confirmation logic
   - Unit tests

10. **Create `ProactiveAssistanceService`** (Stage 4.7)
    - Implement proactive suggestion generation
    - Add reorder detection
    - Add related product suggestions
    - Add complementary item suggestions
    - Add natural phrasing for suggestions
    - Unit tests

11. **Create `ResponseRefinementService`** (Stage 6 - Enhanced)
    - Implement enhanced refinement logic
    - Add smart clarification handling
    - Add additional context handling
    - Add default value application
    - Unit tests

12. **Create `MessageCompositionService`** (Stage 7 - Enhanced)
    - Implement enhanced message composition
    - Add conversation flow maintenance
    - Add natural transition handling
    - Add correction acknowledgment
    - Add proactive suggestion integration
    - Add vendor personality matching
    - Integrate with conversation memory
    - Unit tests

### Phase 3: Data Management (Week 3)

13. **Create `DataValidationService`** (Stage 7.5)
    - Implement data validation logic
    - Add product catalog validation
    - Add address format validation
    - Add price validation
    - Add conflict detection
    - Unit tests

14. **Create `DataExtractionService`** (Stage 8 - Enhanced)
    - Implement enhanced data extraction
    - Add order update type handling
    - Add conflict resolution
    - Add customer info extraction
    - Add conversation memory updates
    - Add database updates
    - Unit tests

15. **Create `QualityAssessmentService`** (Stage 8.5)
    - Implement quality scoring
    - Add naturalness scoring
    - Add completeness checking
    - Add continuity checking
    - Add metrics logging
    - Unit tests

16. **Integrate with existing services**
    - Update `messageProcessor.ts`
    - Update `aiService.ts`
    - Update `orderService.ts`
    - Update `customerInsightsService.ts`
    - Add conversation memory integration
    - Add correction handling integration

### Phase 4: Testing & Optimization (Week 4)

9. **Comprehensive Testing**
   - Unit tests for each stage
   - Integration tests for full flow
   - Performance tests
   - Quality tests

10. **Monitoring & Metrics**
    - Add token usage tracking
    - Add cost tracking
    - Add quality metrics
    - Add performance metrics

---

## Technical Specifications

### Intent Classification Schema (Enhanced)
```typescript
interface IntentClassification {
  primaryIntent: 'order_new' | 'order_update' | 'order_status' | 
                 'product_inquiry' | 'greeting' | 'support' | 
                 'cancel_order' | 'confirm_order' | 'other';
  secondaryIntents?: string[]; // Multiple intents support
  confidence: number; // 0.0 - 1.0
  extractedInfo: {
    products?: string[];
    quantities?: string[];
    orderUpdateType?: 'add_items' | 'remove_items' | 'change_quantity' | 
                      'modify_delivery' | 'replace_order' | 'partial_update' | null;
    itemsToAdd?: OrderItem[];
    itemsToRemove?: string[];
    quantityChanges?: Array<{product: string, newQuantity: number}>;
    hasDeliveryInfo: boolean;
    hasSpecialRequests: boolean;
    mentionsOrder: boolean;
    orderNumber?: string | null;
    urgency: 'low' | 'medium' | 'high';
  };
  needsMoreContext: boolean;
  reasoning: string;
}
```

### Conversation Memory Schema
```typescript
interface ConversationMemory {
  keyFacts: string[];
  ongoingTopics: string[];
  customerPreferences: Record<string, any>;
  lastOrderSummary?: string;
  conversationSummary: string;
  importantContext: string[];
  turnNumber: number;
  conversationStage: 'greeting' | 'information_gathering' | 'order_confirmation' | 'closing';
  lastUpdated: Date;
}
```

### Correction Detection Schema
```typescript
interface CorrectionDetection {
  isCorrection: boolean;
  correctedField?: 'quantity' | 'product' | 'address' | 'delivery_time' | 'other' | null;
  originalUnderstanding?: string;
  correctedValue?: string;
  confidence: number;
}
```

### Order Update Validation Schema
```typescript
interface OrderUpdateValidation {
  isValid: boolean;
  conflicts: Array<{
    type: 'product_unavailable' | 'price_mismatch' | 'quantity_invalid' | 'delivery_conflict';
    message: string;
    severity: 'error' | 'warning';
  }>;
  priceChanges: {
    oldTotal: number;
    newTotal: number;
    difference: number;
  };
  requiresConfirmation: boolean;
  validatedUpdate: OrderUpdate;
}
```

### Quality Assessment Schema
```typescript
interface QualityAssessment {
  naturalnessScore: number; // 0-5
  informationCompleteness: number; // 0-1
  conversationContinuity: number; // 0-1
  overallScore: number; // 0-5
  issues: string[];
}
```

### Stage Execution Result Schema
```typescript
interface StageExecutionResult {
  stage: string;
  success: boolean;
  output: any;
  tokensUsed?: number;
  cost?: number;
  duration: number;
  error?: string;
}
```

### Multi-Stage Response Schema
```typescript
interface MultiStageResponse {
  finalMessage: string;
  intent: string;
  extractedData: {
    orderItems?: OrderItem[];
    deliveryAddress?: string;
    deliveryInstructions?: string;
    specialRequests?: string;
    customerInfo?: CustomerInfo;
  };
  stagesExecuted: string[];
  totalTokensUsed: number;
  totalCost: number;
  qualityScore?: number;
}
```

---

## Error Handling & Fallbacks

### Stage Failure Handling

1. **Stage 1 Failure (Intent Classification)**
   - Fallback: Use keyword-based intent detection
   - Continue with generic intent

2. **Stage 4 Failure (Primary AI)**
   - Fallback: Use template-based response
   - Log error and continue

3. **Stage 6 Failure (Refinement)**
   - Fallback: Use primary response as-is
   - Log warning

4. **Stage 7 Failure (Composition)**
   - Fallback: Use primary response directly
   - Skip personalization

### Circuit Breaker Pattern
- If AI calls fail 3 times in a row, switch to fallback mode
- Use template-based responses temporarily
- Alert monitoring system
- Auto-recover after 5 minutes

---

## Performance Requirements

### Latency Targets
- **Stage 0 (Normalization):** < 150ms
- **Stage 0.5 (Memory):** < 100ms
- **Stage 1 (Intent):** < 250ms
- **Stage 1.5 (Prioritization):** < 100ms (if triggered)
- **Stage 1.7 (Correction):** < 150ms
- **Stage 2 (Data Fetch):** < 100ms
- **Stage 3 (Prompt Build):** < 50ms
- **Stage 4 (Primary AI):** < 1500ms
- **Stage 4.5 (Validation):** < 200ms (if triggered)
- **Stage 4.7 (Proactive):** < 200ms (if triggered)
- **Stage 5 (Enrichment):** < 100ms
- **Stage 6 (Refinement):** < 1000ms (if triggered)
- **Stage 7 (Composition):** < 800ms
- **Stage 7.5 (Validation):** < 150ms
- **Stage 8 (Save):** < 200ms
- **Stage 8.5 (Quality):** < 200ms
- **Stage 9 (Queue):** < 50ms

**Total End-to-End:** < 5 seconds (vs current ~3-5 seconds)
*Note: Slightly increased due to enhanced features, but still acceptable for WhatsApp*

### Throughput Targets
- Handle 1000 messages/minute
- Support concurrent processing
- Queue-based architecture for scalability

---

## Monitoring & Observability

### Metrics to Track

1. **Cost Metrics**
   - Tokens used per stage
   - Cost per message
   - Cost per intent type
   - Daily/weekly/monthly costs

2. **Quality Metrics**
   - Intent classification accuracy
   - Multi-intent handling accuracy
   - Correction detection accuracy
   - Response quality scores (naturalness, completeness, continuity)
   - Customer satisfaction scores
   - Information extraction accuracy
   - Order update accuracy
   - Conversation continuity scores

3. **Performance Metrics**
   - Stage execution times
   - End-to-end latency
   - Error rates per stage
   - Fallback usage frequency

4. **Business Metrics**
   - Messages processed
   - Orders created/updated
   - Customer insights updated
   - Conversation completion rates

---

## Testing Strategy

### Unit Tests
- Each stage service independently
- Mock AI responses
- Test error handling
- Test edge cases

### Integration Tests
- Full flow end-to-end
- Test with real AI (staging)
- Test error scenarios
- Test performance

### Quality Tests
- Conversation quality assessment
- Information completeness checks
- Naturalness evaluation
- Context retention verification

---

## Migration Plan

### Phase 1: Parallel Running (Week 1-2)
- Implement new system alongside old
- Route 10% of traffic to new system
- Compare results
- Monitor metrics

### Phase 2: Gradual Rollout (Week 3-4)
- Increase to 50% traffic
- Monitor quality and cost
- Fix issues
- Optimize performance

### Phase 3: Full Migration (Week 5)
- Route 100% traffic to new system
- Keep old system as fallback
- Monitor for 1 week
- Remove old system

---

## Success Criteria

### Cost Reduction
- ✅ Achieve ≥ 75% cost reduction (enhanced from 70%)
- ✅ Maintain cost per message < $0.0006 (slightly increased due to quality enhancements)

### Quality Maintenance
- ✅ Achieve naturalness score ≥ 4.7/5.0
- ✅ Achieve conversation continuity ≥ 95%
- ✅ Handle corrections with < 2% manual intervention
- ✅ Achieve order update accuracy ≥ 98%
- ✅ No increase in customer complaints
- ✅ Achieve customer satisfaction ≥ 4.6/5.0

### Performance
- ✅ Maintain or improve response times
- ✅ Handle increased load
- ✅ No degradation in reliability

### Information Completeness
- ✅ 100% information capture rate
- ✅ No data loss
- ✅ Accurate order processing

---

## Risk Mitigation

### Risks and Mitigations

1. **Quality Degradation**
   - **Mitigation:** Extensive testing, gradual rollout, quality monitoring, rollback plan

2. **Increased Complexity**
   - **Mitigation:** Clear documentation, modular design, comprehensive tests, code reviews

3. **Performance Issues**
   - **Mitigation:** Performance testing, caching, optimization, monitoring

4. **Cost Overruns**
   - **Mitigation:** Cost tracking, alerts, optimization, fallbacks

---

## Conclusion

This enhanced multi-stage approach will:
- ✅ Reduce AI costs by 75-80%
- ✅ **Significantly improve conversation naturalness** with memory and flow awareness
- ✅ **Handle complex scenarios** with multi-intent detection and correction handling
- ✅ **Improve order accuracy** with validation and conflict resolution
- ✅ **Enable proactive assistance** for better customer experience
- ✅ Ensure no information loss with conversation memory
- ✅ Improve system maintainability with modular stages
- ✅ Enable better optimization with quality metrics
- ✅ **Create a super natural AI assistant** that feels human-like

The phased implementation allows for gradual rollout with continuous monitoring and optimization.

---

## Next Steps

1. ✅ Review and approve this document
2. ✅ Create detailed technical design documents for each stage
3. ✅ Set up development environment
4. ✅ Begin Phase 1 implementation
5. ✅ Set up monitoring and metrics collection

---

**Document Version:** 2.0  
**Last Updated:** December 2024  
**Status:** Enhanced with Natural Conversation Features - Ready for Review and Approval

---

## Key Enhancements in Version 2.0

### New Stages Added:
1. **Stage 0:** Message Normalization - Handles typos, emojis, abbreviations
2. **Stage 0.5:** Conversation Memory Retrieval - Maintains context across conversations
3. **Stage 1.5:** Intent Prioritization - Handles multiple intents intelligently
4. **Stage 1.7:** Correction Detection - Learns from customer corrections
5. **Stage 4.5:** Order Update Validation - Validates updates before applying
6. **Stage 4.7:** Proactive Assistance - Suggests products and reorders
7. **Stage 7.5:** Data Validation - Ensures data quality before saving
8. **Stage 8.5:** Quality Assessment - Monitors and improves quality

### Enhanced Features:
- **Multi-intent detection** for complex customer messages
- **Conversation memory** for natural context retention
- **Correction handling** for improved accuracy
- **Order update types** (add, remove, modify, replace)
- **Proactive suggestions** for better customer experience
- **Quality monitoring** for continuous improvement
- **Natural conversation flow** maintenance

---

*This document provides a comprehensive roadmap for implementing the multi-stage AI processing system while maintaining quality and reducing costs. Each stage is designed to be independent, testable, and optimizable.*
