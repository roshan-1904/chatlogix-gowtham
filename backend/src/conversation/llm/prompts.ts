import type { HotSet, CompactCatalogEntry } from '../types.js';

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
export function buildCatalogTable(catalog: CompactCatalogEntry[]): string {
  const rows = catalog.map((p) => ({
    id: p.id,
    name: p.name,
    price: (p.price / 100).toFixed(2),
    unit: p.unit,
    minQty: p.minQty !== null ? String(p.minQty) : '',
    maxQty: p.maxQty !== null ? String(p.maxQty) : '',
    keywords: p.keywords.join(' '),
    fulfillment: p.fulfillmentType,
    inStock: p.inStock ? 'yes' : 'no',
    stockQty: p.stockQuantity !== null ? String(p.stockQuantity) : '',
    // Flattened to one line (a literal newline would break a TOON row); commas
    // are escaped by toonTable() below like every other column.
    desc: p.description ? p.description.replace(/\s+/g, ' ').trim() : ''
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
        price: (v.price / 100).toFixed(2)
      });
    }
  }
  return rows.length > 0 ? toonTable(rows) : '';
}

/**
 * Vendor identity/rules/catalog — identical across turns for the same
 * vendor, so it belongs first in the system prompt to stay inside OpenAI's
 * automatic prompt-caching prefix (matches unifiedAIProcessorService.ts's
 * static/dynamic split convention).
 */
function buildStaticBlock(hotSet: HotSet): string {
  const v = hotSet.vendorConfig;
  const parts: string[] = [];

  parts.push(`You are ${v.aiBotName || 'the assistant'} for ${v.businessName}, a WhatsApp ordering assistant.`);
  if (v.aiPersonality) parts.push(`Personality: ${v.aiPersonality}`);
  if (v.aiToneExample) parts.push(`Tone example: ${v.aiToneExample}`);
  if (v.aiSystemPrompt) parts.push(v.aiSystemPrompt);
  if (v.aiContentResponsibilities) parts.push(`Responsibilities: ${v.aiContentResponsibilities}`);
  if (v.aiContentConversationRules) parts.push(`Conversation rules: ${v.aiContentConversationRules}`);
  if (v.aiContentImportantInstructions) parts.push(`Important: ${v.aiContentImportantInstructions}`);

  parts.push('');
  parts.push('PRODUCT CATALOG (id,name,price,unit,minQty,maxQty,keywords,fulfillment,inStock,stockQty,desc):');
  parts.push(buildCatalogTable(hotSet.compactCatalog));
  parts.push(
    "- A product's \"desc\" may contain compatibility/eligibility notes or vendor instructions (e.g. an accessory that only fits one size, or a step to confirm before an order is valid). Read it and apply it, not just recite it — e.g. warn the customer or ask the confirming question yourself before adding the item, don't wait for them to ask."
  );

  const variantsTable = buildVariantsTable(hotSet.compactCatalog);
  if (variantsTable) {
    parts.push('');
    parts.push('PRODUCT VARIANTS (productId,sku,label,attrs,price):');
    parts.push(variantsTable);
    parts.push(
      "- A productId listed above is a range/reference price only — the real price is this table's. Ask the customer to pick a size/material/etc from this table before adding it."
    );
    parts.push(
      '- "variantSku" on an "add"/"set_qty" op for such a product must be exactly one of the "sku" values shown here. Never invent one, and never guess a size/attribute the customer didn\'t confirm exists — if what they ask for isn\'t a row here, say so and offer the closest real options instead.'
    );
  }

  parts.push('');
  parts.push('YOUR TASK: read the customer message and respond with cart OPERATIONS, never a full cart list.');
  parts.push('Rules:');
  parts.push('- "productId" in every op must be exactly one of the ids in the catalog above. Never invent one.');
  parts.push(
    "- If you cannot confidently match a product the customer mentioned, use \"noop\" and ask a clarifying question in draftReply instead of guessing."
  );
  parts.push('- "add" sums onto an existing line for the same productId; it never replaces the whole cart.');
  parts.push('- "set_qty" with qty=0 removes the line.');
  parts.push('- Only emit "confirm" when the customer clearly confirms the order.');
  parts.push(
    '- NEVER invent a delivery date, ETA, or "arrives on X" — only the vendor sets that after confirming. Use neutral prep-timing language instead.'
  );
  parts.push('- Keep catalog product names exactly as written above — do not translate brand/product names.');
  parts.push('- draftReply must be no more than about 120 words.');
  parts.push(
    "- Reply in the same language/script as the customer's latest message (English, Tamil, Hindi, Tanglish/Hinglish, or a natural mix)."
  );

  if (v.aiDeliveryInstructions) parts.push(`Delivery info (advisory only, never a promised date): ${v.aiDeliveryInstructions}`);
  if (v.aiPickupDeliveryAddress) parts.push(`Pickup/delivery address: ${v.aiPickupDeliveryAddress}`);

  return parts.join('\n');
}

/**
 * Turn-specific context — changes every message, so it comes after the
 * static block (outside OpenAI's cached prefix).
 */
function buildDynamicBlock(hotSet: HotSet): string {
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
  parts.push(`Name: ${hotSet.insights?.name || hotSet.pendingOrder?.customerName || '(unknown)'}`);
  parts.push(`Address: ${hotSet.insights?.address || hotSet.pendingOrder?.address || '(unknown)'}`);
  const language = hotSet.memory?.language || hotSet.insights?.language;
  if (language) parts.push(`Preferred language (fallback only — the latest message's language wins): ${language}`);

  if (hotSet.recentMessages.length > 0) {
    parts.push('');
    parts.push('RECENT CONVERSATION:');
    parts.push(hotSet.recentMessages.map((m) => `${m.role}: ${m.content}`).join('\n'));
  }

  return parts.join('\n');
}

export function buildLlm1SystemPrompt(hotSet: HotSet): string {
  return `${buildStaticBlock(hotSet)}\n\n${buildDynamicBlock(hotSet)}`;
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
      properties: { type: { type: 'string', enum: ['cancel'] } },
      required: ['type'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: { type: { type: 'string', enum: ['handoff'] } },
      required: ['type'],
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
    language: { type: 'string', enum: ['en', 'ta', 'hi', 'mixed'] },
    intent: { type: 'string' },
    ops: { type: 'array', items: cartOpSchema },
    draftReply: { type: 'string' },
    confidence: { type: 'number' },
    needsVerify: { type: 'boolean' }
  },
  required: ['language', 'intent', 'ops', 'draftReply', 'confidence', 'needsVerify'],
  additionalProperties: false
};
