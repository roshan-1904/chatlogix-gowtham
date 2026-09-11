import type { NormalizedProductDraft } from '../routes/schemas/catalogImport.js';
import type { ExtractedProductRow } from '../lib/visionClient.js';
import type { TabularRow } from './catalogTabularParser.js';

export type RowBucket = 'auto_accept' | 'review' | 'needs_pricing' | 'blocked';

export interface ClassifiedRow {
  row: NormalizedProductDraft;
  bucket: RowBucket;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Unit canonicalization
// ---------------------------------------------------------------------------

const UNIT_SYNONYMS: Record<string, string> = {
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece', nos: 'piece', no: 'piece', unit: 'piece',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  l: 'litre', ltr: 'litre', ltrs: 'litre', litre: 'litre', liter: 'litre', litres: 'litre', liters: 'litre',
  ml: 'ml', milliliter: 'ml', millilitre: 'ml',
  packet: 'packet', pack: 'packet', pkt: 'packet',
  plate: 'plate',
  box: 'box', bx: 'box',
  dozen: 'dozen', dz: 'dozen', doz: 'dozen',
  glass: 'glass',
  bottle: 'bottle', btl: 'bottle',
  metre: 'metre', meter: 'metre', mtr: 'metre', m: 'metre'
};

export function canonicalUnit(raw: string | undefined | null): { unit: string; known: boolean } {
  const key = (raw ?? '').trim().toLowerCase();
  if (!key) return { unit: 'piece', known: false };
  const mapped = UNIT_SYNONYMS[key];
  if (mapped) return { unit: mapped, known: true };
  return { unit: key, known: false };
}

/** Weight/volume units that usually denote a fixed pre-pack, not loose sale by gram/ml. */
const FIXED_PACK_UNITS = new Set(['g', 'ml']);

/**
 * Pre-packed goods (e.g. 350g cake box) are often extracted as unit=g, qty=350.
 * Model as piece/1 for ordering when not sold loose by weight.
 */
export function normalizeFixedPackDraft(draft: NormalizedProductDraft): NormalizedProductDraft {
  if (draft.isDivisible) return draft;
  if (!FIXED_PACK_UNITS.has(draft.baseUnit) || draft.baseQuantity <= 1) return draft;

  const packLabel = `${draft.baseQuantity}${draft.baseUnit}`;
  const packNote = `${packLabel} pack`;
  const desc = draft.description?.trim() ?? '';
  const lowerName = draft.name.toLowerCase();
  const lowerDesc = desc.toLowerCase();
  const alreadyMentioned =
    lowerName.includes(packLabel.toLowerCase()) ||
    lowerDesc.includes(packLabel.toLowerCase()) ||
    lowerDesc.includes(packNote.toLowerCase());

  return {
    ...draft,
    baseUnit: 'piece',
    baseQuantity: 1,
    isDivisible: false,
    description: alreadyMentioned ? draft.description : desc ? `${desc} (${packNote})` : packNote,
    sourceMeta: {
      ...draft.sourceMeta,
      warnings: [...(draft.sourceMeta.warnings ?? []), 'fixed_pack_normalized']
    }
  };
}

// ---------------------------------------------------------------------------
// Price coercion
// ---------------------------------------------------------------------------

export interface CoercePriceOptions {
  /**
   * How to read a bare integer. Tabular cells and printed rupees use `'rupees'`.
   * Vision extraction is prompted to return integer paise (`"₹150"` → `15000`).
   */
  integerUnit?: 'rupees' | 'paise';
}

/**
 * Coerce a price value (which may arrive as "₹150", "150/-", "150.00", 150,
 * or vision paise like 15000) into integer paise. Returns null if we can't be sure.
 */
export function coercePricePaise(raw: unknown, options: CoercePriceOptions = {}): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw <= 0) return 0;
    return numberToPaise(raw, options.integerUnit ?? 'rupees');
  }
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[₹$€£]/g, '')
    .replace(/rs\.?/gi, '')
    .replace(/inr/gi, '')
    .replace(/\/-/g, '')
    .replace(/,/g, '')
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function numberToPaise(raw: number, integerUnit: 'rupees' | 'paise'): number {
  if (!Number.isInteger(raw)) {
    return Math.round(raw * 100);
  }
  if (integerUnit === 'paise') {
    // Prompt contract: 15000 = ₹150. Small integers (150) are treated as rupees
    // in case the model ignored the paise instruction.
    if (raw >= 1000) return raw;
    return Math.round(raw * 100);
  }
  return Math.round(raw * 100);
}

/** Paise at or above this look like rupees that were multiplied by 100 twice (₹5,000+). */
export const INFLATED_PAISE_FLOOR = 500_000;

export function catalogPaiseLookInflated(prices: Array<number | null | undefined>): boolean {
  const priced = prices.filter((p): p is number => typeof p === 'number' && p > 0);
  if (priced.length === 0) return false;
  return priced.every((p) => p >= INFLATED_PAISE_FLOOR && p % 10_000 === 0);
}

export function deflateDoubleConvertedPaise(paise: number): number {
  return Math.round(paise / 100);
}

/**
 * Brochure extraction sometimes returns paise, then coercion multiplies by 100 again.
 * If every priced row looks like that, divide back before commit / chat.
 */
export function repairInflatedDraftPrices(
  drafts: NormalizedProductDraft[]
): NormalizedProductDraft[] {
  if (!catalogPaiseLookInflated(drafts.map((d) => d.basePrice))) return drafts;
  return drafts.map((d) =>
    d.basePrice != null && d.basePrice > 0
      ? { ...d, basePrice: deflateDoubleConvertedPaise(d.basePrice) }
      : d
  );
}

function titleCase(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w.length <= 2 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

function deterministicRowId(name: string, sku?: string | null): string {
  const key = `${name.trim().toLowerCase()}::${(sku ?? '').trim().toUpperCase()}`;
  // Djb2 for compactness — 8-char hex is unique enough within a single import.
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return `r_${(h >>> 0).toString(16)}`;
}

// ---------------------------------------------------------------------------
// Vision row → draft
// ---------------------------------------------------------------------------

interface FieldConfMap { [k: string]: number }

function fv<T>(fv: { value: T; confidence: number } | undefined, fallback: T): { value: T; confidence: number } {
  if (!fv) return { value: fallback, confidence: 0 };
  return fv;
}

export function visionRowToDraft(row: ExtractedProductRow): NormalizedProductDraft {
  const name = fv(row.name, '');
  const sku = fv(row.sku, null);
  const description = fv(row.description, null);
  const priceFv = fv(row.basePrice, null as number | string | null);
  const unitFv = fv(row.baseUnit, 'piece');
  const qtyFv = fv(row.baseQuantity, 1 as number | string);
  const keywordsFv = fv(row.keywords, [] as string[]);

  const cleanedName = titleCase(String(name.value ?? ''));
  const cleanedSku = sku.value ? String(sku.value).trim().toUpperCase() : undefined;
  const { unit, known: unitKnown } = canonicalUnit(unitFv.value);
  const qty = Number(qtyFv.value);
  const basePrice = coercePricePaise(priceFv.value, { integerUnit: 'paise' });

  const fieldConfidence: FieldConfMap = {
    name: name.confidence,
    sku: sku.confidence,
    description: description.confidence,
    basePrice: priceFv.confidence * (basePrice == null ? 0.5 : 1),
    baseUnit: unitFv.confidence * (unitKnown ? 1 : 0.7),
    baseQuantity: qtyFv.confidence * (Number.isFinite(qty) && qty > 0 ? 1 : 0.3),
    keywords: keywordsFv.confidence
  };

  const rowConfidence = scoreRowConfidence(fieldConfidence, { hasPrice: basePrice != null, unitKnown });

  return normalizeFixedPackDraft({
    rowId: deterministicRowId(cleanedName, cleanedSku),
    name: cleanedName,
    sku: cleanedSku,
    description: description.value ? String(description.value).trim() : undefined,
    basePrice,
    baseUnit: unit,
    baseQuantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
    isDivisible: false,
    isActive: basePrice != null,
    imageUrl: undefined,
    keywords: Array.isArray(keywordsFv.value) ? keywordsFv.value.slice(0, 50) : [],
    overrideProtected: false,
    sourceMeta: {
      source: 'vision',
      confidence: rowConfidence,
      fieldConfidence,
      warnings: []
    }
  });
}

// ---------------------------------------------------------------------------
// Tabular row → draft
// ---------------------------------------------------------------------------

function pickFirst(rec: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const match = Object.keys(rec).find((h) => h.toLowerCase().trim() === k);
    if (match) {
      const v = rec[match]?.trim();
      if (v) return v;
    }
  }
  return undefined;
}

export function tabularRowToDraft(tr: TabularRow): NormalizedProductDraft | null {
  const r = tr.raw;
  const name = pickFirst(r, ['name', 'product', 'product name', 'item', 'item name']);
  if (!name) return null;
  const sku = pickFirst(r, ['sku', 'code', 'product code', 'model', 'item code']);
  const description = pickFirst(r, ['description', 'details', 'desc']);
  const priceRaw = pickFirst(r, ['price', 'rate', 'mrp', 'selling price', 'sale price', 'amount']);
  const unitRaw = pickFirst(r, ['unit', 'uom', 'base unit', 'baseunit']) ?? 'piece';
  const qtyRaw = pickFirst(r, ['quantity', 'qty', 'pack size', 'size', 'base quantity', 'basequantity']);
  const kwRaw = pickFirst(r, ['keywords', 'tags', 'synonyms']);

  const basePrice = coercePricePaise(priceRaw);
  const { unit, known: unitKnown } = canonicalUnit(unitRaw);
  const qty = qtyRaw ? Number(qtyRaw.replace(/[^\d.]/g, '')) : 1;
  const keywords = kwRaw ? kwRaw.split(/[,;|]/).map((k) => k.trim()).filter(Boolean).slice(0, 50) : [];

  const cleanedName = titleCase(name);
  const cleanedSku = sku ? sku.trim().toUpperCase() : undefined;

  const fieldConfidence: FieldConfMap = {
    name: 0.95,
    sku: cleanedSku ? 0.95 : 0,
    description: description ? 0.85 : 0,
    basePrice: basePrice != null ? 0.95 : 0,
    baseUnit: unitKnown ? 0.9 : 0.6,
    baseQuantity: Number.isFinite(qty) && qty > 0 ? 0.9 : 0.5,
    keywords: keywords.length ? 0.8 : 0
  };

  const rowConfidence = scoreRowConfidence(fieldConfidence, {
    hasPrice: basePrice != null,
    unitKnown
  });

  return normalizeFixedPackDraft({
    rowId: deterministicRowId(cleanedName, cleanedSku),
    name: cleanedName,
    sku: cleanedSku,
    description: description ?? undefined,
    basePrice,
    baseUnit: unit,
    baseQuantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
    isDivisible: false,
    isActive: basePrice != null,
    keywords,
    overrideProtected: false,
    sourceMeta: {
      source: tr.source,
      confidence: rowConfidence,
      fieldConfidence,
      warnings: []
    }
  });
}

// ---------------------------------------------------------------------------
// Fusion
// ---------------------------------------------------------------------------

const FUSION_NAME_SIMILARITY_THRESHOLD = 0.85;

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function similarity(a: string, b: string): number {
  // Trigram Jaccard — good enough for brand/SKU-free product names.
  const trigrams = (s: string): Set<string> => {
    const padded = `  ${s}  `;
    const out = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
    return out;
  };
  const A = trigrams(normalizeForMatch(a));
  const B = trigrams(normalizeForMatch(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Fuse tabular rows onto vision rows. Tabular numeric fields (price especially)
 * win over vision when vision's confidence is below 0.75.
 */
export function fuseRows(
  visionDrafts: NormalizedProductDraft[],
  tabularDrafts: NormalizedProductDraft[]
): NormalizedProductDraft[] {
  if (tabularDrafts.length === 0) return visionDrafts;
  if (visionDrafts.length === 0) return tabularDrafts;

  const usedTabular = new Set<number>();
  const fused: NormalizedProductDraft[] = [];

  for (const v of visionDrafts) {
    let bestIdx = -1;
    let bestSim = 0;
    for (let i = 0; i < tabularDrafts.length; i++) {
      if (usedTabular.has(i)) continue;
      const t = tabularDrafts[i];
      if (v.sku && t.sku && v.sku === t.sku) { bestIdx = i; bestSim = 1; break; }
      const sim = similarity(v.name, t.name);
      if (sim > bestSim) { bestSim = sim; bestIdx = i; }
    }

    if (bestIdx >= 0 && bestSim >= FUSION_NAME_SIMILARITY_THRESHOLD) {
      usedTabular.add(bestIdx);
      const t = tabularDrafts[bestIdx];
      fused.push(mergePreferConfident(v, t));
    } else {
      fused.push(v);
    }
  }

  // Any tabular rows with no vision match show up as tabular-only drafts.
  for (let i = 0; i < tabularDrafts.length; i++) {
    if (!usedTabular.has(i)) fused.push(tabularDrafts[i]);
  }
  return fused;
}

function mergePreferConfident(
  a: NormalizedProductDraft,
  b: NormalizedProductDraft
): NormalizedProductDraft {
  const pick = <K extends keyof NormalizedProductDraft>(field: K, confKey: string): NormalizedProductDraft[K] => {
    const aConf = a.sourceMeta.fieldConfidence?.[confKey] ?? 0;
    const bConf = b.sourceMeta.fieldConfidence?.[confKey] ?? 0;
    return bConf > aConf ? b[field] : a[field];
  };

  const fieldConfidence: FieldConfMap = {};
  for (const k of Object.keys({ ...a.sourceMeta.fieldConfidence, ...b.sourceMeta.fieldConfidence })) {
    fieldConfidence[k] = Math.max(
      a.sourceMeta.fieldConfidence?.[k] ?? 0,
      b.sourceMeta.fieldConfidence?.[k] ?? 0
    );
  }

  const merged: NormalizedProductDraft = {
    rowId: a.rowId,
    name: pick('name', 'name') as string,
    sku: (pick('sku', 'sku') as string | undefined) ?? a.sku ?? b.sku,
    description: (pick('description', 'description') as string | undefined) ?? a.description ?? b.description,
    basePrice: pick('basePrice', 'basePrice') as number | null,
    baseUnit: pick('baseUnit', 'baseUnit') as string,
    baseQuantity: pick('baseQuantity', 'baseQuantity') as number,
    isActive: (pick('basePrice', 'basePrice') as number | null) != null,
    keywords: Array.from(new Set([...(a.keywords ?? []), ...(b.keywords ?? [])])).slice(0, 50),
    overrideProtected: false,
    sourceMeta: {
      source: a.sourceMeta.source,
      confidence: 0,
      fieldConfidence,
      warnings: [...(a.sourceMeta.warnings ?? []), ...(b.sourceMeta.warnings ?? [])]
    }
  };
  merged.sourceMeta.confidence = scoreRowConfidence(fieldConfidence, {
    hasPrice: merged.basePrice != null,
    unitKnown: !!UNIT_SYNONYMS[merged.baseUnit]
  });
  return merged;
}

// ---------------------------------------------------------------------------
// Confidence scoring + classification
// ---------------------------------------------------------------------------

const WEIGHTS: Record<string, number> = {
  name: 0.30,
  basePrice: 0.25,
  baseUnit: 0.15,
  baseQuantity: 0.10,
  description: 0.10,
  sku: 0.05,
  keywords: 0.05
};

export function scoreRowConfidence(
  fieldConf: FieldConfMap,
  ctx: { hasPrice: boolean; unitKnown: boolean }
): number {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    const v = fieldConf[k];
    if (typeof v === 'number') {
      weightedSum += v * w;
      weightTotal += w;
    }
  }
  let score = weightTotal > 0 ? weightedSum / weightTotal : 0;
  // Penalties — mirror spec §5.4.
  if (!ctx.hasPrice) score *= 0.85;
  if (!ctx.unitKnown) score *= 0.9;
  return Math.max(0, Math.min(1, score));
}

export function classifyRow(row: NormalizedProductDraft): ClassifiedRow {
  const warnings: string[] = [...(row.sourceMeta.warnings ?? [])];

  if (!row.name || !row.baseUnit || !row.baseQuantity) {
    warnings.push('missing_required_field');
    return { row, bucket: 'blocked', warnings };
  }

  const rowConf = row.sourceMeta.confidence ?? 0;
  const fieldConfs = Object.entries(row.sourceMeta.fieldConfidence ?? {});
  const priceConf = row.sourceMeta.fieldConfidence?.basePrice ?? 1;

  const hasPrice = row.basePrice != null && row.basePrice >= 0;
  if (!hasPrice || priceConf < 0.75) {
    warnings.push('needs_pricing');
    return { row, bucket: 'needs_pricing', warnings };
  }

  const anyLowNonPrice = fieldConfs.some(([k, v]) => k !== 'basePrice' && v > 0 && v < 0.75);
  if (rowConf >= 0.88 && !anyLowNonPrice) {
    return { row, bucket: 'auto_accept', warnings };
  }
  if (!UNIT_SYNONYMS[row.baseUnit]) warnings.push('unknown_unit');
  return { row, bucket: 'review', warnings };
}

// In-batch dedup by normalized name + sku.
export function inBatchDedup(rows: NormalizedProductDraft[]): NormalizedProductDraft[] {
  const seen = new Map<string, NormalizedProductDraft>();
  for (const row of rows) {
    const key = `${row.name.trim().toLowerCase()}::${(row.sku ?? '').trim().toUpperCase()}`;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, row);
    } else {
      // Keep the higher-confidence one on collision.
      if ((row.sourceMeta.confidence ?? 0) > (prev.sourceMeta.confidence ?? 0)) {
        seen.set(key, row);
      }
    }
  }
  return Array.from(seen.values());
}
