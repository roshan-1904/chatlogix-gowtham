# Intent Identification Flow Diagram

> **Architecture note (2026-09-02):** This flow describes the OLD multi-stage pipeline (`intentClassificationService.ts` + `multiStageOrchestrator.ts`, Stages 0-1.7). That pipeline is **no longer wired to live WhatsApp traffic** — production now runs `backend/src/conversation/*` (LLM-1 + `CartEngine` + optional LLM-2), which folds intent into the same single LLM-1 call as the draft reply and cart ops rather than running it as a separate staged pipeline. This flow still executes, but only via the catalog-import sandbox test-message path (`catalogImportSandboxService.ts`). See `docs/CONVERSATION_PROCESSOR_LAMBDA.md` for the current architecture.

## Visual Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER MESSAGE RECEIVED                    │
│                    "make it 5 boxes"                            │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              STAGE 0: MESSAGE NORMALIZATION                      │
│  • Clean text                                                    │
│  • Fix typos                                                     │
│  • Expand abbreviations                                          │
│  • Interpret emojis                                               │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│         STAGE 0.5: CONVERSATION MEMORY RETRIEVAL                 │
│  • Get key facts                                                 │
│  • Get ongoing topics                                            │
│  • Get customer preferences                                      │
│  • Get conversation summary                                      │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│            STAGE 1: INTENT CLASSIFICATION                        │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ STEP 1: Check Cache                                      │   │
│  │  • Generate cache key from message                      │   │
│  │  • If cached → Return immediately                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │                                    │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ STEP 2: Check Existing Order                              │   │
│  │  • Query database for pending order                      │   │
│  │  • Found: Order #123, 3 boxes                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │                                    │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ STEP 3: Pre-Detection (Pattern Matching)                 │   │
│  │                                                            │   │
│  │  Pattern Detection:                                        │   │
│  │  ✓ "make it 5" → MATCH                                    │   │
│  │  ✓ "change to X" → MATCH                                  │   │
│  │  → hasOrderUpdatePattern = true                           │   │
│  │                                                            │   │
│  │  Multiple Intent Detection:                               │   │
│  │  • Check for greeting, product inquiry, etc.              │   │
│  │  → detectedIntents = ["order_update"]                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │                                    │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ STEP 4: Build AI Prompt                                   │   │
│  │                                                            │   │
│  │  Components:                                               │   │
│  │  • Customer message: "make it 5 boxes"                    │   │
│  │  • Conversation memory: [key facts, topics]                │   │
│  │  • Last 10 messages: [previous context]                  │   │
│  │  • Existing order: Order #123, 3 boxes                   │   │
│  │  • Special hint: "⚠️ CRITICAL: Order update pattern      │   │
│  │    detected with existing order"                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │                                    │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ STEP 5: AI Classification (OpenAI)                       │   │
│  │                                                            │   │
│  │  Model: GPT-4o-mini                                       │   │
│  │  Prompt: [Comprehensive intent classification prompt]     │   │
│  │                                                            │   │
│  │  Response:                                                 │   │
│  │  {                                                         │   │
│  │    "primaryIntent": "order_update",                        │   │
│  │    "secondaryIntents": [],                                 │   │
│  │    "confidence": 0.85,                                     │   │
│  │    "extractedInfo": {                                      │   │
│  │      "quantityChanges": [                                  │   │
│  │        {"product": "boxes", "newQuantity": 5}             │   │
│  │      ],                                                     │   │
│  │      "orderUpdateType": "change_quantity"                  │   │
│  │    },                                                       │   │
│  │    "reasoning": "Customer wants to change quantity..."    │   │
│  │  }                                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │                                    │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ STEP 6: Parse & Validate Response                         │   │
│  │                                                            │   │
│  │  • Extract JSON from response                             │   │
│  │  • Validate primaryIntent exists                           │   │
│  │  • If invalid → Retry or Fallback                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │                                    │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ STEP 7: Post-Validation Override                           │   │
│  │                                                            │   │
│  │  Check:                                                    │   │
│  │  • Pattern detected? ✓                                     │   │
│  │  • Existing order? ✓                                      │   │
│  │  • AI classified as order_update? ✓                       │   │
│  │                                                            │   │
│  │  → No override needed (already correct)                   │   │
│  │                                                            │   │
│  │  If AI classified differently:                             │   │
│  │  → Override to order_update                               │   │
│  │  → Increase confidence to 0.8                             │   │
│  │  → Update reasoning                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │                                    │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ STEP 8: Construct Result                                  │   │
│  │                                                            │   │
│  │  IntentClassification {                                    │   │
│  │    primaryIntent: "order_update",                          │   │
│  │    secondaryIntents: [],                                   │   │
│  │    confidence: 0.85,                                       │   │
│  │    extractedInfo: {                                        │   │
│  │      quantityChanges: [{product: "boxes", newQty: 5}],   │   │
│  │      orderUpdateType: "change_quantity",                   │   │
│  │      hasDeliveryInfo: false,                               │   │
│  │      hasSpecialRequests: false,                            │   │
│  │      mentionsOrder: true,                                  │   │
│  │      urgency: "low"                                        │   │
│  │    },                                                       │   │
│  │    needsMoreContext: false,                                │   │
│  │    reasoning: "Customer wants to change quantity..."      │   │
│  │  }                                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │                                    │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ STEP 9: Cache Result                                      │   │
│  │                                                            │   │
│  │  • Store in Redis                                         │   │
│  │  • TTL: CACHE_TTL.INTENT_CLASSIFICATION                  │   │
│  │  • Key: Based on message text                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │                                    │
│                             ▼                                    │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│         STAGE 1.5: INTENT PRIORITIZATION (Conditional)           │
│  • Only if secondaryIntents.length > 0                          │
│  • Determines handling strategy                                 │
│  • Returns intent order                                         │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│         STAGE 1.7: CORRECTION DETECTION                         │
│  • Detects if customer is correcting previous understanding    │
│  • Example: "No, I meant 5 not 3"                               │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
                    [Continue to Stage 2...]
```

---

## Decision Tree: Intent Classification Priority

```
                    Customer Message
                           │
                           ▼
        ┌──────────────────┴──────────────────┐
        │                                      │
    Has "available",        Has "make it X",
    "do you have",          "change to X",
    "price", "stock"?      "update"?
        │                                      │
        ▼                                      ▼
   product_inquiry                    order_update
   (HIGHEST PRIORITY)                 (if order exists)
        │                                      │
        └──────────────────┬──────────────────┘
                           │
                           ▼
        ┌──────────────────┴──────────────────┐
        │                                      │
    Has "status",         Has "I want",
    "where is",          "buy", "order"?
    "track"?
        │                                      │
        ▼                                      ▼
   order_status                        order_new
        │                                      │
        └──────────────────┬──────────────────┘
                           │
                           ▼
        ┌──────────────────┴──────────────────┐
        │                                      │
    Has "human",         Has "hi",
    "agent",            "hello"?
    "support"?
        │                                      │
        ▼                                      ▼
     support                            greeting
        │                                      │
        └──────────────────┬──────────────────┘
                           │
                           ▼
        ┌──────────────────┴──────────────────┐
        │                                      │
    Has "cancel",        Has "confirm",
    "remove"?           "yes", "ok"?
        │                                      │
        ▼                                      ▼
   cancel_order                      confirm_order
        │                                      │
        └──────────────────┬──────────────────┘
                           │
                           ▼
                        other
```

---

## Multiple Intent Example Flow

```
Message: "I like to make it as 5 boxes, and do you have any other varieties?"

┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Pre-Detection                                       │
│                                                              │
│  Pattern Detection:                                          │
│  ✓ "make it as 5" → MATCH (order_update)                    │
│                                                              │
│  Multiple Intent Detection:                                  │
│  ✓ "do you have" → MATCH (product_inquiry)                  │
│                                                              │
│  → detectedIntents = ["order_update", "product_inquiry"]    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: AI Classification                                   │
│                                                              │
│  Prompt includes hint:                                      │
│  "⚠️ MULTIPLE INTENTS DETECTED: order_update,               │
│   product_inquiry"                                          │
│                                                              │
│  AI Response:                                               │
│  {                                                          │
│    "primaryIntent": "order_update",                          │
│    "secondaryIntents": ["product_inquiry"],                  │
│    "reasoning": "Customer wants to update quantity          │
│     (order_update) and also asks about other products       │
│     (product_inquiry)"                                      │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Intent Prioritization (Stage 1.5)                  │
│                                                              │
│  Input:                                                     │
│  • primaryIntent: "order_update"                             │
│  • secondaryIntents: ["product_inquiry"]                     │
│                                                              │
│  Output:                                                    │
│  {                                                          │
│    "handlingStrategy": "handle_all",                        │
│    "intentOrder": ["order_update", "product_inquiry"],      │
│    "canCombine": true,                                      │
│    "followUpNeeded": false                                  │
│  }                                                          │
│                                                              │
│  → Handle both intents in one response                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Fallback Flow

```
                    AI Classification
                           │
                           ▼
        ┌──────────────────┴──────────────────┐
        │                                      │
    Success?                            Failed?
        │                                      │
        ▼                                      ▼
   Parse JSON                    ┌─────────────────────┐
        │                        │                     │
        ▼                        ▼                     ▼
   Valid?                  Retry with          Use Keyword
        │                  explicit JSON       Fallback
        │                        │                     │
        ▼                        ▼                     ▼
   Return Result          Parse Again          keywordBasedIntentDetection()
        │                        │                     │
        │                        ▼                     │
        │                    Valid?                    │
        │                        │                     │
        │                        ▼                     │
        │                    Yes → Return            │
        │                    No → Fallback ──────────┘
        │
        ▼
   Cache & Return
```

---

## Key Patterns Detected

### Order Update Patterns:
```
Pattern: "make it (?:as )?\d+"
Examples:
  ✓ "make it 5"
  ✓ "make it as 5"
  ✓ "make it 5 boxes"

Pattern: "change (?:to|it to) \d+"
Examples:
  ✓ "change to 5"
  ✓ "change it to 5"
  ✓ "change to 5 pieces"

Pattern: "(?:i|we) like to make it (?:as )?\d+"
Examples:
  ✓ "I like to make it as 5"
  ✓ "we like to make it 5"

Pattern: "update (?:to|quantity|qty)"
Examples:
  ✓ "update to 5"
  ✓ "update quantity"
  ✓ "update qty"

Pattern: "add.*more"
Examples:
  ✓ "add 2 more"
  ✓ "add 3 more boxes"

Pattern: "remove.*from"
Examples:
  ✓ "remove 2 from order"
  ✓ "remove item from"

Pattern: "(?:increase|decrease).*to"
Examples:
  ✓ "increase to 5"
  ✓ "decrease to 2"
```

---

## Confidence Score Ranges

```
High Confidence (0.8 - 1.0):
  • Pattern-based detection (order updates)
  • Explicit keywords (support, greeting)
  • Clear intent with context

Medium Confidence (0.6 - 0.79):
  • Keyword-based detection
  • Some ambiguity present
  • Needs context validation

Low Confidence (0.5 - 0.59):
  • Fallback detection
  • Unclear intent
  • Default confidence

Very Low Confidence (< 0.5):
  • Rarely used
  • Indicates uncertainty
```

---

## Performance Metrics

```
Average Processing Time:
  • Cache hit: < 5ms
  • AI classification: 200-500ms
  • Fallback: < 10ms

Token Usage:
  • Prompt: ~200-300 tokens
  • Response: ~50-100 tokens
  • Total: ~300 tokens per classification

Cost:
  • GPT-4o-mini: ~$0.00005 per classification
  • Cache hit: $0 (no AI call)

Cache Hit Rate:
  • Target: > 30% (for common messages)
  • Reduces cost and latency
```

