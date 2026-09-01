/**
 * Shared types for the conversation processor pipeline.
 * Mirrors docs/CONVERSATION_PROCESSOR_LAMBDA.md §13-14.
 */

export type CartOp =
  // `notes` accepts `null` (not just `undefined`) because OpenAI's strict
  // structured-output mode requires every property to be present and
  // nullable rather than truly optional (spec §13, LLM-1's response schema).
  | { type: 'add'; productId: string; qty: number; notes?: string | null }
  | { type: 'set_qty'; productId: string; qty: number } // absolute; 0 = remove
  | { type: 'remove'; productId: string }
  | { type: 'set_field'; field: 'address' | 'name' | 'notes' | 'delivery_date'; value: string }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'handoff' }
  | { type: 'noop' };

export interface Llm1Result {
  language: 'en' | 'ta' | 'hi' | 'mixed';
  intent: string; // telemetry only — CartEngine does not trust this for writes
  ops: CartOp[];
  draftReply: string;
  confidence: number; // 0-1
  needsVerify: boolean;
}

export interface CartLine {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  unitPricePaise: number;
  lineTotalPaise: number;
  notes?: string | null;
}

export interface CartSnapshot {
  orderId: string | null;
  status: string;
  items: CartLine[];
  totalPaise: number;
  customerName: string | null;
  address: string | null;
  missing: Array<'name' | 'address' | 'items'>;
}

/** Fields CartEngine needs from a Product row to price a line and check availability. */
export interface ProductForPricing {
  id: string;
  name: string;
  baseUnit: string;
  baseQuantity: unknown; // Prisma Decimal
  basePrice: number; // paise, price for `baseQuantity` units
  fulfillmentType: 'stock' | 'made_to_order';
  inStock: boolean;
  stockQuantity: unknown; // Prisma Decimal | null
  minOrderQuantity: unknown; // Prisma Decimal | null
  maxOrderQuantity: unknown; // Prisma Decimal | null
}

/**
 * Vendor identity/prompts/tone/timezone (spec §11 hot set, `vendor:{id}:config`).
 * `aiModel` is always a resolved, non-null model string here — the
 * `vendor.aiModel || 'gpt-4.1-mini'` fallback (Q10; the correct pattern lives
 * in aiService.ts, not unifiedAIProcessorService.ts, which never applies it)
 * is applied once in prefetch.ts so every downstream reader gets a valid model.
 */
export interface VendorConfig {
  id: string;
  businessName: string;
  aiBotName: string | null;
  aiPersonality: string | null;
  aiSystemPrompt: string | null;
  aiGreeting: string | null;
  aiClosing: string | null;
  aiToneExample: string | null;
  aiContentResponsibilities: string | null;
  aiContentConversationRules: string | null;
  aiContentImportantInstructions: string | null;
  aiDeliveryInstructions: string | null;
  aiPickupDeliveryAddress: string | null;
  orderPreparationConfig: unknown;
  timezone: string;
  aiModel: string;
  askForPreferredDeliveryDate: boolean;
}

/**
 * Compact catalog row (spec §11, `vendor:{id}:catalog_compact`) — exactly the
 * fields listed in the spec, no long descriptions. `price` is raw paise, not
 * a display-formatted string: this data layer never formats for display, and
 * CartEngine never prices from it (always resolves Product directly, §14).
 */
export interface CompactCatalogEntry {
  id: string;
  name: string;
  price: number; // paise
  unit: string;
  minQty: number | null;
  maxQty: number | null;
  keywords: string[];
  fulfillmentType: 'stock' | 'made_to_order';
  inStock: boolean;
  stockQuantity: number | null;
}

/** Conversation memory (spec §11, `conv:{id}:memory`: "stage, facts, language"). */
export interface ConvMemory {
  stage: string;
  keyFacts: unknown[];
  language: string | null; // best-effort; CustomerInsights.preferredLanguage is the real fallback (§18)
  turnNumber: number;
}

/** Result of the parallel prefetch (spec §11, §7 step 2). */
export interface HotSet {
  vendorConfig: VendorConfig;
  compactCatalog: CompactCatalogEntry[];
  memory: ConvMemory | null;
  pendingOrder: CartSnapshot | null;
  insights: { name: string | null; address: string | null; language: string | null } | null;
  recentMessages: Array<{ role: 'customer' | 'assistant'; content: string }>;
}
