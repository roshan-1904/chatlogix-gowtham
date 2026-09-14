import { needsEnglish, toVendorEnglish } from './vendorEnglish.js';

export async function toStoredEnglish(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed || !needsEnglish(trimmed)) return trimmed;
  return (await toVendorEnglish(trimmed)).trim() || trimmed;
}

export async function normalizeFaqEnglish(input: {
  question?: string;
  answer?: string;
}): Promise<{ question?: string; answer?: string }> {
  const out: { question?: string; answer?: string } = {};
  if (input.question !== undefined) out.question = await toStoredEnglish(input.question);
  if (input.answer !== undefined) out.answer = await toStoredEnglish(input.answer);
  return out;
}

export async function normalizeProductEnglish<T extends {
  name?: string;
  description?: string;
  sku?: string;
  variants?: Array<{
    label?: string;
    sku?: string;
    attributes?: Record<string, string>;
  }>;
}>(input: T): Promise<T> {
  const next = { ...input };
  if (next.name !== undefined) next.name = await toStoredEnglish(next.name);
  if (next.description !== undefined) next.description = await toStoredEnglish(next.description);
  if (next.sku !== undefined) next.sku = (await toStoredEnglish(next.sku)).toUpperCase();
  if (next.variants) {
    next.variants = await Promise.all(
      next.variants.map(async (variant) => {
        const attributes = variant.attributes
          ? Object.fromEntries(
              await Promise.all(
                Object.entries(variant.attributes).map(async ([key, value]) => [
                  key,
                  await toStoredEnglish(value)
                ])
              )
            )
          : variant.attributes;
        return {
          ...variant,
          label: variant.label !== undefined ? await toStoredEnglish(variant.label) : variant.label,
          sku: variant.sku !== undefined ? (await toStoredEnglish(variant.sku)).toUpperCase() : variant.sku,
          attributes
        };
      })
    );
  }
  return next;
}
