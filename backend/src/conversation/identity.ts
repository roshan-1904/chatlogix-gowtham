import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';

export interface ResolveIdentityInput {
  vendorId?: string | null;
  phoneNumberId?: string | null;
  customerPhone: string;
}

export interface ResolvedIdentity {
  vendorId: string;
  customerId: string;
  conversationId: string;
}

/**
 * Spec §7 step 1 / §9: resolve vendor via `vendorId` or
 * `WhatsAppNumber.phoneNumberId`, then upsert customer + open conversation.
 *
 * Deliberately NOT reusing `messageProcessor.ts`'s existing `ensureConversation`
 * (which does the same customer/conversation upsert) — that file instantiates
 * `new AIService()` and `new EventOrchestrator()` at module load, both heavy,
 * real-side-effect chains (AIService alone pulls in a live OpenAI client,
 * OrderService, ConversationStateService, CustomerInsightsService...). Every
 * test that imports anything from this module would pay for that transitively,
 * the same class of dependency-bleed problem fixed in Steps 4/5/6/7/8. This
 * file's own logic is a few lines of plain Prisma calls — cheaper to write
 * fresh than to accept that coupling.
 */
export async function resolveIdentity(input: ResolveIdentityInput): Promise<ResolvedIdentity> {
  const vendorId = await resolveVendorId(input.vendorId, input.phoneNumberId);

  const customer = await prisma.customer.upsert({
    where: { phone: input.customerPhone },
    create: { phone: input.customerPhone },
    update: { lastInteraction: new Date() }
  });

  let conversation = await prisma.conversation.findFirst({
    where: { vendorId, customerId: customer.id, status: 'open' },
    orderBy: { updatedAt: 'desc' }
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({ data: { vendorId, customerId: customer.id } });
  }

  return { vendorId, customerId: customer.id, conversationId: conversation.id };
}

async function resolveVendorId(vendorId: string | null | undefined, phoneNumberId: string | null | undefined): Promise<string> {
  if (vendorId) {
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true } });
    if (vendor) {
      return vendor.id;
    }
    // chatlogix-webhook-handler used to copy WhatsApp metadata.phone_number_id
    // into vendorId. That value is not Vendor.id (a UUID), so fall through to
    // the WhatsAppNumber lookup rather than failing the SQS record.
    logger.warn(
      { vendorId, phoneNumberId },
      'vendorId did not match Vendor.id; resolving via WhatsAppNumber.phoneNumberId'
    );
  }

  const lookupPhoneNumberId = phoneNumberId || vendorId;
  if (!lookupPhoneNumberId) {
    throw new Error('Cannot resolve vendor: neither vendorId nor phoneNumberId was provided');
  }

  const waNumber = await prisma.whatsAppNumber.findUnique({ where: { phoneNumberId: lookupPhoneNumberId } });
  if (!waNumber) {
    throw new Error(`No vendor found for phoneNumberId=${lookupPhoneNumberId}`);
  }
  return waNumber.vendorId;
}
