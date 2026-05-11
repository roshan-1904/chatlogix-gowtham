/**
 * Unified AI Processor Service
 *
 * Phase 2 optimization: Collapses Stages 0, 1, 1.5, 1.7, 3, 4, and 6 into a
 * single OpenAI call with structured output.
 *
 * Before: 5–6 sequential AI calls ≈ 30–40 s
 * After:  1 AI call               ≈  8–12 s
 */

import { logger } from '../logger.js';
import { env } from '../config/env.js';
import OpenAI from 'openai';
import { calculateCostFromUsage } from '../utils/costCalculator.js';
import { IntentClassification } from '../types/multiStage.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

// All supported intent types
const VALID_INTENTS = [
  'order_new', 'order_update', 'confirm_order', 'cancel_order', 'order_status',
  'product_inquiry', 'greeting', 'support', 'complaint', 'refund_request',
  'return_request', 'repeat_order', 'delivery_inquiry', 'payment_inquiry',
  'feedback', 'account_inquiry', 'other'
] as const;

export type UnifiedIntent = typeof VALID_INTENTS[number];

export interface UnifiedAIResult {
  // Stage 0 equivalents
  normalizedMessage: string;
  language: string;

  // Stage 1 equivalents
  primaryIntent: UnifiedIntent;
  secondaryIntents: string[];
  confidence: number;
  extractedInfo: IntentClassification['extractedInfo'];
  needsMoreContext: boolean;
  reasoning: string;

  // Stage 1.7 equivalents
  isCorrection: boolean;
  correctedField: string | null;
  correctedValue: string | null;

  // Stage 4 equivalents (response + extracted data)
  response: string;
  needsClarification: boolean;
  orderItems: Array<{ name: string; quantity: number; unit?: string; notes?: string }>;
  deliveryAddress: string | null;
  customerName: string | null;
  specialRequests: string | null;
  conversationStage: 'greeting' | 'information_gathering' | 'order_confirmation' | 'closing';

  // Cost / meta
  tokensUsed: number;
  cost: number;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

// ---------------------------------------------------------------------------
// Prompt building helpers
// ---------------------------------------------------------------------------

/**
 * TOON-style encoding for uniform arrays (CSV table format).
 * ~40% fewer tokens vs JSON for product catalogs.
 * Format:  header_row\n  data_row\n  data_row ...
 */
function toonTable(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const data = rows.map(r => keys.map(k => {
    const v = String(r[k] ?? '').replace(/,/g, ';'); // escape commas
    return v;
  }).join(',')).join('\n  ');
  return `  ${header}\n  ${data}`;
}

function normalizeVariants(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  }
  return [];
}

function buildProductSection(products: any[]): string {
  if (!products || products.length === 0) return 'None available';
  const active = products.filter((p: any) => p.isActive !== false);
  if (active.length === 0) return 'None available';
  const rows = active.map((p: any) => {
    const variants = normalizeVariants(p.variants).filter((v: any) => v.isActive !== false);
    const minQty = p.minOrderQuantity ? String(p.minOrderQuantity) : '';

    // When variants exist, show price range; otherwise single basePrice
    let priceStr = '';
    if (variants.length > 0) {
      const prices = variants.map((v: any) => Number(v.price)).filter((n: number) => Number.isFinite(n));
      if (prices.length > 0) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        priceStr = min === max ? `Rs${(min / 100).toFixed(0)}` : `Rs${(min / 100).toFixed(0)}-Rs${(max / 100).toFixed(0)}`;
      }
    }
    if (!priceStr) {
      const priceRaw = p.basePrice ?? p.price;
      priceStr = priceRaw != null ? `Rs${(priceRaw / 100).toFixed(0)}` : '';
    }

    return {
      name:     p.name || '',
      price:    priceStr,
      unit:     p.baseUnit || '',
      baseQty:  p.baseQuantity != null ? String(p.baseQuantity) : '1',
      minQty,
      desc:     p.description ? String(p.description).slice(0, 2000).replace(/\s+/g, ' ').replace(/,/g, ';').trim() : '',
      keywords: Array.isArray(p.keywords) ? p.keywords.slice(0, 6).join(' ') : ''
    };
  });
  return toonTable(rows);
}

function buildVariantsSection(products: any[]): string {
  if (!products || products.length === 0) return '';
  const rows: Record<string, string>[] = [];
  for (const p of products) {
    if (p.isActive === false) continue;
    const variants = normalizeVariants(p.variants);
    for (const v of variants) {
      if (v.isActive === false) continue;
      const attrs = v.attributes && typeof v.attributes === 'object'
        ? Object.entries(v.attributes).map(([k, val]) => `${k}=${val}`).join(';')
        : '';
      const price = Number.isFinite(Number(v.price)) ? `Rs${(Number(v.price) / 100).toFixed(0)}` : '';
      rows.push({
        product:  p.name || '',
        label:    v.label || '',
        attrs,
        price,
        unit:     v.unit || p.baseUnit || '',
        baseQty:  v.baseQuantity != null ? String(v.baseQuantity) : '1',
        sku:      v.sku || ''
      });
    }
  }
  if (rows.length === 0) return '';
  return toonTable(rows);
}

function buildConversationSection(history: any[]): string {
  if (!history || history.length === 0) return 'No prior messages';
  return history
    .slice(-10)
    .map((m: any) => `${m.senderType === 'customer' ? 'Customer' : 'Assistant'}: ${m.content}`)
    .join('\n');
}

/**
 * Scan recent conversation for an address the customer already provided
 * (assistant asked for address, then customer replied with address-like content).
 */
function findRecentlyProvidedAddress(history: any[]): string | null {
  if (!history?.length) return null;
  const last6 = history.slice(-6);
  for (let i = last6.length - 1; i >= 1; i--) {
    const msg = last6[i];
    const prev = last6[i - 1];
    if (msg.senderType === 'customer' && prev.senderType === 'assistant') {
      const assistantAsked = /delivery\s*address|your\s*address|provide.*address|share.*address/i.test(prev.content);
      const looksLikeAddress =
        (/(?:road|street|nagar|colony|layout|heights|apartment|flat|floor|block|sector|phase|plot|\d{6})/i.test(msg.content) &&
          msg.content.split(',').length >= 2) ||
        /\b\d{6}\b/.test(msg.content);
      if (assistantAsked && looksLikeAddress) {
        return msg.content.trim();
      }
    }
  }
  return null;
}

/**
 * Scan recent conversation for a name the customer already provided
 * (assistant asked for name, then customer replied with a short name-like response).
 */
function findRecentlyProvidedName(history: any[]): string | null {
  if (!history?.length) return null;
  const last6 = history.slice(-6);
  for (let i = last6.length - 1; i >= 1; i--) {
    const msg = last6[i];
    const prev = last6[i - 1];
    if (msg.senderType === 'customer' && prev.senderType === 'assistant') {
      const assistantAsked = /your\s*name|provide.*name|what.*name|may\s*I\s*know\s*your\s*name/i.test(prev.content);
      const cleaned = msg.content.trim();
      const looksLikeName = cleaned.length >= 2 && cleaned.length <= 60 &&
        cleaned.split(/\s+/).length <= 4 &&
        !/\d/.test(cleaned) &&
        !/road|street|nagar|order|cancel|kg|box/i.test(cleaned);
      if (assistantAsked && looksLikeName) {
        return cleaned;
      }
    }
  }
  return null;
}

function buildOrderContext(pendingOrder: any): string {
  if (!pendingOrder) return 'None';
  const items = Array.isArray(pendingOrder.items)
    ? pendingOrder.items.map((i: any) => `${i.name || i.productName} x${i.quantity}`).join(', ')
    : 'Unknown items';
  const total = `₹${((pendingOrder.totalAmount || 0) / 100).toFixed(0)}`;
  const addr = pendingOrder.deliveryAddress && pendingOrder.deliveryAddress !== 'unclear'
    ? pendingOrder.deliveryAddress : 'NOT SET';
  const custName = pendingOrder.customerName || 'NOT SET';
  const delivDate = pendingOrder.estimatedDelivery
    ? new Date(pendingOrder.estimatedDelivery).toLocaleDateString()
    : 'NOT SET';
  return `Order #${pendingOrder.orderNumber}: ${items} | ${total} | ${pendingOrder.status} | Address: ${addr} | Name: ${custName} | Delivery Date: ${delivDate}`;
}

// ---------------------------------------------------------------------------
// Main unified AI call
// ---------------------------------------------------------------------------

/**
 * Execute a single OpenAI call that replaces Stages 0, 1, 1.5, 1.7, 3, 4, and 6.
 *
 * @param rawMessage    The customer's raw WhatsApp message
 * @param memory        ConversationMemory retrieved by Stage 0.5
 * @param fetchedData   Data retrieved by Stage 2 (products, orders, vendor config, etc.)
 * @param vendorId      Vendor identifier for logging
 * @param conversationId  Conversation identifier for logging
 */
export async function executeUnifiedAI(
  rawMessage: string,
  memory: any,
  fetchedData: any,
  vendorId: string,
  conversationId: string
): Promise<UnifiedAIResult> {
  if (!openai) {
    throw new Error('OpenAI API key not configured');
  }

  const vendorConfig  = fetchedData?.vendorConfig  || {};
  const products      = fetchedData?.products      || [];
  const pendingOrder  = fetchedData?.pendingOrder;
  const orderHistory  = fetchedData?.orderHistory  || [];
  const insights      = fetchedData?.insights      || {};
  const convHistory   = memory?.conversationHistory || [];

  const vendorName = vendorConfig.businessName || vendorConfig.aiBotName || 'the business';
  const isGreeting = (memory?.turnNumber || 0) <= 1 || memory?.conversationStage === 'greeting';

  // ---- Build system prompt ----
  // Layout: [STATIC vendor+products+rules+schema] then [DYNAMIC per-message context]
  // Static prefix ≥ 1024 tokens → eligible for OpenAI automatic prompt caching (50% cost).
  const systemPrompt = [
    // ── STATIC BLOCK (cached across turns for the same vendor) ──────────────────
    `You are an AI customer-service assistant for ${vendorName}.`,
    vendorConfig.aiSystemPrompt ? `\n${vendorConfig.aiSystemPrompt}` : '',
    vendorConfig.aiPersonality  ? `\nPersonality: ${vendorConfig.aiPersonality}` : '',
    vendorConfig.aiToneExample  ? `\nTone: ${vendorConfig.aiToneExample}` : '',

    // Products in TOON table format (name,price,keywords — ~40% fewer tokens than JSON)
    `\n\nAVAILABLE PRODUCTS:\n${buildProductSection(products)}`,

    (() => {
      const v = buildVariantsSection(products);
      return v ? `\n\nPRODUCT_VARIANTS (authoritative per-variant pricing):\n${v}` : '';
    })(),

    vendorConfig.aiDeliveryInstructions
      ? `\n\nDELIVERY INFO:\n${vendorConfig.aiDeliveryInstructions}` : '',

    // Tasks + rules come BEFORE the dynamic context so they fall inside the cached prefix
    `\n\nYOUR TASKS (complete all in one response):`,
    `1. NORMALIZE  — fix typos, expand abbreviations, identify language`,
    `2. CLASSIFY   — pick ONE primary intent from: order_new, order_update, confirm_order,`,
    `   cancel_order, order_status, product_inquiry, greeting, support, complaint,`,
    `   refund_request, return_request, repeat_order, delivery_inquiry, payment_inquiry,`,
    `   feedback, account_inquiry, other`,
    `   INTENT SEMANTICS — important disambiguations:`,
    `   • support = customer EXPLICITLY asks to speak to a human / connect to an agent /`,
    `     escalate ("talk to someone", "connect me to a person", "I need a human").`,
    `     Phrases like "I'm good", "will reach out later", "thanks bye", "that's all",`,
    `     "no further questions" are NOT support — classify as 'other' (or 'feedback'`,
    `     if tone is clearly positive/negative).`,
    `   • confirm_order = customer explicitly confirms a pending order ("yes confirm",`,
    `     "go ahead", "place the order"). Do NOT classify a simple "yes" without`,
    `     pending-order context as confirm_order.`,
    `3. CORRECTION — detect if customer is correcting a prior statement (true/false)`,
    `4. RESPOND    — write a natural WhatsApp reply`,
    `5. EXTRACT    — pull order items, address, name from the message`,

    `\n\nRESPONSE RULES:`,
    `• ONLY mention products from AVAILABLE PRODUCTS`,
    `• LANGUAGE MIRROR: reply in the SAME language/script the customer just used.`,
    `  - English → English`,
    `  - Tamil/Tanglish (Tamil words in Latin script) → respond in Tanglish`,
    `  - Hindi/Hinglish → respond in Hinglish`,
    `  - Mixed → follow the dominant language of the latest customer message`,
    `  Keep product names in their original English (do NOT translate brand/product names).`,
    `• FACT GROUNDING: only state facts that appear in AVAILABLE PRODUCTS, PRODUCT_VARIANTS,`,
    `  DELIVERY INFO, or the vendor system prompt above.`,
    `  - For size/material/variant pricing, read PRODUCT_VARIANTS first (each row is`,
    `    authoritative for that size+material combo). Quote the exact variant price.`,
    `  - The main AVAILABLE PRODUCTS row shows a price RANGE when`,
    `    variants exist — do NOT quote the range endpoints as the price of a specific variant.`,
    `  - Use the product's full desc column for materials, dimensions, divider/fit notes,`,
    `    and any policies authored by the vendor.`,
    `  If a fact is genuinely absent from all of these, respond:`,
    `  "Let me check with the vendor and get back to you." DO NOT invent facts.`,
    `• DELIVERY DATES: never commit to a specific delivery date. Use DELIVERY INFO verbatim.`,
    `  If the customer asks for a specific date, respond:`,
    `  "I'll pass the request to the vendor for confirmation."`,
    `• PRICING QUESTIONS: if the customer asked about price/charges for a customization or`,
    `  add-on, answer the price question BEFORE confirming the order. Never mark an order`,
    `  confirmed while a pricing question is pending.`,
    `• See TURN MODE below for greeting vs in-progress behaviour`,
    `• Do NOT ask for info already in Key Facts or Saved Address`,
    `• Use emojis naturally; keep reply under 200 words unless listing products`,
    `• Ask at most ONE critical question per turn (name/address for order completion)`,
    `• If customer provides name/address in answer to your question → extract it, don't ask again`,
    `• Format lists with line breaks for WhatsApp readability`,

    `\n\nEXTRACTION RULES:`,
    `• Only fill orderItems when product name matches (fuzzy OK, e.g. "brwonie" → "Brownie")`,
    `• Always set orderItems[i].unit using the product's unit column from AVAILABLE PRODUCTS`,
    `  (e.g., kg, box, piece, packet). This is REQUIRED — do not omit.`,
    `• Per-item customizations (e.g., "no sugar", "extra crunchy") go in orderItems[i].notes,`,
    `  NOT in the order-level specialRequests field. Only order-wide requests (e.g.,`,
    `  "deliver before 5pm") belong in specialRequests.`,
    `• Extract customerName ONLY when customer explicitly states it`,
    `• Extract deliveryAddress ONLY when customer provides one`,
    `• Never set conversationStage to 'order_confirmation' if the customer's most recent`,
    `  message contains an unanswered question (ends with '?' or starts with who/what/when/`,
    `  where/why/how/can/will/does/do/is/are). Stay in 'information_gathering' until the`,
    `  question is answered.`,

    `\n\nReturn ONLY valid JSON — no markdown, no code fences:`,
    `{`,
    `  "normalizedMessage": "cleaned text",`,
    `  "language": "en",`,
    `  "primaryIntent": "order_new",`,
    `  "secondaryIntents": [],`,
    `  "confidence": 0.95,`,
    `  "isCorrection": false,`,
    `  "correctedField": null,`,
    `  "correctedValue": null,`,
    `  "response": "WhatsApp reply here",`,
    `  "needsClarification": false,`,
    `  "orderItems": [{"name": "product", "quantity": 1, "unit": "box", "notes": ""}],`,
    `  "deliveryAddress": null,`,
    `  "customerName": null,`,
    `  "specialRequests": null,`,
    `  "conversationStage": "information_gathering",`,
    `  "reasoning": "brief reason",`,
    `  "extractedInfo": {`,
    `    "products": [],`,
    `    "quantities": [],`,
    `    "hasDeliveryInfo": false,`,
    `    "hasSpecialRequests": false,`,
    `    "mentionsOrder": false,`,
    `    "urgency": "low"`,
    `  }`,
    `}`,

    // ── DYNAMIC BLOCK (changes per message — must stay after the static prefix) ──
    `\n\n--- TURN CONTEXT ---`,
    `TURN MODE: ${isGreeting ? 'GREETING — welcome the customer warmly' : 'IN-PROGRESS — answer directly, no Hi/Hello'}`,
    `Last Customer Language: ${memory?.lastCustomerLanguage || memory?.customerPreferences?.language || 'en'}`,
    `Turn: ${memory?.turnNumber || 0} | Stage: ${memory?.conversationStage || 'greeting'}`,
    `Customer Name: ${insights?.customerName || findRecentlyProvidedName(convHistory) || 'Unknown'}`,
    `Saved Address: ${insights?.savedAddress || insights?.deliveryAddress || findRecentlyProvidedAddress(convHistory) || 'None'}`,
    `Key Facts: ${(memory?.keyFacts || []).slice(0, 5).join('; ') || 'None'}`,
    `Topics: ${(memory?.ongoingTopics || []).slice(0, 3).join('; ') || 'None'}`,
    `Pending Order: ${buildOrderContext(pendingOrder)}`,
    `Recent Orders: ${orderHistory.length > 0
      ? orderHistory.slice(0, 2).map((o: any) => o.orderNumber || o.id).join(', ')
      : 'None'}`,
    `\nCONVERSATION (last 10):\n${buildConversationSection(convHistory)}`
  ].join('');

  // ---- Single AI call ----
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: rawMessage }
    ],
    temperature: 0.4,
    max_completion_tokens: 900,
    response_format: { type: 'json_object' }
  });

  const responseText = completion.choices[0]?.message?.content || '{}';
  const costCalc = calculateCostFromUsage(completion.usage, 'gpt-4o-mini');

  // ---- Parse response ----
  let parsed: any;
  try {
    parsed = JSON.parse(responseText);
  } catch (parseError) {
    logger.warn(
      { conversationId, parseError, snippet: responseText.slice(0, 200) },
      'Unified AI: JSON parse failed — returning safe fallback'
    );
    return buildFallback(rawMessage, costCalc);
  }

  // ---- Post-parse: recover missed extractions from conversation history ----
  recoverMissedExtractions(parsed, convHistory, rawMessage);

  // ---- Validate & normalise ----
  const primaryIntent: UnifiedIntent = VALID_INTENTS.includes(parsed.primaryIntent)
    ? parsed.primaryIntent
    : 'other';

  const orderRelated = ['order_new', 'order_update', 'confirm_order', 'cancel_order', 'order_status'];

  return {
    normalizedMessage: parsed.normalizedMessage || rawMessage,
    language:          parsed.language          || 'en',

    primaryIntent,
    secondaryIntents: Array.isArray(parsed.secondaryIntents) ? parsed.secondaryIntents : [],
    confidence:       typeof parsed.confidence === 'number'  ? parsed.confidence : 0.8,
    extractedInfo: {
      products:           parsed.extractedInfo?.products  || (parsed.orderItems?.map((i: any) => i.name) ?? []),
      quantities:         parsed.extractedInfo?.quantities || [],
      orderUpdateType:    parsed.extractedInfo?.orderUpdateType || null,
      hasDeliveryInfo:    parsed.extractedInfo?.hasDeliveryInfo ?? !!parsed.deliveryAddress,
      hasSpecialRequests: parsed.extractedInfo?.hasSpecialRequests ?? !!parsed.specialRequests,
      mentionsOrder:      parsed.extractedInfo?.mentionsOrder ?? orderRelated.includes(primaryIntent),
      urgency:            parsed.extractedInfo?.urgency || 'low',
      deliveryAddress:    parsed.deliveryAddress  || null,
      customerName:       parsed.customerName     || null,
      complaintType:      parsed.extractedInfo?.complaintType  || null,
      refundReason:       parsed.extractedInfo?.refundReason   || null,
      refundAmount:       parsed.extractedInfo?.refundAmount   || null,
      feedbackType:       parsed.extractedInfo?.feedbackType   || null,
      feedbackRating:     parsed.extractedInfo?.feedbackRating || null,
      returnReason:       parsed.extractedInfo?.returnReason   || null,
      returnItem:         parsed.extractedInfo?.returnItem     || null,
      paymentMethod:      parsed.extractedInfo?.paymentMethod  || null,
      deliveryArea:       parsed.extractedInfo?.deliveryArea   || null,
      deliveryTime:       parsed.extractedInfo?.deliveryTime   || null,
      accountField:       parsed.extractedInfo?.accountField   || null,
      previousOrderNumber: parsed.extractedInfo?.previousOrderNumber || null,
    },
    needsMoreContext: parsed.needsMoreContext ?? false,
    reasoning:        parsed.reasoning || `Intent: ${primaryIntent}`,

    isCorrection:   parsed.isCorrection   ?? false,
    correctedField: parsed.correctedField || null,
    correctedValue: parsed.correctedValue || null,

    response:            parsed.response            || "I'm here to help! How can I assist you?",
    needsClarification:  parsed.needsClarification  ?? false,
    orderItems:          Array.isArray(parsed.orderItems)
      ? parsed.orderItems.filter((i: any) => i.name && i.quantity > 0)
      : [],
    deliveryAddress:  parsed.deliveryAddress  || null,
    customerName:     parsed.customerName     || null,
    specialRequests:  parsed.specialRequests  || null,
    conversationStage: (['greeting', 'information_gathering', 'order_confirmation', 'closing']
      .includes(parsed.conversationStage))
      ? parsed.conversationStage
      : 'information_gathering',

    tokensUsed:       costCalc.tokensUsed,
    cost:             costCalc.cost,
    promptTokens:     completion.usage?.prompt_tokens     || 0,
    completionTokens: completion.usage?.completion_tokens || 0,
    model:            'gpt-4o-mini'
  };
}

// ---------------------------------------------------------------------------
// Post-parse: recover address / name / delivery date the AI failed to extract
// ---------------------------------------------------------------------------

// Address pattern: contains road/street/nagar/city + pincode or multiple comma-separated parts
const ADDRESS_PATTERN = /(?:road|street|nagar|colony|layout|heights|apartment|flat|floor|block|sector|phase|plot|door|no\.|#|\d{6})/i;
const PINCODE_PATTERN = /\b\d{6}\b/;

// Date patterns: "tomorrow", "Monday", "15th April", "2026-04-15", etc.
const DATE_PATTERN = /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[\s/-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s/-]?\d{0,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+\d{4})?|\d{4}-\d{2}-\d{2})\b/i;

/**
 * When the AI returns null for deliveryAddress / customerName / delivery date,
 * scan the last few customer messages (especially the current one) to recover
 * clearly provided information.  This prevents the re-asking loop.
 */
function recoverMissedExtractions(
  parsed: any,
  convHistory: any[],
  currentMessage: string
): void {
  // Build list of recent customer messages (current + last 3 from history)
  const recentCustomerMessages: string[] = [currentMessage];
  if (convHistory?.length) {
    const lastFew = convHistory.slice(-4);
    for (const m of lastFew) {
      if (m.senderType === 'customer') {
        recentCustomerMessages.push(m.content);
      }
    }
  }

  // --- Recover delivery address ---
  if (!parsed.deliveryAddress) {
    // Check if the last assistant message asked for address
    const lastAssistant = convHistory?.slice().reverse().find((m: any) => m.senderType === 'assistant');
    const assistantAskedForAddress = lastAssistant?.content &&
      /delivery\s*address|your\s*address|provide.*address|share.*address/i.test(lastAssistant.content);

    for (const msg of recentCustomerMessages) {
      const looksLikeAddress =
        (ADDRESS_PATTERN.test(msg) && msg.split(',').length >= 2) ||
        PINCODE_PATTERN.test(msg) ||
        (assistantAskedForAddress && msg.length > 15 && /[,\n]/.test(msg));

      if (looksLikeAddress) {
        parsed.deliveryAddress = msg.trim();
        // Also fix the response if AI is still asking for address
        if (parsed.response && /need.*(?:delivery\s*)?address|provide.*address/i.test(parsed.response)) {
          parsed.needsClarification = false;
        }
        logger.info({ recoveredAddress: parsed.deliveryAddress }, 'Recovered missed delivery address from conversation');
        break;
      }
    }
  }

  // --- Recover customer name ---
  if (!parsed.customerName) {
    const lastAssistant = convHistory?.slice().reverse().find((m: any) => m.senderType === 'assistant');
    const assistantAskedForName = lastAssistant?.content &&
      /your\s*name|provide.*name|what.*name|may\s*I\s*know\s*your\s*name/i.test(lastAssistant.content);

    if (assistantAskedForName) {
      // Current message is likely the name — short reply (1-4 words, no digits/special)
      const cleaned = currentMessage.trim();
      if (cleaned.length >= 2 && cleaned.length <= 60 &&
          cleaned.split(/\s+/).length <= 4 &&
          !/\d/.test(cleaned) &&
          !/road|street|nagar|order|cancel|kg|box/i.test(cleaned)) {
        parsed.customerName = cleaned;
        if (parsed.response && /need.*name|provide.*name|what.*name/i.test(parsed.response)) {
          parsed.needsClarification = false;
        }
        logger.info({ recoveredName: parsed.customerName }, 'Recovered missed customer name from conversation');
      }
    }
  }

  // --- Recover preferred delivery date ---
  if (!parsed.specialRequests || !/deliver|date|time/i.test(parsed.specialRequests || '')) {
    for (const msg of recentCustomerMessages) {
      const dateMatch = msg.match(DATE_PATTERN);
      if (dateMatch) {
        const deliveryDateStr = dateMatch[0];
        // Append to specialRequests so it flows to the order
        const note = `Preferred delivery: ${deliveryDateStr}`;
        if (parsed.specialRequests) {
          parsed.specialRequests = `${parsed.specialRequests}. ${note}`;
        } else {
          parsed.specialRequests = note;
        }
        logger.info({ recoveredDate: deliveryDateStr }, 'Recovered missed delivery date from conversation');
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Safe fallback when parsing fails
// ---------------------------------------------------------------------------

function buildFallback(rawMessage: string, costCalc: { tokensUsed: number; cost: number }): UnifiedAIResult {
  return {
    normalizedMessage: rawMessage,
    language:          'en',
    primaryIntent:     'other',
    secondaryIntents:  [],
    confidence:        0.5,
    extractedInfo: {
      hasDeliveryInfo:    false,
      hasSpecialRequests: false,
      mentionsOrder:      false,
      urgency:            'low'
    },
    needsMoreContext: false,
    reasoning:        'Parse failed — safe fallback',
    isCorrection:     false,
    correctedField:   null,
    correctedValue:   null,
    response:         "I'm here to help! How can I assist you?",
    needsClarification: false,
    orderItems:         [],
    deliveryAddress:    null,
    customerName:       null,
    specialRequests:    null,
    conversationStage:  'greeting',
    tokensUsed:         costCalc.tokensUsed,
    cost:               costCalc.cost,
    promptTokens:       0,
    completionTokens:   0,
    model:              'gpt-4o-mini'
  };
}
