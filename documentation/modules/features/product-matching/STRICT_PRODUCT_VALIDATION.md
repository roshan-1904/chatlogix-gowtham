# Strict Product Validation - No Generic Responses

**Date:** December 2024  
**Status:** ✅ Implemented

---

> **2026-09 note:** `promptBuilderService.ts`, `primaryAIResponseService.ts`, `messageCompositionService.ts`, and `messageFormatter.ts`'s `validateProductsInMessage()` are part of the old, pre-Lambda multi-stage pipeline, not on the hot path for live WhatsApp traffic (see `docs/CONVERSATION_WORKER_GAPS.md` §1). The current live pipeline (`backend/src/conversation/*`) enforces the same "only mention catalog products" intent structurally rather than by prompt instruction: `productId` in every cart op must exactly match an id in the compact catalog table (`backend/src/conversation/llm/prompts.ts`), and `validateProductIds`/`resolveProduct` (`backend/src/conversation/cart/productResolve.ts`) reject any id the LLM didn't copy from the catalog before it ever reaches `CartEngine`. Kept here as historical record of the retired pipeline's prompt-based approach.

---

## 🔴 Problem Identified

The AI was giving **generic or assumed responses** about products instead of being strict about actual product details from the catalog.

**Example Issue:**
- Customer asks: "What flavors do you have?"
- AI responds: "Classic Chocolate Brownie, Walnut Brownie, Dark Chocolate Brownie..." (generic products not in catalog)
- **Problem:** These products might not exist in the actual catalog

---

## ✅ Solution Implemented

### **1. Strict Product Rules in Prompts**

**Files Modified:**
- `backend/src/services/promptBuilderService.ts`
- `backend/src/services/primaryAIResponseService.ts`
- `backend/src/services/messageCompositionService.ts`

**Changes:**
- Added explicit instructions: **"ONLY mention products from the catalog"**
- Added warning: **"DO NOT invent, assume, or mention products NOT in catalog"**
- Added fallback response: **"I don't have that product available. Let me show you what I have."**

---

### **2. Enhanced Product Formatting**

**File:** `backend/src/services/promptBuilderService.ts`

**Before:**
```typescript
// Only showed 5 products, limited info
Products: Brownie - ₹50/piece, Cookie - ₹30/piece
```

**After:**
```typescript
// Shows ALL products with full details
AVAILABLE PRODUCTS (ONLY mention these - do not invent others):
1. Ilupaipoo Blondie with Milk Choco - ₹120/piece (Available) [Keywords: blondie, chocolate]
2. Karuppu Kavuni Rice Brownie with Choco topping - ₹150/piece (Available) [Keywords: brownie, rice]
...
```

**Benefits:**
- AI sees ALL available products
- Includes keywords for better matching
- Includes stock status
- Clear formatting with numbers

---

### **3. Product Context by Intent**

**Product Inquiry Intent:**
- Shows **ALL available products** (not just 5)
- Explicit instruction: "ONLY mention these"

**Order Intent:**
- Shows mentioned products + all products for validation
- Ensures AI validates against catalog

**Greeting Intent:**
- Shows all products so AI can mention them naturally

---

### **4. Post-Processing Validation**

**File:** `backend/src/utils/messageFormatter.ts`

Added `validateProductsInMessage()` function:
- Validates products mentioned in response
- Filters out products not in catalog
- Keeps only valid product mentions

---

## 📋 Implementation Details

### **Prompt Structure**

```
CRITICAL PRODUCT RULES - STRICTLY ENFORCE:
- ONLY mention products that are explicitly listed in the "Products" section below
- DO NOT invent, assume, or mention products that are NOT in the provided product catalog
- DO NOT use generic product names (e.g., "brownie", "cookie") unless they match EXACT product names in catalog
- If customer asks about a product not in catalog, politely say: "I don't have that product in my catalog. Let me show you what I have available."
- Always use EXACT product names from the catalog (case-insensitive matching is OK)
- If no products are provided in context, DO NOT mention any specific products - ask customer what they're looking for instead
```

### **Product Formatting**

```typescript
function formatRelevantProducts(products: any[]): string {
  return products.map((p, index) => {
    return `${index + 1}. ${p.name} - ₹${price}/${p.baseUnit} (${stock}) [Keywords: ${keywords}]`;
  }).join('\n');
}
```

---

## 🎯 Expected Results

### **Before:**
```
Customer: "What flavors do you have?"
AI: "Hi! I have Classic Chocolate Brownie, Walnut Brownie, Dark Chocolate Brownie..."
```
❌ Generic products not in catalog

### **After:**
```
Customer: "What flavors do you have?"
AI: "Here's what I have available:\n\n1. Ilupaipoo Blondie with Milk Choco - ₹120/piece\n2. Karuppu Kavuni Rice Brownie with Choco topping - ₹150/piece\n\nWhich one would you like?"
```
✅ Only actual products from catalog

---

## 🔍 Validation Points

1. **Stage 2:** Fetches products from catalog (with fallback to `vendor.aiProducts`)
2. **Stage 3:** Formats products with strict instructions
3. **Stage 4:** AI generates response with product rules
4. **Stage 7:** Message composition includes product validation
5. **Post-Processing:** Validates products mentioned in final message

---

## ⚠️ Fallback Behavior

**If No Products in Catalog:**
- AI explicitly told: "No products in catalog. DO NOT mention any specific products."
- AI responds: "I don't have any products available right now. How can I help you?"

**If Customer Asks About Non-Existent Product:**
- AI responds: "I don't have that product available. Let me show you what I have."

---

## 📊 Monitoring

The system logs:
- Products fetched from catalog
- Products passed to AI prompts
- Any fallback to `vendor.aiProducts`

---

**Status:** ✅ Implemented  
**Next:** Test with real conversations to ensure no generic products are mentioned

