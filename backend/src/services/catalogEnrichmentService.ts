import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { calculateCost, type CostResult } from '../utils/costCalculator.js';
import { toonTable } from '../utils/toonEncoder.js';
import type { NormalizedProductDraft } from '../routes/schemas/catalogImport.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
export const ENRICHMENT_MODEL = 'gpt-4.1-mini';
const BATCH_SIZE = 6;

const EnrichmentItemSchema = z.object({
  rowId: z.string(),
  description: z.string().max(2000).optional(),
  keywords: z.object({
    en: z.array(z.string()).default([]),
    hi: z.array(z.string()).default([]),
    ta: z.array(z.string()).default([])
  })
});

const EnrichmentResponseSchema = z.object({
  items: z.array(EnrichmentItemSchema)
});

export interface ShopEnrichmentContext {
  businessName?: string | null;
  category?: string | null;
  address?: string | null;
  deliveryNotes?: string | null;
  hours?: string | null;
  city?: string | null;
  intakeAnswers?: Record<string, string | string[]>;
}

type ProfileField = { value?: string | null } | null | undefined;

function fieldVal(cell: ProfileField): string | undefined {
  const value = cell?.value?.trim();
  return value || undefined;
}

/** Map a brochure vendorProfile (plus optional extras) into enricher shop context. */
export function shopContextFromVendorProfile(
  profile?: {
    businessName?: ProfileField;
    category?: ProfileField;
    address?: ProfileField;
    city?: ProfileField;
    hours?: ProfileField;
    deliveryNotes?: ProfileField;
  } | null,
  extras?: Partial<ShopEnrichmentContext>
): ShopEnrichmentContext | undefined {
  const ctx: ShopEnrichmentContext = {
    businessName: extras?.businessName || fieldVal(profile?.businessName),
    category: extras?.category || fieldVal(profile?.category),
    address: extras?.address || fieldVal(profile?.address),
    city: extras?.city || fieldVal(profile?.city),
    hours: extras?.hours || fieldVal(profile?.hours),
    deliveryNotes: extras?.deliveryNotes || fieldVal(profile?.deliveryNotes),
    intakeAnswers: extras?.intakeAnswers
  };
  const hasFacts = Boolean(
    ctx.businessName ||
      ctx.category ||
      ctx.address ||
      ctx.city ||
      ctx.hours ||
      ctx.deliveryNotes ||
      (ctx.intakeAnswers && Object.keys(ctx.intakeAnswers).length > 0)
  );
  return hasFacts ? ctx : undefined;
}

export function buildEnrichmentSystemPrompt(shop?: ShopEnrichmentContext): string {
  const shopLines: string[] = [];
  if (shop?.businessName) shopLines.push(`Shop name: ${shop.businessName}`);
  if (shop?.category) shopLines.push(`Shop category: ${shop.category}`);
  if (shop?.address) shopLines.push(`Address: ${shop.address}`);
  if (shop?.deliveryNotes) shopLines.push(`Delivery / fulfillment: ${shop.deliveryNotes}`);
  if (shop?.hours) shopLines.push(`Hours / lead time: ${shop.hours}`);
  if (shop?.city) shopLines.push(`City / area: ${shop.city}`);
  if (shop?.intakeAnswers) {
    for (const [key, val] of Object.entries(shop.intakeAnswers)) {
      const text = Array.isArray(val) ? val.join(', ') : val;
      if (text?.trim()) shopLines.push(`Vendor note (${key}): ${text}`);
    }
  }
  const shopBlock =
    shopLines.length > 0
      ? `\nSHOP CONTEXT (use only these facts — do not invent beyond them):\n${shopLines.join('\n')}\n`
      : '';

  return `You enrich WhatsApp-commerce catalog rows so a shop assistant can talk like a real vendor.
INPUT: a TOON-CSV of products (rowId, name, description, baseUnit).
OUTPUT (strict JSON): { "items": [{ "rowId": "...", "description": "...", "keywords": { "en": [...], "hi": [...], "ta": [...] } }] }
${shopBlock}
DESCRIPTION
- Write 5-10 short lines a shop owner would send on WhatsApp (max 1800 characters). Use newline-separated sentences or short paragraphs.
- Cover what the item is, pack or portion (from the name or unit), how it is typically enjoyed or used, and any printed flavour/ingredient/occasion facts.
- Weave in shop context (area, hours, pickup vs delivery) when it helps the customer decide. Do not repeat identical shop hours on every item.
- Do not invent ingredients, awards, origins, or health claims.
- If a brochure description exists, expand it clearly for chat and keep every fact.
- If there is no extra brochure text, write a helpful honest listing from the product name, unit, and shop context. Do not invent flavours.
- Do not include prices.
- Match the language of the product name (English, Tamil, or Hindi).

KEYWORDS
- Generate 3-6 keywords per language per product.
- English: common synonyms a buyer types. Include brand-free variants ("atta" for "Aashirvaad Atta").
- Hindi: Devanagari script. Use the common colloquial form ("आटा" for flour).
- Tamil: Tamil script. Use the common colloquial form ("மாவு" for flour).
- Keywords must be single words or 2-word phrases. No sentences.
- No category names ("grocery", "food"). No filler ("product", "item").
- If you can't produce confident keywords for a language, return [] for that language.

Return ONLY JSON.`;
}

export interface EnrichmentCostSummary {
  cost: CostResult;
}

export async function enrichKeywordsBatch(
  drafts: NormalizedProductDraft[],
  shopContext?: ShopEnrichmentContext
): Promise<{ updated: NormalizedProductDraft[]; costs: CostResult[] }> {
  if (!openai || drafts.length === 0) {
    return { updated: drafts, costs: [] };
  }

  const systemPrompt = buildEnrichmentSystemPrompt(shopContext);

  const costs: CostResult[] = [];
  const updatedById = new Map<string, NormalizedProductDraft>();
  for (const d of drafts) updatedById.set(d.rowId, d);

  for (let i = 0; i < drafts.length; i += BATCH_SIZE) {
    const batch = drafts.slice(i, i + BATCH_SIZE);
    const tableRows = batch.map((d) => ({
      rowId: d.rowId,
      name: d.name,
      description: d.description ?? '',
      baseUnit: d.baseUnit
    }));
    const userMsg = `Products:\n${toonTable(tableRows)}`;

    try {
      const completion = await openai.chat.completions.create({
        model: ENRICHMENT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg }
        ],
        temperature: 0.3,
        max_completion_tokens: 6000,
        response_format: { type: 'json_object' }
      });

      const cost = calculateCost(
        ENRICHMENT_MODEL,
        completion.usage?.prompt_tokens,
        completion.usage?.completion_tokens,
        completion.usage?.total_tokens
      );
      costs.push(cost);

      const raw = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(raw);
      const shaped = EnrichmentResponseSchema.safeParse(parsed);
      if (!shaped.success) {
        logger.warn({ issues: shaped.error.issues.slice(0, 3) }, 'enrichment_shape_invalid');
        continue;
      }

      for (const item of shaped.data.items) {
        const existing = updatedById.get(item.rowId);
        if (!existing) continue;
        const merged = Array.from(
          new Set([
            ...(existing.keywords ?? []),
            ...item.keywords.en,
            ...item.keywords.hi,
            ...item.keywords.ta
          ].filter((k) => k && k.trim().length > 0))
        ).slice(0, 50);
        const enhanced = item.description?.trim();
        updatedById.set(item.rowId, {
          ...existing,
          keywords: merged,
          description: enhanced || existing.description
        });
      }
    } catch (err) {
      logger.warn({ err, batchStart: i }, 'enrichment_batch_failed');
    }
  }

  return { updated: Array.from(updatedById.values()), costs };
}
