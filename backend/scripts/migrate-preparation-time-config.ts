/**
 * Migration script: Convert aiPreparationTimeMinutes to orderPreparationConfig
 * Run this once after schema migration
 * 
 * Usage: npm run ts-node scripts/migrate-preparation-time-config.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migratePreparationTimeConfig() {
  console.log('Starting migration of aiPreparationTimeMinutes to orderPreparationConfig...');
  
  const vendors = await prisma.vendor.findMany({
    where: {
      aiPreparationTimeMinutes: { not: null }
    },
    select: {
      id: true,
      businessName: true,
      aiPreparationTimeMinutes: true,
      orderPreparationConfig: true
    }
  });

  console.log(`Found ${vendors.length} vendors with aiPreparationTimeMinutes`);

  let migrated = 0;
  let skipped = 0;

  for (const vendor of vendors) {
    // Skip if already migrated
    if (vendor.orderPreparationConfig) {
      console.log(`Skipping vendor ${vendor.id} (${vendor.businessName}) - already has orderPreparationConfig`);
      skipped++;
      continue;
    }

    const minutes = vendor.aiPreparationTimeMinutes;
    
    let config: any;
    if (minutes === 0 || minutes === null) {
      config = { type: 'after_order' };
    } else {
      config = {
        type: 'fixed_minutes',
        fixedMinutes: minutes
      };
    }

    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { orderPreparationConfig: config }
    });

    console.log(`Migrated vendor ${vendor.id} (${vendor.businessName}): ${JSON.stringify(config)}`);
    migrated++;
  }

  console.log(`\nMigration completed!`);
  console.log(`- Migrated: ${migrated}`);
  console.log(`- Skipped: ${skipped}`);
  console.log(`- Total: ${vendors.length}`);
}

migratePreparationTimeConfig()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

