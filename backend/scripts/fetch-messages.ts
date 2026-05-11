import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fetchLastMessages(phoneNumber: string, vendorName: string, limit: number = 10) {
  console.log(`\n🔍 Searching for messages...`);
  console.log(`   Phone: ${phoneNumber}`);
  console.log(`   Vendor: ${vendorName}`);
  console.log(`   Limit: ${limit} messages\n`);

  try {
    // Step 1: Find vendor (handle case variations)
    const vendor = await prisma.vendor.findFirst({
      where: {
        businessName: {
          contains: vendorName,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        businessName: true
      }
    });

    if (!vendor) {
      console.log('❌ Vendor not found. Searching all vendors...\n');
      const allVendors = await prisma.vendor.findMany({
        take: 10,
        select: { id: true, businessName: true }
      });
      if (allVendors.length > 0) {
        console.log('Available vendors:');
        allVendors.forEach(v => console.log(`  - ${v.businessName}`));
      }
      return;
    }

    console.log(`✅ Found vendor: ${vendor.businessName} (ID: ${vendor.id})\n`);

    // Step 2: Find customer by phone (try multiple formats)
    const phoneVariations = [
      phoneNumber,
      `91${phoneNumber}`,
      `+91${phoneNumber}`,
      `919${phoneNumber.substring(1)}`,
      phoneNumber.substring(phoneNumber.length - 10) // Last 10 digits
    ];

    let customer = null;
    for (const phoneVariant of phoneVariations) {
      customer = await prisma.customer.findFirst({
        where: {
          phone: {
            contains: phoneVariant,
            mode: 'insensitive'
          }
        }
      });
      if (customer) {
        console.log(`✅ Found customer: ${customer.phone} (ID: ${customer.id})\n`);
        break;
      }
    }

    if (!customer) {
      console.log('❌ Customer not found with the provided phone number.');
      return;
    }

    // Step 3: Find conversation between customer and vendor
    const conversation = await prisma.conversation.findFirst({
      where: {
        customerId: customer.id,
        vendorId: vendor.id
      },
      include: {
        customer: true,
        vendor: {
          select: {
            businessName: true
          }
        }
      }
    });

    if (!conversation) {
      console.log('❌ No conversation found between this customer and vendor.');
      return;
    }

    console.log(`✅ Found conversation: ${conversation.id}`);
    console.log(`   Status: ${conversation.status}`);
    console.log(`   Created: ${conversation.createdAt}\n`);

    // Step 4: Fetch last N messages
    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversation.id
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: limit
    });

    console.log(`\n📨 Last ${messages.length} messages:\n`);
    console.log('='.repeat(80));

    if (messages.length === 0) {
      console.log('No messages found in this conversation.');
    } else {
      // Reverse to show oldest first, newest last
      messages.reverse().forEach((msg, idx) => {
        const messageNumber = messages.length - idx;
        const timestamp = new Date(msg.timestamp).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'short',
          timeStyle: 'medium'
        });
        
        console.log(`\n[${messageNumber}] ${timestamp}`);
        console.log(`    From: ${msg.senderType.toUpperCase()}`);
        console.log(`    Type: ${msg.type}`);
        console.log(`    Content: ${msg.content}`);
        if (msg.aiTokensUsed > 0) {
          console.log(`    AI Tokens: ${msg.aiTokensUsed}`);
        }
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log(`\nTotal messages in conversation: ${messages.length} shown (out of all messages)`);

  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Get arguments from command line
const phoneNumber = process.argv[2];
const vendorName = process.argv[3] || 'i bell creations';
const limit = parseInt(process.argv[4] || '10', 10);

if (!phoneNumber) {
  console.error('Please provide a phone number as an argument');
  console.error('Usage: ts-node fetch-messages.ts <phone-number> [vendor-name] [limit]');
  console.error('Example: ts-node fetch-messages.ts 9790690170 "i bell creations" 10');
  process.exit(1);
}

fetchLastMessages(phoneNumber, vendorName, limit)
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

