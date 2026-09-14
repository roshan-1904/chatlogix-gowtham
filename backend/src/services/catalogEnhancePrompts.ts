import {
  buildEnrichmentSystemPrompt,
  type ShopEnrichmentContext
} from './catalogEnrichmentService.js';
import type { EnhanceEntityType } from './catalogEnhanceSessionService.js';

export function buildProductEnhanceSystemPrompt(shop?: ShopEnrichmentContext): string {
  const base = buildEnrichmentSystemPrompt(shop);
  return `${base}

CHAT ENHANCER MODE
You are helping a vendor refine ONE product via chat. Each turn, respond with strict JSON:
{
  "assistantMessage": "short reply to the vendor in chat (max 120 words)",
  "description": "enhanced WhatsApp-ready product description",
  "keywords": { "en": [...], "hi": [...], "ta": [...] }
}
Use the ENTITY SNAPSHOT, SHOP CONTEXT, CHAT HISTORY, and CURRENT DRAFT in the user message.
Revise the draft when the vendor asks for changes. assistantMessage must not repeat the full description.`;
}

export function buildFaqEnhanceSystemPrompt(shop?: ShopEnrichmentContext): string {
  const shopLines: string[] = [];
  if (shop?.businessName) shopLines.push(`Shop name: ${shop.businessName}`);
  if (shop?.deliveryNotes) shopLines.push(`Delivery: ${shop.deliveryNotes}`);
  if (shop?.hours) shopLines.push(`Hours: ${shop.hours}`);
  const shopBlock =
    shopLines.length > 0 ? `\nSHOP CONTEXT:\n${shopLines.join('\n')}\n` : '';

  return `You enhance vendor FAQ answers for WhatsApp customer support.
${shopBlock}
OUTPUT (strict JSON):
{
  "assistantMessage": "short reply to the vendor (max 120 words)",
  "answer": "enhanced FAQ answer, clear and complete",
  "question": "optional polished question — omit if unchanged"
}
RULES
- Max 1500 characters for answer.
- Do not invent policies, prices, or delivery promises beyond provided facts.
- Match the language of the original question/answer.
- Expand honestly; do not add marketing fluff.`;
}

export function buildEnhanceUserPayload(input: {
  entityType: EnhanceEntityType;
  entityJson: string;
  chatHistory: string;
  currentDraft: string;
}): string {
  const parts = [
    `ENTITY TYPE: ${input.entityType}`,
    `ENTITY SNAPSHOT:\n${input.entityJson}`,
    `CHAT HISTORY:\n${input.chatHistory || '(none)'}`,
    `CURRENT DRAFT:\n${input.currentDraft || '(none)'}`
  ];
  return parts.join('\n\n');
}
