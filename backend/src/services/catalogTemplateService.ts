import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger.js';
import type { NormalizedProductDraft } from '../routes/schemas/catalogImport.js';
import { canonicalUnit } from './catalogNormalizationService.js';

interface TemplateRow {
  name: string;
  baseUnit: string;
  baseQuantity: number;
  keywords?: string[];
  description?: string;
}

const SUPPORTED_CATEGORIES = new Set([
  'grocery',
  'restaurant',
  'bakery',
  'garment',
  'electronics'
]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, '..', 'data', 'catalog-templates');

const cache = new Map<string, NormalizedProductDraft[]>();

function slugRowId(name: string, idx: number): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `t_${slug}_${idx}`;
}

function toDraft(row: TemplateRow, idx: number): NormalizedProductDraft {
  const { unit, known } = canonicalUnit(row.baseUnit);
  return {
    rowId: slugRowId(row.name, idx),
    name: row.name.trim(),
    baseUnit: unit,
    baseQuantity: row.baseQuantity,
    isDivisible: false,
    basePrice: null,
    description: row.description,
    keywords: (row.keywords ?? []).slice(0, 50),
    isActive: false,
    overrideProtected: false,
    sourceMeta: {
      source: 'manual',
      confidence: 1,
      fieldConfidence: {
        name: 1,
        baseUnit: known ? 1 : 0.7,
        baseQuantity: 1,
        basePrice: 0,
        keywords: row.keywords?.length ? 1 : 0
      },
      warnings: ['needs_pricing']
    }
  };
}

export async function getTemplate(rawCategory: string): Promise<NormalizedProductDraft[]> {
  const category = rawCategory.trim().toLowerCase();
  if (!SUPPORTED_CATEGORIES.has(category)) return [];
  const cached = cache.get(category);
  if (cached) return cached;

  const path = join(TEMPLATE_DIR, `${category}.json`);
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      logger.warn({ category }, 'catalog_template_not_array');
      cache.set(category, []);
      return [];
    }
    const drafts = (parsed as TemplateRow[])
      .filter((r) => r && typeof r.name === 'string' && r.name.trim().length > 0)
      .map((r, i) => toDraft(r, i));
    cache.set(category, drafts);
    return drafts;
  } catch (err) {
    logger.warn({ err, category }, 'catalog_template_load_failed');
    cache.set(category, []);
    return [];
  }
}
