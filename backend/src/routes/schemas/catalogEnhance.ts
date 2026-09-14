import { z } from 'zod';

export const StartEnhanceSessionSchema = z.object({
  entityType: z.enum(['product', 'faq']),
  entityId: z.string().uuid()
});

export const PostEnhanceMessageSchema = z.object({
  content: z.string().max(4000)
});

export const AcceptEnhanceSchema = z.object({
  applyKeywords: z.boolean().optional().default(true),
  updateQuestion: z.boolean().optional().default(false)
});
