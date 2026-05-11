import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// Define import order based on foreign key dependencies
const IMPORT_ORDER = [
  'Admin_rows.sql',
  'Vendor_rows.sql',
  'Customer_rows.sql',
  'WhatsAppNumber_rows.sql',
  'Conversation_rows.sql',
  'Message_rows.sql',
  'CreditUsage_rows.sql',
  'WalletTransaction_rows.sql',
  'Order_rows.sql',
  'CustomerInsights_rows.sql',
  '_prisma_migrations_rows.sql', // Optional, but included for completeness
];

async function importDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in .env file');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    console.log('🔌 Connecting to database...');
    // Test connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Connected to database');

    // Get the backup directory path
    const backupDir = join(__dirname, '..', 'database_backup');

    // Note: We're importing in the correct order to respect foreign key constraints
    // If you have permission issues, the import order should handle dependencies correctly
    console.log('📋 Importing files in dependency order to respect foreign key constraints...');

    let totalImported = 0;
    let totalErrors = 0;

    // Import files in the correct order
    for (const filename of IMPORT_ORDER) {
      const filePath = join(backupDir, filename);
      
      try {
        console.log(`\n📄 Importing ${filename}...`);
        
        // Read the SQL file
        let sqlContent = readFileSync(filePath, 'utf-8');
        
        if (!sqlContent.trim()) {
          console.log(`⚠️  ${filename} is empty, skipping...`);
          continue;
        }

        // Fix JSON values in Order_rows.sql - they're double-escaped
        if (filename === 'Order_rows.sql') {
          // Replace double-escaped JSON strings with proper JSON
          // Pattern: '"[{\\"key\\":\\"value\\"}]"' -> '[{"key":"value"}]'
          // Use a more permissive regex to match the entire pattern
          sqlContent = sqlContent.replace(
            /'("\[.*?\]")'/gs,
            (match, jsonStringWithQuotes) => {
              try {
                // jsonStringWithQuotes is like: "[{\"key\":\"value\"}]"
                // Remove the outer double quotes
                const jsonString = jsonStringWithQuotes.slice(1, -1);
                // Unescape: \\" -> ", \\\\ -> \
                const unescaped = jsonString.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                
                // Parse to validate JSON, then stringify to ensure proper format
                const parsed = JSON.parse(unescaped);
                // Return as a properly escaped JSON string for SQL (escape single quotes)
                const properJson = JSON.stringify(parsed);
                const escapedForSql = properJson.replace(/'/g, "''");
                return `'${escapedForSql}'`;
              } catch (e) {
                // If parsing fails, return original
                console.warn(`   Warning: Could not parse JSON value, using original`);
                return match;
              }
            }
          );
        }

        // Execute the SQL using Prisma's raw query
        // Note: Prisma's $executeRawUnsafe returns the number of affected rows for INSERT/UPDATE/DELETE
        const result = await prisma.$executeRawUnsafe(sqlContent);
        
        // For INSERT statements, result is the number of rows affected
        const rowCount = typeof result === 'number' ? result : 0;
        
        // If rowCount is 0, try to estimate from SQL content (count VALUES clauses)
        let estimatedRows = rowCount;
        if (rowCount === 0 && sqlContent.includes('VALUES')) {
          // Count the number of value tuples in the INSERT statement
          // Match pattern: VALUES (value1, value2, ...), (value3, value4, ...)
          const valueTuples = sqlContent.match(/\([^)]+\)/g);
          estimatedRows = valueTuples ? valueTuples.length : 0;
        }
        
        totalImported += estimatedRows > 0 ? estimatedRows : 1; // At least count as 1 if we can't determine
        
        if (estimatedRows > 0) {
          console.log(`✅ Successfully imported ${filename} (${estimatedRows} rows)`);
        } else {
          console.log(`✅ Successfully imported ${filename}`);
        }
      } catch (error: any) {
        totalErrors++;
        console.error(`❌ Error importing ${filename}:`, error.message);
        
        // Check if it's a duplicate key error (which is okay if we're re-importing)
        if (error.code === 'P2002' || error.code === '23505') {
          console.log(`⚠️  Duplicate key error in ${filename} - data may already exist`);
          // Don't count duplicate key errors as failures
          totalErrors--;
        } else if (error.code === 'P2003' || error.code === '23503') {
          console.error(`⚠️  Foreign key constraint error in ${filename}`);
          console.error(`   This usually means a referenced record doesn't exist yet.`);
          console.error(`   Check that parent tables were imported successfully.`);
        } else if (error.code === 'P2010' && error.meta?.code === '42P01') {
          // Table doesn't exist - this is okay for _prisma_migrations
          if (filename === '_prisma_migrations_rows.sql') {
            console.log(`⚠️  ${filename} - _prisma_migrations table doesn't exist, skipping...`);
            console.log(`   This is normal if migrations haven't been run yet.`);
            // Don't count this as an error
            totalErrors--;
          } else {
            console.error(`⚠️  Table doesn't exist for ${filename}`);
          }
        } else if (error.code === 'P2010' && error.meta?.code === '22P02') {
          // Invalid JSON syntax
          console.error(`⚠️  Invalid JSON syntax in ${filename}`);
          console.error(`   This might be due to double-escaped JSON values.`);
          console.error(`   Error: ${error.meta?.message}`);
        } else {
          // For other errors, log but continue
          console.error(`   Error details:`, error.code, error.message);
          if (error.meta) {
            console.error(`   Database error code: ${error.meta.code}`);
            console.error(`   Database message: ${error.meta.message}`);
          }
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Import Summary:');
    console.log(`   ✅ Total rows imported: ${totalImported}`);
    console.log(`   ❌ Total errors: ${totalErrors}`);
    console.log('='.repeat(50));

    if (totalErrors > 0) {
      console.log('\n⚠️  Some files had errors. Please review the output above.');
      console.log('   Note: Duplicate key errors are normal if data already exists.');
    } else {
      console.log('\n🎉 All files imported successfully!');
    }

  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the import
importDatabase().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

