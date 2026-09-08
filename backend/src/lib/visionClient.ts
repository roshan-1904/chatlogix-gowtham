import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { calculateCost, type CostResult } from '../utils/costCalculator.js';
import { getExtractionPrompt } from '../services/prompts/catalogExtraction/index.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

const FieldValue = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value,
    confidence: z.number().min(0).max(1)
  });

// Loose on types — the vision model occasionally returns strings for numbers.
// Normalization happens downstream.
export const ExtractedProductRowSchema = z.object({
  name: FieldValue(z.string().min(1)),
  sku: FieldValue(z.string().nullable()).optional(),
  description: FieldValue(z.string().nullable()).optional(),
  basePrice: FieldValue(z.union([z.number(), z.string(), z.null()])),
  baseUnit: FieldValue(z.string()),
  baseQuantity: FieldValue(z.union([z.number(), z.string()])),
  keywords: FieldValue(z.array(z.string())).optional()
});

export type ExtractedProductRow = z.infer<typeof ExtractedProductRowSchema>;

export const VENDOR_PROFILE_CATEGORIES = [
  'Food',
  'Retail',
  'Services',
  'Healthcare',
  'Education',
  'Other'
] as const;
export type VendorProfileCategory = (typeof VENDOR_PROFILE_CATEGORIES)[number];

export type VendorProfileLanguageHint = 'ta' | 'hi' | 'en';

export type VendorProfileField<T = string> = { value: T | null; confidence: number };

const CATEGORY_ALIASES: Record<string, VendorProfileCategory> = {
  food: 'Food',
  bakery: 'Food',
  restaurant: 'Food',
  cafe: 'Food',
  café: 'Food',
  grocery: 'Food',
  sweets: 'Food',
  retail: 'Retail',
  garment: 'Retail',
  apparel: 'Retail',
  electronics: 'Retail',
  services: 'Services',
  healthcare: 'Healthcare',
  clinic: 'Healthcare',
  hospital: 'Healthcare',
  education: 'Education',
  school: 'Education',
  other: 'Other'
};

const LANGUAGE_ALIASES: Record<string, VendorProfileLanguageHint> = {
  ta: 'ta',
  tamil: 'ta',
  tamizh: 'ta',
  hi: 'hi',
  hindi: 'hi',
  en: 'en',
  eng: 'en',
  english: 'en'
};

export function coerceVendorProfileCategory(raw: string | null | undefined): VendorProfileCategory | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const exact = VENDOR_PROFILE_CATEGORIES.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;
  return CATEGORY_ALIASES[trimmed.toLowerCase()] ?? null;
}

export function coerceLanguageHint(raw: string | null | undefined): VendorProfileLanguageHint | null {
  if (raw == null) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  return LANGUAGE_ALIASES[trimmed] ?? null;
}

const VendorProfileFieldSchema = FieldValue(z.string().nullable());

const CategoryFieldSchema = VendorProfileFieldSchema.transform((field) => ({
  value: coerceVendorProfileCategory(field.value),
  confidence: field.confidence
}));

const LanguageHintFieldSchema = VendorProfileFieldSchema.transform((field) => ({
  value: coerceLanguageHint(field.value),
  confidence: field.confidence
}));

export const ExtractedVendorProfileSchema = z.object({
  businessName: VendorProfileFieldSchema.optional(),
  category: CategoryFieldSchema.optional(),
  address: VendorProfileFieldSchema.optional(),
  city: VendorProfileFieldSchema.optional(),
  hours: VendorProfileFieldSchema.optional(),
  deliveryNotes: VendorProfileFieldSchema.optional(),
  languageHint: LanguageHintFieldSchema.optional()
});

export type ExtractedVendorProfile = z.infer<typeof ExtractedVendorProfileSchema>;

export const VisionResponseSchema = z.object({
  products: z.array(ExtractedProductRowSchema).max(60),
  vendorProfile: ExtractedVendorProfileSchema.optional()
});

export type VisionResponse = z.infer<typeof VisionResponseSchema>;

export type MergedVendorProfile = {
  businessName: VendorProfileField;
  category: VendorProfileField<VendorProfileCategory>;
  address: VendorProfileField;
  city: VendorProfileField;
  hours: VendorProfileField;
  deliveryNotes: VendorProfileField;
  languageHint: VendorProfileField<VendorProfileLanguageHint>;
};

export interface VisionCallInput {
  imageBuffer: Buffer;
  contentType: string;
  category?: string;
  languageHint?: 'ta' | 'hi' | 'en';
  pageIndex?: number;
  maxProducts?: number;
}

export interface VisionCallResult {
  products: ExtractedProductRow[];
  vendorProfile?: ExtractedVendorProfile;
  cost: CostResult;
}

export class VisionClientError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// Base64 `data:` URL — works for images up to the vision model's request cap.
// Our per-image cap is 8 MB; after base64 the payload is ~10.7 MB which stays
// within the GPT-4.1 vision request size limit.
function toDataUrl(buf: Buffer, contentType: string): string {
  return `data:${contentType};base64,${buf.toString('base64')}`;
}

export async function callVisionExtraction(input: VisionCallInput): Promise<VisionCallResult> {
  if (!openai) {
    throw new VisionClientError('OPENAI_NOT_CONFIGURED', 'OPENAI_API_KEY is not set');
  }

  const systemPrompt = getExtractionPrompt(input.category, input.languageHint, input.maxProducts);
  const model = env.VISION_EXTRACTION_MODEL;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract products and any printed shop details from this image. Return only the JSON object per the contract.'
          },
          {
            type: 'image_url',
            image_url: { url: toDataUrl(input.imageBuffer, input.contentType) }
          }
        ]
      }
    ],
    temperature: 0.2,
    max_completion_tokens: 4000,
    response_format: { type: 'json_object' }
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  const cost = calculateCost(
    model,
    completion.usage?.prompt_tokens,
    completion.usage?.completion_tokens,
    completion.usage?.total_tokens
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.warn({ err, pageIndex: input.pageIndex, snippet: raw.slice(0, 200) }, 'vision_json_parse_failed');
    return { products: [], vendorProfile: undefined, cost };
  }

  const productsShape = z
    .object({ products: z.array(ExtractedProductRowSchema).max(60).optional() })
    .safeParse(parsed);
  if (!productsShape.success) {
    logger.warn(
      { pageIndex: input.pageIndex, issues: productsShape.error.issues.slice(0, 5) },
      'vision_response_shape_invalid'
    );
  }

  const profileShape = z
    .object({ vendorProfile: ExtractedVendorProfileSchema.optional() })
    .safeParse(parsed);

  return {
    products: productsShape.success ? (productsShape.data.products ?? []) : [],
    vendorProfile: profileShape.success ? profileShape.data.vendorProfile : undefined,
    cost
  };
}
