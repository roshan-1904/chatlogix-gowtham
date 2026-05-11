import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { calculateCost, type CostResult } from '../utils/costCalculator.js';
import { toonTable } from '../utils/toonEncoder.js';
import type { NormalizedProductDraft } from '../routes/schemas/catalogImport.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
const ENRICHMENT_MODEL = 'gpt-4o-mini';
const BATCH_SIZE = 20;

const EnrichmentItemSchema = z.object({
  rowId: z.string(),
  keywords: z.object({
    en: z.array(z.string()).default([]),
    hi: z.array(z.string()).default([]),
    ta: z.array(z.string()).default([])
  })
});

const EnrichmentResponseSchema = z.object({
  items: z.array(EnrichmentItemSchema)
});

const SYSTEM_PROMPT = `You generate multilingual search keywords for WhatsApp-commerce products.
INPUT: a TOON-CSV of products (rowId, name, description, baseUnit).
OUTPUT (strict JSON): { "items": [{ "rowId": "...", "keywords": { "en": [...], "hi": [...], "ta": [...] } }] }

RULES
- Generate 3-6 keywords per language per product.
- English: common synonyms a buyer types. Include brand-free variants ("atta" for "Aashirvaad Atta").
- Hindi: Devanagari script. Use the common colloquial form ("आटा" for flour).
- Tamil: Tamil script. Use the common colloquial form ("மாவு" for flour).
- Keywords must be single words or 2-word phrases. No sentences.
- No category names ("grocery", "food"). No filler ("product", "item").
- If you can't produce confident keywords for a language, return [] for that language.

Return ONLY JSON.`;

export interface EnrichmentCostSummary {
  cost: CostResult;
}

export async function enrichKeywordsBatch(
  drafts: NormalizedProductDraft[]
): Promise<{ updated: NormalizedProductDraft[]; costs: CostResult[] }> {
  if (!openai || drafts.length === 0) {
    return { updated: drafts, costs: [] };
  }

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
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg }
        ],
        temperature: 0.3,
        max_completion_tokens: 1500,
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
        updatedById.set(item.rowId, { ...existing, keywords: merged });
      }
    } catch (err) {
      logger.warn({ err, batchStart: i }, 'enrichment_batch_failed');
    }
  }

  return { updated: Array.from(updatedById.values()), costs };
}
