import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const prisma = new PrismaClient();

type ExportSummary = {
  requestedPhone: string;
  phoneVariantsTried: string[];
  exportedAt: string;
  customerCount: number;
  conversationCount: number;
  orderCount: number;
};

function buildPhoneVariants(inputPhone: string): string[] {
  const normalized = inputPhone.replaceAll(/\D/g, '');
  return Array.from(
    new Set(
      [inputPhone, normalized, `+91${normalized}`, `91${normalized}`, normalized.slice(-10)].filter(
        Boolean
      )
    )
  );
}

async function exportCustomerData(phone: string, outputPathArg?: string) {
  const variants = buildPhoneVariants(phone);

  const customers = await prisma.customer.findMany({
    where: {
      OR: variants.map((variant) => ({
        phone: { contains: variant }
      }))
    },
    include: {
      conversations: {
        include: {
          vendor: {
            select: {
              id: true,
              businessName: true,
              phone: true
            }
          },
          orders: {
            orderBy: { createdAt: 'desc' }
          },
          messages: {
            orderBy: { timestamp: 'asc' }
          }
        },
        orderBy: { updatedAt: 'desc' }
      }
    },
    orderBy: { lastInteraction: 'desc' }
  });

  const summary: ExportSummary = {
    requestedPhone: phone,
    phoneVariantsTried: variants,
    exportedAt: new Date().toISOString(),
    customerCount: customers.length,
    conversationCount: customers.reduce((sum, customer) => sum + customer.conversations.length, 0),
    orderCount: customers.reduce(
      (sum, customer) =>
        sum + customer.conversations.reduce((convSum, conversation) => convSum + conversation.orders.length, 0),
      0
    )
  };

  const payload = {
    ...summary,
    customers
  };

  const outputPath = resolve(
    outputPathArg || `./exports/customer-${phone}-conversations-orders.json`
  );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`Export completed: ${outputPath}`);
  console.log(`Customers: ${summary.customerCount}`);
  console.log(`Conversations: ${summary.conversationCount}`);
  console.log(`Orders: ${summary.orderCount}`);
}

const phoneArg = process.argv[2];
const outputPathArg = process.argv[3];

if (!phoneArg) {
  console.error('Usage: tsx scripts/export-customer-conversations-orders.ts <phone> [output-path]');
  process.exit(1);
}

try {
  await exportCustomerData(phoneArg, outputPathArg);
} catch (error) {
  console.error('Export failed:', error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
