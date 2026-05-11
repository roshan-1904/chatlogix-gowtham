/**
 * Script to clear all database data for a specific customer phone number and vendor
 * 
 * Usage: tsx scripts/clearCustomerData.ts <phoneNumber> <vendorBusinessName>
 * Example: tsx scripts/clearCustomerData.ts 9790690170 "ibell creations"
 */

import { prisma } from '../src/db/prisma.js';
import { logger } from '../src/logger.js';
import * as readline from 'readline';

const phoneNumber = process.argv[2];
const vendorBusinessName = process.argv[3];

if (!phoneNumber || !vendorBusinessName) {
  console.error('Usage: tsx scripts/clearCustomerData.ts <phoneNumber> <vendorBusinessName>');
  console.error('Example: tsx scripts/clearCustomerData.ts 9790690170 "ibell creations"');
  process.exit(1);
}

async function clearCustomerData() {
  try {
    console.log('='.repeat(60));
    console.log('CLEARING CUSTOMER DATA');
    console.log('='.repeat(60));
    console.log(`\n🔍 Looking up customer with phone: ${phoneNumber}`);
    console.log(`🔍 Looking up vendor: ${vendorBusinessName}\n`);

    // Normalize phone number (remove spaces, dashes, plus signs for matching)
    const normalizedPhone = phoneNumber.replace(/[\s\-+]/g, '');
    console.log(`📞 Normalized phone: ${normalizedPhone}`);

    // Find customer by phone using LIKE query (handles variations)
    // Try exact match first
    let customer = await prisma.customer.findFirst({
      where: { 
        phone: {
          contains: normalizedPhone,
          mode: 'insensitive'
        }
      },
      include: {
        conversations: {
          where: {},
          include: {
            vendor: true
          }
        }
      }
    });

    // If not found, try with different formats
    if (!customer) {
      // Try with country code variations
      const variations = [
        normalizedPhone,
        normalizedPhone.replace(/^91/, ''), // Remove 91 prefix
        `91${normalizedPhone}`, // Add 91 prefix
        `+91${normalizedPhone}`, // Add +91 prefix
        normalizedPhone.replace(/^\+91/, ''), // Remove +91 prefix
      ];

      for (const variant of variations) {
        if (variant && variant.length >= 10) {
          customer = await prisma.customer.findFirst({
            where: { 
              phone: {
                contains: variant,
                mode: 'insensitive'
              }
            },
            include: {
              conversations: {
                where: {},
                include: {
                  vendor: true
                }
              }
            }
          });
          if (customer) {
            console.log(`✅ Found customer with phone variant: ${variant}`);
            break;
          }
        }
      }
    }

    if (!customer) {
      console.log(`❌ Customer with phone ${phoneNumber} not found.`);
      console.log(`💡 Tried variations: ${normalizedPhone}, ${normalizedPhone.replace(/^91/, '')}, 91${normalizedPhone}, +91${normalizedPhone}`);
      
      // Show similar phone numbers for debugging
      console.log(`\n🔍 Searching for similar phone numbers...`);
      const lastDigits = normalizedPhone.slice(-4); // Last 4 digits
      const similarCustomers = await prisma.customer.findMany({
        where: {
          phone: {
            contains: lastDigits,
            mode: 'insensitive'
          }
        },
        take: 10,
        select: {
          id: true,
          phone: true
        }
      });
      
      if (similarCustomers.length > 0) {
        console.log(`\n📋 Found ${similarCustomers.length} customer(s) with similar phone numbers (last 4 digits: ${lastDigits}):`);
        similarCustomers.forEach(c => {
          console.log(`   - Phone: ${c.phone} (ID: ${c.id})`);
        });
        console.log(`\n💡 Tip: Use one of these phone numbers if it matches.`);
      } else {
        console.log(`\n💡 No similar phone numbers found.`);
      }
      
      return;
    }

    console.log(`✅ Found customer: ${customer.id}`);

    // Find vendor by business name (case-insensitive)
    const vendor = await prisma.vendor.findFirst({
      where: {
        businessName: {
          equals: vendorBusinessName,
          mode: 'insensitive'
        }
      }
    });

    if (!vendor) {
      console.log(`❌ Vendor "${vendorBusinessName}" not found.`);
      return;
    }

    console.log(`✅ Found vendor: ${vendor.id} (${vendor.businessName})`);

    // Find conversations between this customer and vendor
    const conversations = await prisma.conversation.findMany({
      where: {
        customerId: customer.id,
        vendorId: vendor.id
      },
      select: {
        id: true
      }
    });

    if (conversations.length === 0) {
      console.log(`\n⚠️  No conversations found between customer ${phoneNumber} and vendor "${vendorBusinessName}".`);
      return;
    }

    console.log(`\n📊 Found ${conversations.length} conversation(s) to delete.`);
    console.log(`\n⚠️  WARNING: This will delete:`);
    console.log(`   - ${conversations.length} conversation(s)`);
    
    // Count related records
    const conversationIds = conversations.map(c => c.id);
    
    const messagesCount = await prisma.message.count({
      where: { conversationId: { in: conversationIds } }
    });
    
    const ordersCount = await prisma.order.count({
      where: { conversationId: { in: conversationIds } }
    });
    
    const notificationHistoryCount = await prisma.notificationHistory.count({
      where: { 
        customerId: customer.id,
        vendorId: vendor.id
      }
    });
    
    const customerInsightsCount = await prisma.customerInsights.count({
      where: {
        customerId: customer.id,
        vendorId: vendor.id
      }
    });
    
    const conversationMemoryCount = await prisma.conversationMemory.count({
      where: { conversationId: { in: conversationIds } }
    });
    
    const correctionHistoryCount = await prisma.correctionHistory.count({
      where: { conversationId: { in: conversationIds } }
    });
    
    const qualityMetricsCount = await prisma.qualityMetrics.count({
      where: { conversationId: { in: conversationIds } }
    });
    
    const stageExecutionLogsCount = await prisma.stageExecutionLog.count({
      where: { conversationId: { in: conversationIds } }
    });
    
    const creditUsagesCount = await prisma.creditUsage.count({
      where: { conversationId: { in: conversationIds } }
    });

    console.log(`   - ${messagesCount} message(s)`);
    console.log(`   - ${ordersCount} order(s)`);
    console.log(`   - ${notificationHistoryCount} notification history record(s)`);
    console.log(`   - ${customerInsightsCount} customer insight(s)`);
    console.log(`   - ${conversationMemoryCount} conversation memory record(s)`);
    console.log(`   - ${correctionHistoryCount} correction history record(s)`);
    console.log(`   - ${qualityMetricsCount} quality metrics record(s)`);
    console.log(`   - ${stageExecutionLogsCount} stage execution log record(s)`);
    console.log(`   - ${creditUsagesCount} credit usage record(s)`);
    
    // Check for --yes flag to skip confirmation
    const skipConfirmation = process.argv.includes('--yes') || process.argv.includes('-y');
    
    if (!skipConfirmation) {
      console.log(`\n🚨 Are you sure you want to proceed?`);
      console.log(`   Run with --yes flag to skip confirmation: tsx scripts/clearCustomerData.ts ${phoneNumber} "${vendorBusinessName}" --yes`);
      
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question('\nType "yes" to confirm deletion: ', (ans: string) => {
          rl.close();
          resolve(ans.toLowerCase().trim());
        });
      });

      if (answer !== 'yes') {
        console.log('\n❌ Deletion cancelled.');
        return;
      }
    } else {
      console.log(`\n⚠️  Skipping confirmation (--yes flag provided)...`);
    }

    console.log('\n🗑️  Starting deletion...\n');

    // Delete in order to respect foreign key constraints
    
    // 1. Delete NotificationHistory (references Order, Customer, Vendor)
    console.log('1. Deleting notification history...');
    const deletedNotifications = await prisma.notificationHistory.deleteMany({
      where: {
        customerId: customer.id,
        vendorId: vendor.id
      }
    });
    console.log(`   ✅ Deleted ${deletedNotifications.count} notification history record(s)`);

    // 2. Delete Multi-Stage AI tables (they reference Conversation, will cascade)
    // But we'll delete them explicitly for clarity
    console.log('2. Deleting stage execution logs...');
    const deletedStageLogs = await prisma.stageExecutionLog.deleteMany({
      where: { conversationId: { in: conversationIds } }
    });
    console.log(`   ✅ Deleted ${deletedStageLogs.count} stage execution log(s)`);

    console.log('3. Deleting quality metrics...');
    const deletedQualityMetrics = await prisma.qualityMetrics.deleteMany({
      where: { conversationId: { in: conversationIds } }
    });
    console.log(`   ✅ Deleted ${deletedQualityMetrics.count} quality metrics record(s)`);

    console.log('4. Deleting correction history...');
    const deletedCorrections = await prisma.correctionHistory.deleteMany({
      where: { conversationId: { in: conversationIds } }
    });
    console.log(`   ✅ Deleted ${deletedCorrections.count} correction history record(s)`);

    console.log('5. Deleting conversation memory...');
    const deletedMemory = await prisma.conversationMemory.deleteMany({
      where: { conversationId: { in: conversationIds } }
    });
    console.log(`   ✅ Deleted ${deletedMemory.count} conversation memory record(s)`);

    // 3. Delete CustomerInsights
    console.log('6. Deleting customer insights...');
    const deletedInsights = await prisma.customerInsights.deleteMany({
      where: {
        customerId: customer.id,
        vendorId: vendor.id
      }
    });
    console.log(`   ✅ Deleted ${deletedInsights.count} customer insight(s)`);

    // 4. Delete Conversations (this will cascade delete Messages, Orders, CreditUsage)
    console.log('7. Deleting conversations (will cascade delete messages, orders, credit usage)...');
    const deletedConversations = await prisma.conversation.deleteMany({
      where: {
        customerId: customer.id,
        vendorId: vendor.id
      }
    });
    console.log(`   ✅ Deleted ${deletedConversations.count} conversation(s)`);

    // Verify deletions
    const remainingConversations = await prisma.conversation.count({
      where: {
        customerId: customer.id,
        vendorId: vendor.id
      }
    });

    const remainingMessages = await prisma.message.count({
      where: { conversationId: { in: conversationIds } }
    });

    const remainingOrders = await prisma.order.count({
      where: { conversationId: { in: conversationIds } }
    });

    console.log('\n✅ Deletion complete!');
    console.log(`\n📊 Verification:`);
    console.log(`   - Remaining conversations: ${remainingConversations}`);
    console.log(`   - Remaining messages: ${remainingMessages}`);
    console.log(`   - Remaining orders: ${remainingOrders}`);

    // Check if customer has other conversations
    const otherConversations = await prisma.conversation.count({
      where: { customerId: customer.id }
    });

    if (otherConversations === 0) {
      console.log(`\n💡 Note: Customer has no other conversations.`);
      console.log(`   Customer record still exists but has no related data.`);
    } else {
      console.log(`\n💡 Note: Customer has ${otherConversations} other conversation(s) with other vendors.`);
      console.log(`   Customer record preserved.`);
    }

    console.log('\n✨ Done!\n');

  } catch (error) {
    console.error('\n❌ Error during deletion:');
    console.error(error);
    logger.error({ err: error, phoneNumber, vendorBusinessName }, 'Failed to clear customer data');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearCustomerData();
