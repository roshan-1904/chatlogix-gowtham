import { prisma } from '../src/db/prisma.js';

async function main() {
  const phoneVariants = [
    '9790690170',
    '919790690170',
    '+919790690170'
  ];

  console.log('Looking up customer by phone variants:', phoneVariants);
  const customers = await prisma.customer.findMany({
    where: { phone: { in: phoneVariants } },
    select: { id: true, phone: true, lastInteraction: true }
  });
  if (!customers.length) {
    console.log('NO customer rows match any of those phone variants.');
    console.log('Sample of latest 5 customers:');
    const recent = await prisma.customer.findMany({
      orderBy: { lastInteraction: 'desc' },
      take: 5,
      select: { id: true, phone: true, lastInteraction: true }
    });
    console.log(recent);
    return;
  }

  console.log(`Found ${customers.length} customer(s):`, customers);

  const customerIds = customers.map((c) => c.id);
  const conversations = await prisma.conversation.findMany({
    where: { customerId: { in: customerIds } },
    select: { id: true, vendorId: true, customerId: true, updatedAt: true }
  });
  console.log(`\nConversations (${conversations.length}):`, conversations);

  const conversationIds = conversations.map((c) => c.id);
  const messages = await prisma.message.findMany({
    where: { conversationId: { in: conversationIds } },
    orderBy: { timestamp: 'desc' },
    take: 20,
    select: {
      id: true,
      type: true,
      senderType: true,
      content: true,
      whatsappMessageId: true,
      status: true,
      replyToMessageId: true,
      timestamp: true,
      media: {
        select: {
          fetchState: true,
          mimeType: true,
          s3Key: true,
          width: true,
          height: true,
          fetchAttempts: true,
          lastFetchError: true
        }
      },
      reactions: { where: { active: true }, select: { emoji: true, reactorId: true } }
    }
  });
  console.log(`\nLast ${messages.length} messages (most recent first):`);
  for (const m of messages) {
    console.log(JSON.stringify(m, null, 2));
  }

  const messageIds = messages.map((m) => m.id);
  if (messageIds.length) {
    const reactionHistory = await prisma.messageReactionHistory.findMany({
      where: { messageId: { in: messageIds } },
      orderBy: { occurredAt: 'desc' },
      take: 10
    });
    console.log(`\nReaction history rows (${reactionHistory.length}):`, reactionHistory);

    const statusEvents = await prisma.messageStatusEvent.findMany({
      where: { messageId: { in: messageIds } },
      orderBy: { occurredAt: 'desc' },
      take: 10
    });
    console.log(`\nStatus event rows (${statusEvents.length}):`, statusEvents);
  }

  // Vendor flag check (per-conversation vendor)
  const vendorIds = Array.from(new Set(conversations.map((c) => c.vendorId)));
  if (vendorIds.length) {
    const vendors = await prisma.vendor.findMany({
      where: { id: { in: vendorIds } },
      select: { id: true, businessName: true, featureFlags: true }
    });
    console.log('\nVendor(s) + featureFlags:', vendors);
  }
}

main()
  .catch((err) => {
    console.error('Inspection failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
