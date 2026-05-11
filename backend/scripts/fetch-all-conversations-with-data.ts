import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ConversationData {
  conversation: any;
  messages: any[];
  orders: any[];
  memory: any | null;
  insights: any | null;
}

async function fetchAllConversationsWithData(phoneNumber: string, vendorName: string) {
  console.log(`\n🔍 Fetching all conversations and related data...`);
  console.log(`   Phone: ${phoneNumber}`);
  console.log(`   Vendor: ${vendorName}\n`);

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
        businessName: true,
        phone: true
      }
    });

    if (!vendor) {
      console.log('❌ Vendor not found. Searching all vendors...\n');
      const allVendors = await prisma.vendor.findMany({
        take: 20,
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
    let matchedPhone = '';
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
        matchedPhone = customer.phone;
        console.log(`✅ Found customer: ${customer.phone} (ID: ${customer.id})\n`);
        break;
      }
    }

    if (!customer) {
      console.log('❌ Customer not found with the provided phone number.');
      console.log('Tried variations:', phoneVariations.join(', '));
      return;
    }

    // Step 3: Find ALL conversations between customer and vendor
    const conversations = await prisma.conversation.findMany({
      where: {
        customerId: customer.id,
        vendorId: vendor.id
      },
      include: {
        customer: true,
        vendor: {
          select: {
            businessName: true,
            phone: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (conversations.length === 0) {
      console.log('❌ No conversations found between this customer and vendor.');
      return;
    }

    console.log(`✅ Found ${conversations.length} conversation(s)\n`);

    // Step 4: Fetch all data for each conversation
    const conversationData: ConversationData[] = [];

    for (const conv of conversations) {
      // Fetch all messages for this conversation
      const messages = await prisma.message.findMany({
        where: {
          conversationId: conv.id
        },
        orderBy: {
          timestamp: 'asc'
        }
      });

      // Fetch all orders for this conversation
      const orders = await prisma.order.findMany({
        where: {
          conversationId: conv.id
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Fetch conversation memory
      const memory = await prisma.conversationMemory.findUnique({
        where: {
          conversationId: conv.id
        }
      });

      // Fetch customer insights (vendor-specific)
      const insights = await prisma.customerInsights.findUnique({
        where: {
          customerId_vendorId: {
            customerId: customer.id,
            vendorId: vendor.id
          }
        }
      });

      conversationData.push({
        conversation: conv,
        messages,
        orders,
        memory,
        insights
      });
    }

    // Step 5: Display comprehensive report
    console.log('\n' + '='.repeat(100));
    console.log('📊 COMPREHENSIVE DATA REPORT');
    console.log('='.repeat(100));
    console.log(`\nCustomer: ${matchedPhone} (${customer.id})`);
    console.log(`Vendor: ${vendor.businessName} (${vendor.id})`);
    console.log(`Total Conversations: ${conversations.length}`);
    
    // Calculate totals
    const totalMessages = conversationData.reduce((sum, cd) => sum + cd.messages.length, 0);
    const totalOrders = conversationData.reduce((sum, cd) => sum + cd.orders.length, 0);
    const conversationsWithMemory = conversationData.filter(cd => cd.memory !== null).length;
    const hasInsights = conversationData.some(cd => cd.insights !== null);

    console.log(`Total Messages: ${totalMessages}`);
    console.log(`Total Orders: ${totalOrders}`);
    console.log(`Conversations with Memory: ${conversationsWithMemory}`);
    console.log(`Has Customer Insights: ${hasInsights ? 'Yes' : 'No'}`);

    // Display each conversation
    conversationData.forEach((cd, idx) => {
      const conv = cd.conversation;
      console.log('\n' + '='.repeat(100));
      console.log(`\n📞 CONVERSATION ${idx + 1} of ${conversations.length}`);
      console.log('='.repeat(100));
      console.log(`\nConversation ID: ${conv.id}`);
      console.log(`Status: ${conv.status}`);
      console.log(`AI Paused: ${conv.aiPaused}`);
      console.log(`Created: ${new Date(conv.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
      console.log(`Updated: ${new Date(conv.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
      console.log(`\nMessages: ${cd.messages.length}`);
      console.log(`Orders: ${cd.orders.length}`);

      // Display Messages
      if (cd.messages.length > 0) {
        console.log('\n📨 MESSAGES:');
        console.log('-'.repeat(100));
        cd.messages.forEach((msg, msgIdx) => {
          const timestamp = new Date(msg.timestamp).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            dateStyle: 'short',
            timeStyle: 'medium'
          });
          console.log(`\n[${msgIdx + 1}/${cd.messages.length}] ${timestamp}`);
          console.log(`  From: ${msg.senderType.toUpperCase()}`);
          console.log(`  Type: ${msg.type}`);
          console.log(`  Content: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}`);
          if (msg.normalizedContent) {
            console.log(`  Normalized: ${msg.normalizedContent.substring(0, 200)}${msg.normalizedContent.length > 200 ? '...' : ''}`);
          }
          if (msg.aiTokensUsed > 0) {
            console.log(`  AI Tokens: ${msg.aiTokensUsed}`);
          }
          if (msg.messageSummary) {
            console.log(`  Summary: ${msg.messageSummary.substring(0, 150)}${msg.messageSummary.length > 150 ? '...' : ''}`);
          }
        });
      }

      // Display Orders
      if (cd.orders.length > 0) {
        console.log('\n\n🛒 ORDERS:');
        console.log('-'.repeat(100));
        cd.orders.forEach((order, orderIdx) => {
          console.log(`\n[${orderIdx + 1}/${cd.orders.length}] Order: ${order.orderNumber}`);
          console.log(`  Status: ${order.status}`);
          console.log(`  Total Amount: ₹${(order.totalAmount / 100).toFixed(2)}`);
          console.log(`  Created: ${new Date(order.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
          if (order.confirmedAt) {
            console.log(`  Confirmed: ${new Date(order.confirmedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
          }
          if (order.deliveredAt) {
            console.log(`  Delivered: ${new Date(order.deliveredAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
          }
          console.log(`  Items: ${JSON.stringify(order.items, null, 2).substring(0, 300)}${JSON.stringify(order.items).length > 300 ? '...' : ''}`);
          if (order.deliveryAddress) {
            console.log(`  Delivery Address: ${order.deliveryAddress.substring(0, 200)}${order.deliveryAddress.length > 200 ? '...' : ''}`);
          }
          if (order.specialRequests) {
            console.log(`  Special Requests: ${order.specialRequests.substring(0, 200)}${order.specialRequests.length > 200 ? '...' : ''}`);
          }
        });
      } else {
        console.log('\n\n🛒 ORDERS: None');
      }

      // Display Conversation Memory
      if (cd.memory) {
        console.log('\n\n🧠 CONVERSATION MEMORY:');
        console.log('-'.repeat(100));
        console.log(`  Turn Number: ${cd.memory.turnNumber}`);
        console.log(`  Conversation Stage: ${cd.memory.conversationStage}`);
        console.log(`  Last Updated: ${new Date(cd.memory.lastUpdated).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
        console.log(`  Key Facts: ${JSON.stringify(cd.memory.keyFacts, null, 2)}`);
        console.log(`  Ongoing Topics: ${JSON.stringify(cd.memory.ongoingTopics, null, 2)}`);
        console.log(`  Customer Preferences: ${JSON.stringify(cd.memory.customerPreferences, null, 2)}`);
        if (cd.memory.lastOrderSummary) {
          console.log(`  Last Order Summary: ${cd.memory.lastOrderSummary.substring(0, 300)}${cd.memory.lastOrderSummary.length > 300 ? '...' : ''}`);
        }
        if (cd.memory.conversationSummary) {
          console.log(`  Conversation Summary: ${cd.memory.conversationSummary.substring(0, 300)}${cd.memory.conversationSummary.length > 300 ? '...' : ''}`);
        }
        console.log(`  Important Context: ${JSON.stringify(cd.memory.importantContext, null, 2)}`);
      } else {
        console.log('\n\n🧠 CONVERSATION MEMORY: None');
      }
    });

    // Display Customer Insights (vendor-specific, shown once)
    const insights = conversationData.find(cd => cd.insights !== null)?.insights;
    if (insights) {
      console.log('\n\n' + '='.repeat(100));
      console.log('👤 CUSTOMER INSIGHTS (Vendor-Specific)');
      console.log('='.repeat(100));
      console.log(`  Customer Name: ${insights.customerName || 'N/A'}`);
      console.log(`  Alternative Phone: ${insights.alternativePhoneNumber || 'N/A'}`);
      console.log(`  Email: ${insights.email || 'N/A'}`);
      console.log(`  Preferred Language: ${insights.preferredLanguage || 'N/A'}`);
      if (insights.basicDetails) {
        console.log(`  Basic Details: ${insights.basicDetails.substring(0, 300)}${insights.basicDetails.length > 300 ? '...' : ''}`);
      }
      if (insights.purchaseHistory) {
        console.log(`  Purchase History: ${insights.purchaseHistory.substring(0, 300)}${insights.purchaseHistory.length > 300 ? '...' : ''}`);
      }
      if (insights.preferences) {
        console.log(`  Preferences: ${insights.preferences.substring(0, 300)}${insights.preferences.length > 300 ? '...' : ''}`);
      }
      if (insights.communicationStyle) {
        console.log(`  Communication Style: ${insights.communicationStyle.substring(0, 300)}${insights.communicationStyle.length > 300 ? '...' : ''}`);
      }
      if (insights.currentOrder) {
        console.log(`  Current Order: ${insights.currentOrder.substring(0, 300)}${insights.currentOrder.length > 300 ? '...' : ''}`);
      }
      if (insights.primaryDeliveryAddress) {
        console.log(`  Primary Delivery Address: ${insights.primaryDeliveryAddress.substring(0, 300)}${insights.primaryDeliveryAddress.length > 300 ? '...' : ''}`);
      }
      if (insights.deliveryInstructions) {
        console.log(`  Delivery Instructions: ${insights.deliveryInstructions.substring(0, 300)}${insights.deliveryInstructions.length > 300 ? '...' : ''}`);
      }
      if (insights.specialRequests) {
        console.log(`  Special Requests: ${insights.specialRequests.substring(0, 300)}${insights.specialRequests.length > 300 ? '...' : ''}`);
      }
      if (insights.dietaryRestrictions) {
        console.log(`  Dietary Restrictions: ${insights.dietaryRestrictions.substring(0, 300)}${insights.dietaryRestrictions.length > 300 ? '...' : ''}`);
      }
      if (insights.paymentPreferences) {
        console.log(`  Payment Preferences: ${insights.paymentPreferences.substring(0, 300)}${insights.paymentPreferences.length > 300 ? '...' : ''}`);
      }
      if (insights.whatsappLocation) {
        console.log(`  WhatsApp Location: ${JSON.stringify(insights.whatsappLocation, null, 2)}`);
      }
      if (insights.specialOccasions) {
        console.log(`  Special Occasions: ${JSON.stringify(insights.specialOccasions, null, 2)}`);
      }
      console.log(`  Last Updated: ${new Date(insights.lastUpdated).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    } else {
      console.log('\n\n' + '='.repeat(100));
      console.log('👤 CUSTOMER INSIGHTS: None');
      console.log('='.repeat(100));
    }

    // Comparison Summary
    console.log('\n\n' + '='.repeat(100));
    console.log('📊 DATA COMPARISON SUMMARY');
    console.log('='.repeat(100));
    
    const allOrders = conversationData.flatMap(cd => cd.orders);
    const allMemories = conversationData.filter(cd => cd.memory !== null).map(cd => cd.memory);

    console.log('\n✅ Orders Found:');
    if (allOrders.length > 0) {
      allOrders.forEach(order => {
        console.log(`  - ${order.orderNumber}: ${order.status} | ₹${(order.totalAmount / 100).toFixed(2)} | ${new Date(order.createdAt).toLocaleDateString('en-IN')}`);
      });
    } else {
      console.log('  - No orders found');
    }

    console.log('\n✅ Conversation Memory Found:');
    if (allMemories.length > 0) {
      allMemories.forEach((memory, idx) => {
        console.log(`  - Memory ${idx + 1}: Stage "${memory.conversationStage}" | Turn ${memory.turnNumber} | Updated ${new Date(memory.lastUpdated).toLocaleDateString('en-IN')}`);
        if (memory.lastOrderSummary) {
          console.log(`    Last Order Summary: ${memory.lastOrderSummary.substring(0, 100)}...`);
        }
      });
    } else {
      console.log('  - No conversation memory found');
    }

    console.log('\n✅ Customer Insights Found:');
    if (insights) {
      console.log(`  - Customer Name: ${insights.customerName || 'Not set'}`);
      console.log(`  - Preferred Language: ${insights.preferredLanguage || 'Not set'}`);
      console.log(`  - Has Delivery Address: ${insights.primaryDeliveryAddress ? 'Yes' : 'No'}`);
      console.log(`  - Has Preferences: ${insights.preferences ? 'Yes' : 'No'}`);
      console.log(`  - Last Updated: ${new Date(insights.lastUpdated).toLocaleDateString('en-IN')}`);
    } else {
      console.log('  - No customer insights found');
    }

    console.log('\n' + '='.repeat(100));
    console.log('\n✅ Report Complete!\n');

  } catch (error) {
    console.error('❌ Error fetching data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Get arguments from command line
const phoneNumber = process.argv[2];
const vendorName = process.argv[3] || 'i bell creations';

if (!phoneNumber) {
  console.error('Please provide a phone number as an argument');
  console.error('Usage: ts-node fetch-all-conversations-with-data.ts <phone-number> [vendor-name]');
  console.error('Example: ts-node fetch-all-conversations-with-data.ts 9790690170 "i bell creations"');
  process.exit(1);
}

fetchAllConversationsWithData(phoneNumber, vendorName)
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

