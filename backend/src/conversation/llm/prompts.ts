import type { HotSet, CompactCatalogEntry, OrderHistoryEntry, FaqEntry, VendorConfig } from '../types.js';
import { parseOrderItems } from '../cart/snapshot.js';
import { getPreparationTimeMessage, type OrderPreparationConfig } from '../../types/orderSettings.js';
import { PROMPT_CATALOG_DESC_MAX_CHARS } from '../context/catalogContextConfig.js';
import { CustomerInsightsService } from '../../services/customerInsightsService.js';
import type { CustomerInsightsContext } from '../../types/aiResponse.js';

/** Max characters per free-text CustomerInsights field in LLM-1 prompt (token budget). */
export const INSIGHTS_PROMPT_TEXT_FIELD_MAX_CHARS = 400;

const insightsFormatter = new CustomerInsightsService();

function truncateInsightText(value: string | undefined, maxChars: number): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars - 1)}…`;
}

function truncateInsightsForPrompt(insights: CustomerInsightsContext): CustomerInsightsContext {
  return {
    ...insights,
    basicDetails: truncateInsightText(insights.basicDetails, INSIGHTS_PROMPT_TEXT_FIELD_MAX_CHARS),
    preferences: truncateInsightText(insights.preferences, INSIGHTS_PROMPT_TEXT_FIELD_MAX_CHARS),
    communicationStyle: truncateInsightText(insights.communicationStyle, INSIGHTS_PROMPT_TEXT_FIELD_MAX_CHARS),
    currentOrder: truncateInsightText(insights.currentOrder, INSIGHTS_PROMPT_TEXT_FIELD_MAX_CHARS),
    deliveryInstructions: truncateInsightText(insights.deliveryInstructions, INSIGHTS_PROMPT_TEXT_FIELD_MAX_CHARS),
    specialRequests: truncateInsightText(insights.specialRequests, INSIGHTS_PROMPT_TEXT_FIELD_MAX_CHARS),
    dietaryRestrictions: truncateInsightText(insights.dietaryRestrictions, INSIGHTS_PROMPT_TEXT_FIELD_MAX_CHARS),
    paymentPreferences: truncateInsightText(insights.paymentPreferences, INSIGHTS_PROMPT_TEXT_FIELD_MAX_CHARS)
  };
}

/** Omit fields already shown in the CUSTOMER block to avoid duplication. */
function insightsSectionPayload(insights: CustomerInsightsContext): CustomerInsightsContext {
  return {
    ...truncateInsightsForPrompt(insights),
    customerName: undefined,
    primaryDeliveryAddress: undefined,
    deliveryAddress: '',
    preferredLanguage: undefined
  };
}

export function buildCustomerInsightsBlock(insights: CustomerInsightsContext | null): string | null {
  if (!insights || insights.isNewCustomer) return null;
  const formatted = insightsFormatter.formatInsightsForAI(insightsSectionPayload(insights)).trim();
  if (!formatted || formatted.startsWith('CUSTOMER WITH LIMITED HISTORY')) return null;
  return formatted;
}

/**
 * Same wording/emoji as whatsappTemplateService.ts's statusMessages map
 * (backend/src/services/whatsappTemplateService.ts:55-64) — kept as a local
 * copy rather than imported because that map lives on a private class
 * method there, but a customer should see the same status language whether
 * it comes from a vendor-triggered notification or an AI answer here.
 */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: '⏳ Order Received',
  confirmed: '✅ Order Confirmed',
  preparing: '👨‍🍳 Order Being Prepared',
  ready: '✅ Order Ready for Pickup',
  out_for_delivery: '🚚 Order Out for Delivery',
  delivered: '🎉 Order Delivered',
  cancelled: '❌ Order Cancelled'
};

/**
 * CSV-with-indented-continuation-lines table format (~40% fewer tokens than
 * JSON), matching unifiedAIProcessorService.ts's `toonTable()` convention —
 * structure only, this file does not import that one (§25: it's off-limits
 * for reuse except as a reference).
 */
function toonTable(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '(none)';
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const data = rows.map((r) => keys.map((k) => String(r[k] ?? '').replace(/,/g, ';')).join(',')).join('\n  ');
  return `  ${header}\n  ${data}`;
}

/**
 * Compact catalog as a prompt table. Unlike unifiedAIProcessorService.ts's
 * builder, this includes `id` (LLM-1's ops must reference an exact
 * productId) and keeps price as a display value only — CartEngine never
 * reads this table for pricing, it always resolves Product directly (§14).
 */
function truncateDescription(desc: string, maxChars: number): string {
  const flat = desc.replace(/\s+/g, ' ').trim();
  if (flat.length <= maxChars) return flat;
  const cut = flat.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed}…`;
}

export function buildCatalogTable(catalog: CompactCatalogEntry[], descMaxChars?: number): string {
  const descCap = descMaxChars ?? PROMPT_CATALOG_DESC_MAX_CHARS;
  const rows = catalog.map((p) => ({
    id: p.id,
    name: p.name,
    price: (p.price / 100).toFixed(2),
    unit: p.unit,
    baseQty: String(p.baseQuantity),
    minQty: p.minQty !== null ? String(p.minQty) : '',
    maxQty: p.maxQty !== null ? String(p.maxQty) : '',
    // "yes" = this base id/price/unit row is itself directly orderable (e.g.
    // sold loose by weight) even if the product also has variants below.
    // "no" = the base row is a reference/range only; a variantSku is
    // required to add this product. See the variant-table rule for how to
    // use this.
    baseOrderable: p.isDivisible ? 'yes' : 'no',
    keywords: p.keywords.join(' '),
    fulfillment: p.fulfillmentType,
    inStock: p.inStock ? 'yes' : 'no',
    stockQty: p.stockQuantity !== null ? String(p.stockQuantity) : '',
    // Flattened to one line (a literal newline would break a TOON row); commas
    // are escaped by toonTable() below like every other column.
    desc: p.description ? truncateDescription(p.description, descCap) : '',
    media:
      p.imageCount > 0 || p.videoCount > 0
        ? `${p.imageCount}img/${p.videoCount}vid${p.mediaLabels.length ? ` (${p.mediaLabels.join('; ')})` : ''}`
        : ''
  }));
  return toonTable(rows);
}

/**
 * One row per variant (size/material/etc sub-item), for products that have
 * them. A product's `price` in the table above is a range/reference only
 * when it has rows here — the real per-variant price is this table's `price`
 * column, and `sku` is the exact value `add`/`set_qty` ops must echo back as
 * `variantSku` (never invented — CartEngine rejects an unknown one rather
 * than falling back to the product's base price).
 */
export function buildVariantsTable(catalog: CompactCatalogEntry[]): string {
  const rows: Record<string, string>[] = [];
  for (const p of catalog) {
    for (const v of p.variants) {
      rows.push({
        productId: p.id,
        sku: v.sku,
        label: v.label,
        attrs: Object.entries(v.attributes).map(([k, val]) => `${k}=${val}`).join(';'),
        price: (v.price / 100).toFixed(2),
        hasImg: v.hasImage ? 'yes' : 'no'
      });
    }
  }
  return rows.length > 0 ? toonTable(rows) : '';
}

/**
 * Customer's past orders with this vendor, most recent first — grounding
 * data for "where's my order" style questions. Without this LLM-1 has
 * nothing to answer from and improvises ("I'm checking...") instead of
 * either reporting a real status or honestly saying there's no order.
 */
function buildOrderHistoryBlock(orderHistory: OrderHistoryEntry[]): string {
  if (orderHistory.length === 0) return '(none)';
  return orderHistory
    .map((o) => {
      const label = ORDER_STATUS_LABELS[o.status] || `📦 ${o.status}`;
      // productId(+variantSku) included per item so a repeat-order request can
      // emit real "add" ops directly — never invent one, same rule as the
      // product catalog above.
      const itemsSummary = parseOrderItems(o.items)
        .map((i) => `${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''} x${i.quantity} [${i.productId}${i.variantSku ? `,${i.variantSku}` : ''}]`)
        .join(', ') || '(no items)';
      // new Date(x) is a safe no-op when x is already a Date -- guards against
      // orderHistory coming from prefetch.ts's Redis cache-aside, where
      // JSON.parse (utils/redis.ts's getCached) leaves Date fields as strings.
      const placed = new Date(o.createdAt).toISOString().slice(0, 10);
      const parts = [`${o.orderNumber}: ${label} — ${itemsSummary} — Rs${(o.totalAmount / 100).toFixed(2)} — placed ${placed}`];
      if (o.estimatedDelivery) parts.push(`estimated delivery ${new Date(o.estimatedDelivery).toISOString().slice(0, 10)}`);
      if (o.status === 'cancelled' && o.cancellationReason) parts.push(`reason: ${o.cancellationReason}`);
      return `- ${parts.join(', ')}`;
    })
    .join('\n');
}

/**
 * FAQs whose embedding matched the customer's *current* message closely
 * enough (prefetch.ts's loadFaqs, cosine similarity >= FAQ_SIMILARITY_THRESHOLD).
 * Query-dependent, unlike every other dynamic-block input — must never move
 * into buildStaticBlock, since that block must stay identical across turns
 * for the same vendor to remain inside OpenAI's prompt-caching prefix.
 */
function buildFaqBlock(faqs: FaqEntry[]): string {
  if (faqs.length === 0) return '(none)';
  return faqs.map((f) => `- Q: ${f.question}\n  A: ${f.answer}`).join('\n');
}

/**
 * Vendor identity/rules — stable per vendor for OpenAI prompt-cache prefix.
 */
export function buildVendorRulesBlock(vendorConfig: VendorConfig): string {
  const v = vendorConfig;
  const parts: string[] = [];

  parts.push(`You are ${v.aiBotName || 'the assistant'} for ${v.businessName}, a WhatsApp ordering assistant.`);
  if (v.aiPersonality) parts.push(`Personality: ${v.aiPersonality}`);
  if (v.aiToneExample) parts.push(`Tone example: ${v.aiToneExample}`);
  if (v.aiSystemPrompt) parts.push(v.aiSystemPrompt);
  if (v.aiContentResponsibilities) parts.push(`Responsibilities: ${v.aiContentResponsibilities}`);
  if (v.aiContentConversationRules) parts.push(`Conversation rules: ${v.aiContentConversationRules}`);
  if (v.aiContentImportantInstructions) parts.push(`Important: ${v.aiContentImportantInstructions}`);

  parts.push('');
  parts.push('YOUR TASK: read the customer message and respond with cart OPERATIONS, never a full cart list.');
  parts.push('Rules:');
  parts.push('- "productId" in every op must be exactly one of the ids in the PRODUCT CATALOG table when that table is present. Never invent one.');
  parts.push(
    '- Only products listed in PRODUCT CATALOG (this turn) are in context. If the customer asks for something not listed, use "noop" and clarify, or emit knowledge_gap — do not invent ids.'
  );
  parts.push(
    "- If you cannot confidently match a product the customer mentioned, use \"noop\" and ask a clarifying question in draftReply instead of guessing."
  );
  parts.push('- "add" sums onto an existing line for the same productId; it never replaces the whole cart.');
  parts.push('- "set_qty" with qty=0 removes the line.');
  parts.push('- Only emit "confirm" when the customer clearly confirms the order.');
  parts.push(
    '- If the customer says they sent the same items again because there was no reply, keep that list once. Do not ask them to drop or choose between items they already named.'
  );
  parts.push(
    '- "intent" should be one of: add, remove, set_qty, set_field, confirm, cancel, refund_request, handoff, query, other — pick whichever best matches this turn\'s ops (or the customer\'s question, for "query").'
  );
  parts.push(
    '- CRITICAL: draftReply must never describe a cart change (adding/removing/updating an item, confirming an order, etc.) that isn\'t backed by a matching op in "ops" for this same turn. If you say it happened, the op must be there — never announce an action you did not encode.'
  );
  parts.push(
    '- Set "needsVerify": true whenever draftReply describes any cart change, or whenever you are not fully certain your "ops" completely and correctly reflect what draftReply says happened. Default to true if in doubt — false is only for replies that don\'t claim any change (answers, greetings, clarifying questions).'
  );
  parts.push(
    '- NEVER invent a delivery date, ETA, or "arrives on X" — only the vendor sets that after confirming. Use neutral prep-timing language instead.'
  );
  parts.push('- Keep catalog product names exactly as written above — do not translate brand/product names.');
  parts.push(
    '- For set_field ops (name, address, notes, delivery_date): always emit "value" in English / Latin script — transliterate personal and place names (e.g. Raji, Coimbatore); never use native Tamil/Devanagari/etc. script in set_field values.'
  );
  parts.push('- draftReply must be no more than about 120 words.');
  parts.push(
    '- Emoji: this rule overrides Personality and Tone example. No emoji on questions, clarifications, prices, cart updates, address or delivery asks, apologies, or cancellations. At most one emoji, and only when the customer just placed the order, or they thanked you or complimented you. Never a smiley and a heart on the same message.'
  );
  parts.push(
    '- Set "language" to an ISO 639-1 code for the customer\'s latest message (e.g. en, hi, ta, ml, kn, te, bn, gu, or mixed for code-switching).'
  );
  parts.push(
    "- Reply in the same language/script as the customer's latest message — English, Tamil, Hindi, Malayalam, Kannada, Telugu, Bengali, other regional languages, or a natural mix (Tanglish/Hinglish/Manglish)."
  );
  parts.push(
    '- If the customer asks about an order (status, "where is it", "did I already order", "last order", "eappo kidaikum"), answer directly from RECENT ORDERS below — state the exact order number and status. NEVER say "I\'m checking", "I\'ll get back to you", or "still checking" — you already have the data, right now, in this prompt. NEVER ask for their name, address, or product "to check the status" or "to look up the order". If RECENT ORDERS is empty, say plainly that you don\'t see any order on file and ask if they\'d like to place one.'
  );
  parts.push(
    '- If the customer wants to repeat/reorder a past order ("same as last time"), emit "add" ops using that order\'s exact productId/variantSku from RECENT ORDERS at the same quantity, unless they say otherwise. Don\'t ask them to re-describe what they ordered.'
  );
  parts.push(
    '- If the customer wants to cancel an order, emit "cancel" with that order\'s "orderNumber" from RECENT ORDERS (omit orderNumber only to cancel the cart in CURRENT CART above). You don\'t need to check its status yourself — the system will tell you if it can\'t be auto-cancelled.'
  );
  parts.push(
    '- If the customer asks for a refund, emit "refund_request" with the order\'s "orderNumber" (and their stated reason if given) — the system decides eligibility, you never do. Don\'t promise or deny a refund yourself in draftReply; just acknowledge you\'re processing the request.'
  );
  parts.push(
    '- For a complaint (wrong/damaged/late item) or a return request, emit "handoff" with category "complaint" or "return", "orderNumber" from RECENT ORDERS if one applies, and a one-line factual "details" summary of what the customer said. Don\'t try to resolve it yourself (no discount, replacement, or apology promises) — that\'s the vendor\'s call.'
  );
  parts.push(
    '- Emit "knowledge_gap" only when the customer asked for a product or policy fact that is NOT in PRODUCT CATALOG, PRODUCT VARIANTS, RELEVANT FAQs, or the vendor rules above as a concrete answer. Put a one-line English "question" (what is unknown), and category "product" or "policy". draftReply must be a short deferral in the customer\'s language — no invented sizes, prices, or ETAs. needsVerify: false. intent: "query".'
  );
  parts.push(
    '- If the catalog says "multiple sizes" (or similar) but PRODUCT VARIANTS is empty for that product, that IS a knowledge_gap (category "product") — do not invent sizes or say they will be confirmed as if the order is valid.'
  );
  parts.push(
    '- NEVER emit knowledge_gap for order status, last order, "did I already order", tracking, or "eappo kidaikum" in an order context — answer from RECENT ORDERS. NEVER say "I\'ll check / get back" on those turns.'
  );
  parts.push(
    '- When the customer asks to see a product photo, picture, image, or video (e.g. "show me", "photo irukka", "send pic"), emit "send_product_media" with the matched productId from PRODUCT CATALOG and optional kind "image" or "video" (null if either is fine). Never invent URLs or S3 keys. needsVerify: false. intent: "send_media" when this is the main action.'
  );
  parts.push(
    '- When they ask for a photo of a specific size/variant (e.g. "10x10 kadai photo"), include that row\'s exact "sku" as variantSku on send_product_media (from PRODUCT VARIANTS). If that row\'s hasImg is "no" but the product has general gallery media, omit variantSku so the pipeline can send product-level photos.'
  );
  parts.push(
    '- If the catalog "media" column is empty for that product AND no variant row has hasImg "yes", do NOT emit send_product_media — reply honestly that no photos/videos are uploaded yet; you may also emit knowledge_gap (category "product") asking the vendor to add catalog media.'
  );
  parts.push(
    '- NEVER emit send_product_media on order-status / tracking turns — answer from RECENT ORDERS only.'
  );
  parts.push(
    '- If PRODUCT VARIANTS already lists the asked size, answer from the table. If the asked size is missing but other rows exist, say so and list the real options (that is a grounded "no", not a gap). Prefer a clarifying question (noop) when a real variant pick would resolve it.'
  );

  if (v.aiDeliveryInstructions) parts.push(`Delivery info (advisory only, never a promised date): ${v.aiDeliveryInstructions}`);
  if (v.aiPickupDeliveryAddress) parts.push(`Pickup/delivery address: ${v.aiPickupDeliveryAddress}`);

  return parts.join('\n');
}

/**
 * Per-turn catalog + variants (sliced subset of active SKUs).
 */
export function buildCatalogBlock(catalogSlice: CompactCatalogEntry[]): string {
  const parts: string[] = [];

  if (catalogSlice.length === 0) {
    parts.push('PRODUCT CATALOG: (none in this turn — use RECENT ORDERS for order questions; do not invent products.)');
    return parts.join('\n');
  }

  parts.push('PRODUCT CATALOG (id,name,price,unit,baseQty,minQty,maxQty,baseOrderable,keywords,fulfillment,inStock,stockQty,desc):');
  parts.push(buildCatalogTable(catalogSlice));
  parts.push(
    '- "price" is the total for "baseQty" of "unit" on that row — NOT the per-unit price when baseQty is greater than 1. Example: price=550, unit=g, baseQty=350 means Rs 550 for a 350g pack, not Rs 550 per gram. When quoting or comparing sizes (e.g. "is this 1kg?"), use this — never divide price by 1 and call it the per-gram/per-ml rate unless baseQty is exactly 1.'
  );
  parts.push(
    "- A product's \"desc\" may contain compatibility/eligibility notes or vendor instructions (e.g. an accessory that only fits one size, or a step to confirm before an order is valid). Read it and apply it, not just recite it — e.g. warn the customer or ask the confirming question yourself before adding the item, don't wait for them to ask."
  );

  const variantsTable = buildVariantsTable(catalogSlice);
  if (variantsTable) {
    parts.push('');
    parts.push('PRODUCT VARIANTS (productId,sku,label,attrs,price):');
    parts.push(variantsTable);
    parts.push(
      '- If the catalog row\'s "baseOrderable" is "no": that productId\'s price/unit is a range/reference only — you MUST get the customer to pick a size/material/etc from this table and add it with that exact "variantSku". Never invent one, and never guess an attribute the customer didn\'t confirm — if what they ask for isn\'t a row here, say so and offer the closest real options instead.'
    );
    parts.push(
      '- If the catalog row\'s "baseOrderable" is "yes": that product can ALSO be added directly using the base productId with NO variantSku, at whatever quantity of its base "unit" the customer asked for (e.g. weight in kg) — this is a real, separate way to order it, not a fallback. Only use one of this product\'s variantSku rows instead when the customer clearly asked for one of those specific packaged options (e.g. a fixed box/pack size) rather than a bulk/weight amount.'
    );
  }

  return parts.join('\n');
}

export interface Llm1PromptOptions {
  sourceMessageType?: 'audio' | 'image';
  catalogSlice?: CompactCatalogEntry[];
}

/**
 * Turn-specific context — changes every message, so it comes after the
 * static block (outside OpenAI's cached prefix).
 */
export function buildDynamicBlock(hotSet: HotSet, opts?: Llm1PromptOptions): string {
  const parts: string[] = [];

  parts.push('CURRENT CART:');
  if (hotSet.pendingOrder && hotSet.pendingOrder.items.length > 0) {
    parts.push(
      hotSet.pendingOrder.items
        .map((i) => `- ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''} (${i.productId}) x${i.quantity} ${i.unit}`)
        .join('\n')
    );
    parts.push(`Total: Rs${(hotSet.pendingOrder.totalPaise / 100).toFixed(2)}`);
  } else {
    parts.push('(empty)');
  }
  parts.push(`Missing for confirm: ${hotSet.pendingOrder?.missing.join(', ') || 'name, address, items'}`);

  parts.push('');
  parts.push('CUSTOMER:');
  parts.push(
    `Name: ${hotSet.insights?.customerName || hotSet.pendingOrder?.customerName || '(unknown)'}`
  );
  parts.push(
    `Address: ${
      hotSet.insights?.primaryDeliveryAddress ||
      hotSet.insights?.deliveryAddress ||
      hotSet.pendingOrder?.address ||
      '(unknown)'
    }`
  );
  const language = hotSet.memory?.language || hotSet.insights?.preferredLanguage;
  if (language) parts.push(`Preferred language (fallback only — the latest message's language wins): ${language}`);

  const insightsBlock = buildCustomerInsightsBlock(hotSet.insights);
  if (insightsBlock) {
    parts.push('');
    parts.push('CUSTOMER INSIGHTS:');
    parts.push(insightsBlock);
  }

  parts.push('');
  parts.push('RECENT ORDERS (most recent first — this is the customer\'s real order history, not the cart above):');
  parts.push(buildOrderHistoryBlock(hotSet.orderHistory));
  const hasUnfulfilledOrder = hotSet.orderHistory.some((o) => ['pending', 'confirmed', 'preparing'].includes(o.status));
  if (hasUnfulfilledOrder) {
    const prepMessage = getPreparationTimeMessage(hotSet.vendorConfig.orderPreparationConfig as OrderPreparationConfig | null);
    parts.push(`Vendor's stated prep-time policy (use this for "how long" questions, don't invent your own): ${prepMessage}`);
  }

  parts.push('');
  parts.push("RELEVANT FAQs (only shown when similar to the customer's current message — use these facts verbatim, don't contradict them):");
  parts.push(buildFaqBlock(hotSet.faqs));

  if (hotSet.recentMessages.length > 0) {
    parts.push('');
    parts.push('RECENT CONVERSATION:');
    parts.push(hotSet.recentMessages.map((m) => `${m.role}: ${m.content}`).join('\n'));
  }

  if (opts?.sourceMessageType === 'audio') {
    parts.push('');
    parts.push(
      'VOICE NOTE: the customer message is a speech-to-text transcript of a WhatsApp voice note, not typed text. It may contain ASR errors.'
    );
    parts.push(
      '- If the transcript is garbled, internally contradictory, or about something clearly outside this vendor\'s catalog, ask a short clarifying question. Do not invent a medical issue, street address, or product the customer did not mention.'
    );
    parts.push(
      '- When the transcript is close to something already in CURRENT CART or RECENT ORDERS (cake, brownie, kg, boxes), prefer that reading over an unrelated topic.'
    );
  }

  return parts.join('\n');
}

export function buildLlm1SystemPrompt(hotSet: HotSet, opts?: Llm1PromptOptions): string {
  const catalogSlice = opts?.catalogSlice ?? hotSet.compactCatalog;
  return `${buildVendorRulesBlock(hotSet.vendorConfig)}\n\n${buildCatalogBlock(catalogSlice)}\n\n${buildDynamicBlock(hotSet, opts)}`;
}

const cartOpSchema = {
  anyOf: [
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['add'] },
        productId: { type: 'string' },
        qty: { type: 'number' },
        notes: { type: ['string', 'null'] },
        variantSku: { type: ['string', 'null'] }
      },
      required: ['type', 'productId', 'qty', 'notes', 'variantSku'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['set_qty'] },
        productId: { type: 'string' },
        qty: { type: 'number' },
        variantSku: { type: ['string', 'null'] }
      },
      required: ['type', 'productId', 'qty', 'variantSku'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['remove'] },
        productId: { type: 'string' },
        variantSku: { type: ['string', 'null'] }
      },
      required: ['type', 'productId', 'variantSku'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['set_field'] },
        field: { type: 'string', enum: ['address', 'name', 'notes', 'delivery_date'] },
        value: { type: 'string' }
      },
      required: ['type', 'field', 'value'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: { type: { type: 'string', enum: ['confirm'] } },
      required: ['type'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['cancel'] },
        orderNumber: { type: ['string', 'null'] }
      },
      required: ['type', 'orderNumber'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['refund_request'] },
        orderNumber: { type: ['string', 'null'] },
        reason: { type: ['string', 'null'] }
      },
      required: ['type', 'orderNumber', 'reason'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['handoff'] },
        category: { type: ['string', 'null'], enum: ['complaint', 'return', 'cancel_in_progress', 'other', null] },
        details: { type: ['string', 'null'] },
        orderNumber: { type: ['string', 'null'] }
      },
      required: ['type', 'category', 'details', 'orderNumber'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['knowledge_gap'] },
        question: { type: 'string' },
        category: { type: ['string', 'null'], enum: ['product', 'policy', 'other', null] },
        productId: { type: ['string', 'null'] }
      },
      required: ['type', 'question', 'category', 'productId'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['send_product_media'] },
        productId: { type: 'string' },
        kind: { type: ['string', 'null'], enum: ['image', 'video', null] },
        variantSku: { type: ['string', 'null'] }
      },
      required: ['type', 'productId', 'kind', 'variantSku'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: { type: { type: 'string', enum: ['noop'] } },
      required: ['type'],
      additionalProperties: false
    }
  ]
};

/**
 * Strict OpenAI Structured Outputs schema for Llm1Result (spec §13). `strict`
 * mode requires every property to appear in `required` and forbids
 * `additionalProperties` — there is no "optional" in strict JSON Schema, only
 * nullable, which is why CartOp's `add.notes` is `[string, null]` here (and
 * `string | null` in types.ts) rather than a bare optional string.
 */
export const llm1JsonSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    language: {
      type: 'string',
      description: 'ISO 639-1 code for the customer message (en, hi, ta, ml, kn, te, bn, gu, …) or mixed for code-switching'
    },
    intent: { type: 'string' },
    ops: { type: 'array', items: cartOpSchema },
    draftReply: { type: 'string' },
    confidence: { type: 'number' },
    needsVerify: { type: 'boolean' }
  },
  required: ['language', 'intent', 'ops', 'draftReply', 'confidence', 'needsVerify'],
  additionalProperties: false
};
