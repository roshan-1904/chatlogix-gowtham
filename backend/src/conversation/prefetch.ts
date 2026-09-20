import { prisma } from '../db/prisma.js';
import { getCached, setCached, deleteCached } from '../utils/redis.js';
import { toCartSnapshot } from './cart/snapshot.js';
import { normalizeVariants } from './cart/variants.js';
import { embedText, toVectorLiteral } from './faq/embedding.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import {
  catalogPaiseLookInflated,
  deflateDoubleConvertedPaise
} from '../services/catalogNormalizationService.js';
import type { HotSet, VendorConfig, CompactCatalogEntry, ConvMemory, CartSnapshot, OrderHistoryEntry, FaqEntry } from './types.js';
import { DEFAULT_CONVERSATION_MODEL } from './context/catalogContextConfig.js';

/**
 * Redis-first, Postgres-on-miss hot set (spec §11). `getCached`/`setCached`
 * never throw — a Redis outage degrades to a cache miss and every loader
 * falls through to Postgres, same as an empty cache. That's the correct
 * behavior here (contrast with cart/lock.ts's conversation lock, Step 8,
 * which must fail closed instead).
 */

const VENDOR_CONFIG_TTL = 600; // 5-15 min per §11; mid-range
const CATALOG_COMPACT_TTL = 3600; // invalidated on product write; this is just a safety-net backstop
const CONV_MEMORY_TTL = 300; // 5 min
const PENDING_ORDER_TTL = 60;
const ORDER_HISTORY_TTL = 60; // same tolerance as pendingOrder: fine for prompt grounding, never trust it for a write
const CUSTOMER_INSIGHTS_TTL = 900; // 15 min
const RECENT_MESSAGES_TTL = 60;
// Only the cheap existence gate is cached — the actual FAQ search result is a
// function of (vendorId, messageText), and messageText differs on nearly
// every turn, so a cacheAside-style cache would have ~zero hit rate.
const FAQ_COUNT_TTL = 3600;
const FAQ_SIMILARITY_THRESHOLD = Number(env.FAQ_SIMILARITY_THRESHOLD || '0.75');
const FAQ_TOP_K = Number(env.FAQ_TOP_K || '3');

function vendorConfigKey(vendorId: string): string {
  return `vendor:${vendorId}:config`;
}

function catalogCompactKey(vendorId: string): string {
  return `vendor:${vendorId}:catalog_compact`;
}

function convMemoryKey(conversationId: string): string {
  return `conv:${conversationId}:memory`;
}

function pendingOrderKey(conversationId: string): string {
  return `conv:${conversationId}:pending_order`;
}

function customerInsightsKey(customerId: string, vendorId: string): string {
  return `customer:${customerId}:${vendorId}:insights`;
}

function orderHistoryKey(customerId: string, vendorId: string): string {
  return `customer:${customerId}:${vendorId}:order_history`;
}

function recentMessagesKey(conversationId: string): string {
  return `conv:${conversationId}:recent_messages`;
}

function faqCountKey(vendorId: string): string {
  return `vendor:${vendorId}:faq_count`;
}

async function cacheAside<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const cached = await getCached<T>(key);
  if (cached !== null) return cached;
  const value = await loader();
  await setCached(key, value, ttlSeconds);
  return value;
}

async function loadVendorConfig(vendorId: string): Promise<VendorConfig> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      id: true,
      businessName: true,
      aiBotName: true,
      aiPersonality: true,
      aiSystemPrompt: true,
      aiGreeting: true,
      aiClosing: true,
      aiToneExample: true,
      aiContentResponsibilities: true,
      aiContentConversationRules: true,
      aiContentImportantInstructions: true,
      aiDeliveryInstructions: true,
      aiPickupDeliveryAddress: true,
      orderPreparationConfig: true,
      timezone: true,
      aiModel: true,
      askForPreferredDeliveryDate: true
    }
  });
  if (!vendor) {
    throw new Error(`Vendor not found: ${vendorId}`);
  }

  return {
    id: vendor.id,
    businessName: vendor.businessName,
    aiBotName: vendor.aiBotName,
    aiPersonality: vendor.aiPersonality,
    aiSystemPrompt: vendor.aiSystemPrompt,
    aiGreeting: vendor.aiGreeting,
    aiClosing: vendor.aiClosing,
    aiToneExample: vendor.aiToneExample,
    aiContentResponsibilities: vendor.aiContentResponsibilities,
    aiContentConversationRules: vendor.aiContentConversationRules,
    aiContentImportantInstructions: vendor.aiContentImportantInstructions,
    aiDeliveryInstructions: vendor.aiDeliveryInstructions,
    aiPickupDeliveryAddress: vendor.aiPickupDeliveryAddress,
    orderPreparationConfig: vendor.orderPreparationConfig,
    timezone: vendor.timezone,
    // Q10 / spec §7 step 4: model = Vendor.aiModel, with the same fallback
    // aiService.ts uses (unifiedAIProcessorService.ts never applies this —
    // that's a real bug in the current pipeline, not a pattern to copy).
    aiModel: vendor.aiModel || DEFAULT_CONVERSATION_MODEL,
    askForPreferredDeliveryDate: vendor.askForPreferredDeliveryDate
  };
}

async function loadCompactCatalog(vendorId: string): Promise<CompactCatalogEntry[]> {
  const key = catalogCompactKey(vendorId);
  const cached = await getCached<CompactCatalogEntry[]>(key);
  if (cached !== null && !catalogPaiseLookInflated(cached.map((c) => c.price))) {
    // Heal pre-baseQty cache rows (compact catalog schema added baseQuantity 2026-09-11).
    return cached.map((c) => ({
      ...c,
      baseQuantity: Number(c.baseQuantity) > 0 ? Number(c.baseQuantity) : 1,
      imageCount: Number(c.imageCount) || 0,
      videoCount: Number(c.videoCount) || 0,
      mediaLabels: Array.isArray(c.mediaLabels) ? c.mediaLabels : []
    }));
  }

  const products = await prisma.product.findMany({
    where: { vendorId, isActive: true },
    select: {
      id: true,
      name: true,
      basePrice: true,
      baseUnit: true,
      baseQuantity: true,
      minOrderQuantity: true,
      maxOrderQuantity: true,
      keywords: true,
      fulfillmentType: true,
      inStock: true,
      stockQuantity: true,
      variants: true,
      description: true,
      isDivisible: true
    }
  });

  const inflated = catalogPaiseLookInflated(products.map((p) => p.basePrice));
  const rows = inflated
    ? products.map((p) =>
        p.basePrice > 0 ? { ...p, basePrice: deflateDoubleConvertedPaise(p.basePrice) } : p
      )
    : products;

  if (inflated) {
    const changed = rows.filter((p, i) => p.basePrice !== products[i].basePrice);
    if (changed.length > 0) {
      await prisma.$transaction(
        changed.map((p) =>
          prisma.product.update({ where: { id: p.id }, data: { basePrice: p.basePrice } })
        )
      );
      logger.info(
        { vendorId, repairedCount: changed.length },
        'repaired_double_converted_catalog_paise'
      );
    }
    await deleteCached(key);
  }

  const productIds = rows.map((p) => p.id);
  const mediaSummaryByProduct = new Map<string, { imageCount: number; videoCount: number; mediaLabels: string[] }>();
  const variantImagesByProduct = new Map<string, Set<string>>();
  if (productIds.length > 0) {
    const mediaRows = await prisma.productMedia.findMany({
      where: { vendorId, productId: { in: productIds }, isActive: true },
      select: {
        productId: true,
        kind: true,
        label: true,
        sortOrder: true,
        createdAt: true,
        variantSku: true
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    for (const m of mediaRows) {
      if (m.variantSku) {
        if (m.kind === 'image') {
          const set = variantImagesByProduct.get(m.productId) ?? new Set<string>();
          set.add(m.variantSku);
          variantImagesByProduct.set(m.productId, set);
        }
        continue;
      }
      const cur = mediaSummaryByProduct.get(m.productId) ?? { imageCount: 0, videoCount: 0, mediaLabels: [] };
      if (m.kind === 'video') cur.videoCount += 1;
      else cur.imageCount += 1;
      if (m.label && cur.mediaLabels.length < 3) {
        const label = m.label.trim().slice(0, 40);
        if (label) cur.mediaLabels.push(label);
      }
      mediaSummaryByProduct.set(m.productId, cur);
    }
  }

  const value: CompactCatalogEntry[] = rows.map((p) => {
    const media = mediaSummaryByProduct.get(p.id) ?? { imageCount: 0, videoCount: 0, mediaLabels: [] };
    const variantImgSkus = variantImagesByProduct.get(p.id);
    return {
      id: p.id,
      name: p.name,
      price: p.basePrice,
      unit: p.baseUnit,
      baseQuantity: Number(p.baseQuantity) > 0 ? Number(p.baseQuantity) : 1,
      minQty: p.minOrderQuantity !== null ? Number(p.minOrderQuantity) : null,
      maxQty: p.maxOrderQuantity !== null ? Number(p.maxOrderQuantity) : null,
      keywords: p.keywords,
      fulfillmentType: p.fulfillmentType,
      inStock: p.inStock,
      stockQuantity: p.stockQuantity !== null ? Number(p.stockQuantity) : null,
      variants: normalizeVariants(p.variants)
        .filter((v) => v.isActive)
        .map((v) => ({
          ...v,
          hasImage: variantImgSkus?.has(v.sku) ?? false
        })),
      description: p.description ?? '',
      isDivisible: p.isDivisible,
      imageCount: media.imageCount,
      videoCount: media.videoCount,
      mediaLabels: media.mediaLabels
    };
  });
  await setCached(key, value, CATALOG_COMPACT_TTL);
  return value;
}

async function loadConvMemory(conversationId: string): Promise<ConvMemory | null> {
  const memory = await prisma.conversationMemory.findUnique({
    where: { conversationId },
    select: { conversationStage: true, keyFacts: true, turnNumber: true, customerPreferences: true }
  });
  if (!memory) return null;

  const prefs = memory.customerPreferences as Record<string, unknown> | null;
  const language = prefs && typeof prefs === 'object' && typeof prefs.language === 'string' ? (prefs.language as string) : null;

  return {
    stage: memory.conversationStage,
    keyFacts: Array.isArray(memory.keyFacts) ? memory.keyFacts : [],
    language,
    turnNumber: memory.turnNumber
  };
}

async function loadInsights(
  customerId: string,
  vendorId: string
): Promise<{ name: string | null; address: string | null; language: string | null } | null> {
  const insights = await prisma.customerInsights.findUnique({
    where: { customerId_vendorId: { customerId, vendorId } },
    select: { customerName: true, primaryDeliveryAddress: true, deliveryAddress: true, preferredLanguage: true }
  });
  if (!insights) return null;

  return {
    name: insights.customerName ?? null,
    address: insights.primaryDeliveryAddress ?? insights.deliveryAddress ?? null,
    language: insights.preferredLanguage ?? null
  };
}

async function loadRecentMessages(conversationId: string): Promise<Array<{ role: 'customer' | 'assistant'; content: string }>> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { timestamp: 'desc' },
    take: 6,
    select: { senderType: true, content: true }
  });

  return messages.reverse().map((m) => ({
    role: m.senderType === 'assistant' ? ('assistant' as const) : ('customer' as const),
    content: m.content
  }));
}

async function loadPendingOrder(conversationId: string, customerName: string | null): Promise<CartSnapshot | null> {
  const order = await prisma.order.findFirst({
    where: { conversationId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, items: true, deliveryAddress: true }
  });
  if (!order) return null;

  // Prompt context only — never the CartEngine.apply input. Reads Postgres
  // directly here; the 60s cache wrapped around this loader can go stale for
  // up to 60s, which is fine for grounding an LLM-1 prompt but must never be
  // trusted for the transaction itself (CartEngine always re-derives fresh).
  return toCartSnapshot(order, customerName, order.deliveryAddress ?? null);
}

/**
 * Customer's past orders with this vendor — deliberately customerId+vendorId
 * scoped, not conversationId (a customer can have more than one Conversation
 * row with the same vendor). Same query shape already established for
 * order-status/history answers in the legacy pipeline
 * (contextFetcherService.ts), widened to include the timeline fields
 * (estimatedDelivery/confirmedAt/preparedAt/deliveredAt/cancelledAt) that
 * one never selected.
 */
async function loadOrderHistory(customerId: string, vendorId: string): Promise<OrderHistoryEntry[]> {
  return prisma.order.findMany({
    where: { customerId, vendorId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      orderNumber: true,
      items: true,
      totalAmount: true,
      status: true,
      createdAt: true,
      estimatedDelivery: true,
      confirmedAt: true,
      preparedAt: true,
      deliveredAt: true,
      cancelledAt: true,
      cancellationReason: true
    }
  });
}

async function loadFaqCount(vendorId: string): Promise<number> {
  return prisma.faq.count({ where: { vendorId, isActive: true } });
}

/**
 * FAQs whose question matches the customer's current message closely enough
 * to be worth grounding LLM-1 with (prompts.ts's buildFaqBlock). Gated by a
 * cached count check first: most vendors won't have configured any FAQs, so
 * this skips the OpenAI embedding call entirely for them rather than paying
 * that latency on every single turn.
 */
async function loadFaqs(vendorId: string, messageText: string): Promise<FaqEntry[]> {
  const count = await cacheAside(faqCountKey(vendorId), FAQ_COUNT_TTL, () => loadFaqCount(vendorId));
  if (count === 0) return [];

  const queryEmbedding = await embedText(messageText);
  if (!queryEmbedding) return []; // OpenAI down/misconfigured — fail open, same as a Redis outage elsewhere in this file

  const vectorLiteral = toVectorLiteral(queryEmbedding);
  const rows = await prisma.$queryRaw<Array<{ id: string; question: string; answer: string; similarity: number }>>`
    SELECT id, question, answer, 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM "Faq"
    WHERE "vendorId" = ${vendorId} AND "isActive" = true AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${FAQ_TOP_K}
  `;
  return rows.filter((r) => r.similarity >= FAQ_SIMILARITY_THRESHOLD);
}

/** Invalidate the compact catalog cache. Call on product create/update/delete (spec §24). */
export async function invalidateCompactCatalog(vendorId: string): Promise<void> {
  await deleteCached(catalogCompactKey(vendorId));
}

/** Invalidate the FAQ existence-gate cache. Call on any FAQ create/update/delete. */
export async function invalidateFaqs(vendorId: string): Promise<void> {
  await deleteCached(faqCountKey(vendorId));
}

/**
 * Invalidate the customer-insights and pending-order caches. Must be called
 * whenever persist.ts writes a new customerName/address to CustomerInsights —
 * otherwise the CUSTOMER_INSIGHTS_TTL (15 min) keeps serving the pre-capture
 * `null` snapshot to LLM-1's prompt (hotSet.insights.name/.address, and
 * pendingOrder.customerName which is itself derived from insights.name),
 * making the AI re-ask for details the customer already gave.
 */
export async function invalidateCustomerContext(customerId: string, vendorId: string, conversationId: string): Promise<void> {
  await Promise.all([
    deleteCached(customerInsightsKey(customerId, vendorId)),
    deleteCached(pendingOrderKey(conversationId))
  ]);
}

/**
 * Prefetches the hot set in parallel (spec §7 step 2, §11). Intent is
 * unknown at this point — this always runs before LLM-1, regardless of what
 * the message turns out to be about.
 */
export async function prefetchHotSet(
  vendorId: string,
  conversationId: string,
  customerId: string,
  messageText: string
): Promise<HotSet> {
  const [vendorConfig, compactCatalog, memory, insights, recentMessages, orderHistory, faqs] = await Promise.all([
    cacheAside(vendorConfigKey(vendorId), VENDOR_CONFIG_TTL, () => loadVendorConfig(vendorId)),
    loadCompactCatalog(vendorId),
    cacheAside(convMemoryKey(conversationId), CONV_MEMORY_TTL, () => loadConvMemory(conversationId)),
    cacheAside(customerInsightsKey(customerId, vendorId), CUSTOMER_INSIGHTS_TTL, () => loadInsights(customerId, vendorId)),
    cacheAside(recentMessagesKey(conversationId), RECENT_MESSAGES_TTL, () => loadRecentMessages(conversationId)),
    cacheAside(orderHistoryKey(customerId, vendorId), ORDER_HISTORY_TTL, () => loadOrderHistory(customerId, vendorId)),
    loadFaqs(vendorId, messageText)
  ]);

  // Depends on `insights.name` resolved above, so it can't join the same
  // Promise.all batch.
  const pendingOrder = await cacheAside(pendingOrderKey(conversationId), PENDING_ORDER_TTL, () =>
    loadPendingOrder(conversationId, insights?.name ?? null)
  );

  return { vendorConfig, compactCatalog, memory, pendingOrder, orderHistory, faqs, insights, recentMessages };
}
