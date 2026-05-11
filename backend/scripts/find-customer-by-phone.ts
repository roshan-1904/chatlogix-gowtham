import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findCustomerByPhone(phone: string) {
  console.log(`Searching for phone: ${phone}`);

  try {
    // Try exact match first
    let customer = await prisma.customer.findUnique({
      where: { phone },
      include: {
        conversations: {
          include: {
            messages: true,
            vendor: {
              select: { businessName: true, phone: true }
            }
          }
        }
      }
    });

    if (customer) {
      console.log(`\n✅ Found customer with exact match:`);
      console.log(`Customer ID: ${customer.id}`);
      console.log(`Phone: ${customer.phone}`);
      console.log(`Conversations: ${customer.conversations.length}`);
      
      let totalMessages = 0;
      customer.conversations.forEach(conv => {
        totalMessages += conv.messages.length;
      });
      console.log(`Total Messages: ${totalMessages}`);
      
      customer.conversations.forEach((conv, idx) => {
        console.log(`\nConversation ${idx + 1}:`);
        console.log(`  ID: ${conv.id}`);
        console.log(`  Vendor: ${conv.vendor.businessName} (${conv.vendor.phone})`);
        console.log(`  Status: ${conv.status}`);
        console.log(`  Messages: ${conv.messages.length}`);
      });
      return customer;
    }

    // Try searching with country code variations
    const variations = [
      `91${phone}`,
      `+91${phone}`,
      `919${phone.substring(1)}`,
      phone.substring(phone.length - 10) // Last 10 digits
    ];

    console.log('\nNo exact match found. Searching variations...\n');

    for (const variant of variations) {
      const result = await prisma.customer.findFirst({
        where: {
          phone: {
            contains: variant,
            mode: 'insensitive'
          }
        }
      });

      if (result) {
        console.log(`✅ Found customer with variant "${variant}":`);
        console.log(`Customer ID: ${result.id}`);
        console.log(`Phone: ${result.phone}\n`);
        return result;
      }
    }

    // List all customers to help identify the issue
    console.log('\nListing all customers in database:\n');
    const allCustomers = await prisma.customer.findMany({
      take: 20,
      orderBy: { lastInteraction: 'desc' }
    });

    if (allCustomers.length === 0) {
      console.log('No customers found in database.');
    } else {
      console.log('Recent customers:');
      allCustomers.forEach(customer => {
        console.log(`  Phone: ${customer.phone} (ID: ${customer.id})`);
      });
    }

    console.log('\n⚠️ Customer not found with the provided phone number.');
    
  } catch (error) {
    console.error('Error searching for customer:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('Please provide a phone number as an argument');
  console.error('Usage: ts-node find-customer-by-phone.ts <phone-number>');
  process.exit(1);
}

findCustomerByPhone(phoneNumber)
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
