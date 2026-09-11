import { z } from 'zod';

// S3 keys returned by /upload-url live under `imports/{vendorId}/{jobId}/...`.
// We don't validate the full structure here — the service layer re-checks vendor
// ownership before fetching bytes. Surface-level cap just rejects empty/huge junk.
const S3KeySchema = z.string().min(1).max(1024);

export const ImportOptionsSchema = z.object({
  currency: z.string().length(3).default('INR'),
  languageHint: z.enum(['ta', 'hi', 'en']).optional(),
  allowUpdateExisting: z.boolean().default(false),
  autoGenerateAIConfig: z.boolean().default(true),
  category: z.string().min(1).max(64).optional(),
  maxProducts: z.number().int().min(1).max(60).optional()
});

export const AnalyzeRequestSchema = z.object({
  brochureImageKeys: z.array(S3KeySchema).max(20).default([]),
  tabularFileKey: S3KeySchema.optional(),
  importOptions: ImportOptionsSchema.default({})
}).refine(
  (v) => v.brochureImageKeys.length > 0 || !!v.tabularFileKey,
  { message: 'at_least_one_input_required' }
);

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

// Shared product draft shape — matches spec §7.1. Kept loose on free-text fields
// so the review grid can round-trip the exact bytes users see.
export const NormalizedProductDraftSchema = z.object({
  rowId: z.string().min(1), // deterministic id: normalize(name) — stable across edits
  name: z.string().trim().min(1).max(256),
  sku: z.string().trim().max(64).optional(),
  description: z.string().max(2000).optional(),
  basePrice: z.number().int().nonnegative().nullable().optional(), // paise; null when missing
  baseUnit: z.string().min(1).max(32),
  baseQuantity: z.number().positive(),
  isDivisible: z.boolean().default(false),
  minOrderQuantity: z.number().positive().optional(),
  maxOrderQuantity: z.number().positive().optional(),
  isActive: z.boolean().default(true),
  imageUrl: z.string().url().optional(),
  keywords: z.array(z.string().min(1).max(64)).max(50).default([]),
  overrideProtected: z.boolean().default(false),
  sourceMeta: z.object({
    source: z.enum(['vision', 'csv', 'xlsx', 'manual']),
    confidence: z.number().min(0).max(1),
    fieldConfidence: z.record(z.number().min(0).max(1)).default({}),
    warnings: z.array(z.string()).default([])
  })
});

export type NormalizedProductDraft = z.infer<typeof NormalizedProductDraftSchema>;

// Subset of the AI-config payload that /commit can apply. Mirrors the allow-list
// in vendors.ts PUT /:id/ai-prompts so we don't drift.
export const AIConfigSectionsSchema = z.object({
  personality: z.string().max(4000).optional(),
  greetingStyle: z.string().max(2000).optional(),
  businessHours: z.string().max(500).optional(),
  deliveryInformation: z.string().max(2000).optional(),
  paymentInformation: z.string().max(2000).optional(),
  commonFaqs: z.string().max(4000).optional(),
  specialInstructions: z.string().max(4000).optional(),
  preparationTimeMinutes: z.number().int().nonnegative().max(1440).optional(),
  products: z.string().max(10_000).optional(),
  contentResponsibilities: z.string().max(4000).optional(),
  contentConversationRules: z.string().max(4000).optional(),
  contentImportantInstructions: z.string().max(4000).optional()
});

export type AIConfigSections = z.infer<typeof AIConfigSectionsSchema>;

// Idempotency key format:
// - wave 1: `{vendorId}:{jobId}`
// - wave 2: `{vendorId}:{jobId}:wave2`
// - retry:  `{vendorId}:{jobId}:retry:{nonce}`
// vendorId is an app identifier (not guaranteed UUID); jobId is UUID.
const IdempotencyKeySchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]+:[0-9a-fA-F-]{36}(?::wave2)?(?::retry:[A-Za-z0-9-]+)?$/,
    'invalid_idempotency_key'
  );

export const CommitRequestSchema = z.object({
  jobId: z.string().uuid(),
  approvedProducts: z.array(NormalizedProductDraftSchema).min(1).max(500),
  applyAIConfig: AIConfigSectionsSchema.optional(),
  idempotencyKey: IdempotencyKeySchema,
  dryRun: z.boolean().default(false),
  wave: z.union([z.literal(1), z.literal(2)]).default(1)
});

export type CommitRequest = z.infer<typeof CommitRequestSchema>;

// PATCH /:jobId/draft — autosave partial edits without committing.
export const DraftPatchSchema = z.object({
  draftEdits: z.array(NormalizedProductDraftSchema).max(500)
});

export type DraftPatch = z.infer<typeof DraftPatchSchema>;

export const TestMessageSchema = z.object({
  jobId: z.string().uuid().optional(),
  text: z.string().min(1).max(2000)
});

export type TestMessageRequest = z.infer<typeof TestMessageSchema>;

export const FastPhotoSchema = z.object({
  imageKey: S3KeySchema
});

export type FastPhotoRequest = z.infer<typeof FastPhotoSchema>;

export const FastTemplateSchema = z.object({
  category: z.string().min(1).max(64)
});

export type FastTemplateRequest = z.infer<typeof FastTemplateSchema>;
