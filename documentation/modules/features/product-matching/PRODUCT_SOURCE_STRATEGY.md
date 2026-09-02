# Product Source Strategy - Multi-Stage AI System

**Date:** December 2024  
**Status:** ✅ Implemented with Fallback

---

> **2026-09 note:** this describes the old multi-stage pipeline's `contextFetcherService.ts`, no longer on the hot path for live WhatsApp traffic (see `docs/CONVERSATION_WORKER_GAPS.md` §1). The current live pipeline (`backend/src/conversation/*`) reads products directly from the `Product` table only (`backend/src/conversation/prefetch.ts`'s `loadCompactCatalog`) — there is no `vendor.aiProducts` JSON fallback in that code path. Kept here as historical record; if any vendor still relies on the `aiProducts` fallback instead of a migrated `Product` catalog, they'd need to be on the old pipeline for it to apply, which isn't the case for live traffic today.

---

## 📋 Current Implementation

### **Primary Source: Product Catalog Table**
The multi-stage AI system uses the **Product catalog table** (`prisma.product`) as the primary source for product information.

**Location:** `backend/src/services/contextFetcherService.ts` (Stage 2)

**Query:**
```typescript
const products = await prisma.product.findMany({
  where: { vendorId, isActive: true },
  select: {
    id: true,
    name: true,
    basePrice: true,
    baseUnit: true,
    keywords: true,
    inStock: true,
    description: true
  }
});
```

---

### **Fallback: vendor.aiProducts JSON**
If the Product catalog table is empty, the system automatically falls back to `vendor.aiProducts` JSON field.

**Fallback Logic:**
1. Check if Product table has products (`products.length > 0`)
2. If empty, fetch `vendor.aiProducts` from Vendor table
3. Parse JSON and normalize to Product table format
4. Cache normalized products for future use

**Normalization:**
- Maps legacy `aiProducts` format to Product table structure
- Converts prices from rupees to paise (multiply by 100)
- Handles both `{products: [...]}` and `[...]` formats
- Generates IDs for legacy products (`legacy_${name}`)

---

## 🔄 Product Source Priority

```
1. Product Catalog Table (prisma.product) ← PRIMARY
   ↓ (if empty)
2. vendor.aiProducts JSON ← FALLBACK
   ↓ (if empty/invalid)
3. Empty Array []
```

---

## 📊 Where Products Are Used

### **Stage 2: Context-Aware Data Fetching**
- Fetches products based on intent
- Filters to relevant products if mentioned
- Caches products for performance

### **Stage 3: Prompt Construction**
- Includes product information in AI prompts
- Formats products for AI consumption
- Limits to 5 products for token efficiency

### **Stage 4.5: Order Update Validation**
- Validates products exist and are available
- Checks prices and quantities

### **Stage 7.5: Data Validation**
- Validates extracted order items against product catalog
- Ensures products exist before saving orders

---

## 🎯 Benefits

1. **Primary Source:** Product catalog table provides structured, normalized data
2. **Backward Compatibility:** Fallback ensures vendors without migrated products still work
3. **Performance:** Caching reduces database queries
4. **Data Integrity:** Validates products exist before processing orders

---

## ⚠️ Migration Notes

- **Vendors with Product table:** Uses Product catalog (primary)
- **Vendors without Product table:** Uses `vendor.aiProducts` (fallback)
- **Both empty:** Returns empty array (no products available)

---

## 🔍 Monitoring

The system logs:
- When fallback is used: `"Using vendor.aiProducts fallback"`
- Product count from fallback
- Parse errors if `aiProducts` JSON is invalid

---

## 📝 Example

**Scenario 1: Vendor has Product table**
```typescript
// Fetches from Product table
products = [
  { id: "prod_1", name: "Brownie", basePrice: 5000, ... },
  { id: "prod_2", name: "Cookie", basePrice: 3000, ... }
]
```

**Scenario 2: Vendor only has aiProducts**
```typescript
// Falls back to vendor.aiProducts
vendor.aiProducts = '{"products": [{"name": "Brownie", "price": 50, "unit": "piece"}]}'
// Normalized to:
products = [
  { id: "legacy_Brownie", name: "Brownie", basePrice: 5000, ... }
]
```

---

**Status:** ✅ Implemented with fallback support  
**Next:** Monitor fallback usage and encourage Product table migration

