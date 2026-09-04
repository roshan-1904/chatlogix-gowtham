/**
 * Shared types for the conversation processor pipeline.
 * Mirrors docs/CONVERSATION_PROCESSOR_LAMBDA.md §13-14.
 */

export type CartOp =
  // `notes`/`variantSku` accept `null` (not just `undefined`) because
  // OpenAI's strict structured-output mode requires every property to be
  // present and nullable rather than truly optional (spec §13, LLM-1's
  // response schema). `variantSku` must be one of Product.variants[].sku
  // when the product has variants (see prompts.ts's VARIANTS table) — never
  // invented, and never omitted for a variant-bearing product (CartEngine
  // fails the op closed rather than silently pricing from basePrice).
  | { type: 'add'; productId: string; qty: number; notes?: string | null; variantSku?: string | null }
  | { type: 'set_qty'; productId: string; qty: number; variantSku?: string | null } // absolute; 0 = remove
  | { type: 'remove'; productId: string; variantSku?: string | null }
  | { type: 'set_field'; field: 'address' | 'name' | 'notes' | 'delivery_date'; value: string }
  | { type: 'confirm' }
  // `orderNumber` targets a specific past order (from RECENT ORDERS) instead of
  // the conversation's own live draft — omitted = today's behavior unchanged.
  // Needed because a confirmed order stops being `hotSet.pendingOrder` (that
  // loader only ever returns `status: 'pending'`), so without this, "cancel my
  // order" silently did nothing once the order moved past pending.
  | { type: 'cancel'; orderNumber?: string | null }
  // Deterministic eligibility (CartEngine decides, never the model — same
  // reason prices come from Product, not the model): pending/confirmed +
  // within 7 days = auto-approved-and-cancelled; anything else is reported
  // back as `postSalesOutcome: 'refund_denied'` for a human to review.
  | { type: 'refund_request'; orderNumber?: string | null; reason?: string | null }
  // `category`/`details`/`orderNumber` let a handoff carry real context to the
  // vendor (a specific complaint/return/in-progress-order-cancel, not just
  // "check your dashboard") — see handoff.ts/postSalesAlert.ts.
  | { type: 'handoff'; category?: 'complaint' | 'return' | 'cancel_in_progress' | 'other' | null; details?: string | null; orderNumber?: string | null }
  | { type: 'noop' };

/**
 * Non-cart outcome of a turn's ops (refund/cancel-from-history), reported
 * back from CartEngine.apply so pipeline.ts can render a deterministic reply
 * (skip LLM-2, same reasoning as the existing handoffOp short-circuit — an
 * eligibility/money fact must never be phrased by a free-text model) and
 * decide whether to alert the vendor. CartEngine itself never sends
 * messages; it only ever reports state.
 */
export interface PostSalesOutcome {
  type: 'refund_approved' | 'refund_denied' | 'order_cancelled' | 'not_cancellable_at_this_stage';
  orderId: string;
  orderNumber: string;
  detail: string;
}

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
  variantSku?: string | null;
  variantLabel?: string | null;
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
  variants: unknown; // raw Product.variants Json — normalize via cart/variants.ts before use
}

/** One entry of `Product.variants` (Json), shape enforced by routes/products.ts's VariantSchema on write. */
export interface ProductVariant {
  sku: string;
  label: string;
  attributes: Record<string, string>;
  unit: string;
  baseQuantity: number;
  price: number; // paise
  isDivisible: boolean;
  isActive: boolean;
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
 * Compact catalog row (spec §11, `vendor:{id}:catalog_compact`). `price` is
 * raw paise, not a display-formatted string: this data layer never formats
 * for display, and CartEngine never prices from it (always resolves Product
 * directly, §14).
 *
 * `description` was originally left out of this row entirely ("no long
 * descriptions"). Reinstated: a vendor's Product.description is where
 * compatibility/eligibility notes and vendor-authored response instructions
 * actually live (e.g. "dividers only fit the 8x8 size", "confirm size
 * compatibility before ordering") — without it LLM-1 has no way to honor
 * them. Bounded by the same 2000-char cap routes/products.ts already
 * enforces on write, so this doesn't reopen unbounded prompt growth.
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
  variants: ProductVariant[]; // active only; empty for a plain single-price product
  description: string; // '' when the vendor left it blank
  // Whether the BASE product row (this entry's own price/unit/minQty/maxQty)
  // is itself directly orderable, independent of `variants`. A product can
  // have both: e.g. sold loose by weight (isDivisible: true, minQty/maxQty
  // meaningful) AND as fixed pre-packed variants. When false, the base
  // price/row is a reference/range only and an order MUST pick a variant
  // (see prompts.ts's variant-table rule) -- prompts.ts must surface this so
  // LLM-1 doesn't wrongly demand a variant pick for a divisible product.
  isDivisible: boolean;
}

/** Conversation memory (spec §11, `conv:{id}:memory`: "stage, facts, language"). */
export interface ConvMemory {
  stage: string;
  keyFacts: unknown[];
  language: string | null; // best-effort; CustomerInsights.preferredLanguage is the real fallback (§18)
  turnNumber: number;
}

/**
 * One of a customer's past orders with this vendor — NOT the current draft
 * cart (`pendingOrder` below is that). Scoped to customerId+vendorId, not
 * conversationId: a customer can have more than one Conversation row with
 * the same vendor, so a conversation-scoped query would silently miss an
 * order placed in a different one. This is what lets LLM-1 answer
 * "where's my order" from real data instead of improvising.
 */
export interface OrderHistoryEntry {
  id: string;
  orderNumber: string;
  items: unknown; // Json — parse with cart/snapshot.ts's parseOrderItems()
  totalAmount: number; // paise
  status: string;
  createdAt: Date;
  estimatedDelivery: Date | null;
  confirmedAt: Date | null;
  preparedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

/**
 * A vendor FAQ whose question-embedding matched the customer's *current*
 * message closely enough (prefetch.ts's loadFaqs, cosine similarity >=
 * FAQ_SIMILARITY_THRESHOLD). `similarity` is carried for logging/debugging
 * only — never rendered in the prompt.
 */
export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  similarity: number;
}

/** Result of the parallel prefetch (spec §11, §7 step 2). */
export interface HotSet {
  vendorConfig: VendorConfig;
  compactCatalog: CompactCatalogEntry[];
  memory: ConvMemory | null;
  pendingOrder: CartSnapshot | null;
  orderHistory: OrderHistoryEntry[]; // most recent first, up to 10
  // Unlike every other HotSet field, this is a function of the current
  // turn's message text, not stable across turns for the same
  // vendor/conversation — see prefetchHotSet's `messageText` parameter.
  faqs: FaqEntry[];
  insights: { name: string | null; address: string | null; language: string | null } | null;
  recentMessages: Array<{ role: 'customer' | 'assistant'; content: string }>;
}
