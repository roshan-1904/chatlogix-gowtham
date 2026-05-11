/**
 * Fix MySQL Character Set and Collation
 *
 * This script ensures all tables and the database use utf8mb4 character set
 * for proper Unicode and emoji support.
 *
 * Run with: npx tsx scripts/fix-mysql-charset.ts
 */
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
// Load environment variables
const localEnvPath = path.resolve(process.cwd(), '.env');
const rootEnvPath = path.resolve(process.cwd(), '..', '.env');
const backendEnvPath = path.resolve(process.cwd(), 'backend', '.env');
if (existsSync(localEnvPath)) {
    config({ path: localEnvPath });
}
else if (existsSync(rootEnvPath)) {
    config({ path: rootEnvPath });
}
else if (existsSync(backendEnvPath)) {
    config({ path: backendEnvPath });
}
else {
    config();
}
const prisma = new PrismaClient();
async function fixCharacterSet() {
    console.log('🔧 Fixing MySQL Character Set and Collation...\n');
    try {
        // 1. Check current database character set
        console.log('1. Checking database character set...');
        const dbCharset = await prisma.$queryRaw `
      SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
      FROM information_schema.SCHEMATA
      WHERE SCHEMA_NAME = DATABASE()
    `;
        console.log(`   Current: ${dbCharset[0]?.DEFAULT_CHARACTER_SET_NAME || 'unknown'} / ${dbCharset[0]?.DEFAULT_COLLATION_NAME || 'unknown'}`);
        if (dbCharset[0]?.DEFAULT_CHARACTER_SET_NAME !== 'utf8mb4') {
            console.log('   ⚠️  Database is not using utf8mb4');
            console.log('   💡 Run this SQL to fix:');
            console.log('   ALTER DATABASE chatlogix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
        }
        else {
            console.log('   ✅ Database is using utf8mb4\n');
        }
        // 2. Get all tables
        console.log('2. Checking table character sets...');
        const tables = await prisma.$queryRaw `
      SELECT TABLE_NAME, TABLE_COLLATION
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
    `;
        const tablesToFix = [];
        for (const table of tables) {
            if (!table.TABLE_COLLATION?.includes('utf8mb4')) {
                tablesToFix.push(table.TABLE_NAME);
                console.log(`   ⚠️  ${table.TABLE_NAME}: ${table.TABLE_COLLATION || 'unknown'}`);
            }
        }
        if (tablesToFix.length === 0) {
            console.log('   ✅ All tables are using utf8mb4\n');
        }
        else {
            console.log(`\n   Found ${tablesToFix.length} tables that need fixing\n`);
        }
        // 3. Generate SQL to fix tables
        if (tablesToFix.length > 0) {
            console.log('3. Generating SQL to fix tables...\n');
            console.log('Run these SQL commands in your MySQL client:\n');
            console.log('-- Fix database character set');
            console.log('ALTER DATABASE chatlogix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n');
            for (const tableName of tablesToFix) {
                console.log(`-- Fix ${tableName} table`);
                console.log(`ALTER TABLE \`${tableName}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
            }
            console.log('');
        }
        // 4. Check connection character set
        console.log('4. Checking connection character set...');
        const connectionCharset = await prisma.$queryRaw `
      SHOW VARIABLES LIKE 'character_set%'
    `;
        const clientCharset = connectionCharset.find(v => v.Variable_name === 'character_set_client')?.Value;
        const connectionCharsetValue = connectionCharset.find(v => v.Variable_name === 'character_set_connection')?.Value;
        console.log(`   Client: ${clientCharset || 'unknown'}`);
        console.log(`   Connection: ${connectionCharsetValue || 'unknown'}`);
        if (clientCharset !== 'utf8mb4' || connectionCharsetValue !== 'utf8mb4') {
            console.log('   ⚠️  Connection is not using utf8mb4');
            console.log('   💡 Update DATABASE_URL to include: ?charset=utf8mb4');
        }
        else {
            console.log('   ✅ Connection is using utf8mb4\n');
        }
        console.log('\n✅ Character set check complete!');
        console.log('\n📝 Next Steps:');
        console.log('1. Update DATABASE_URL in .env to include charset:');
        console.log('   DATABASE_URL=mysql://apiuser:ChatLogix!@65.1.191.185:3306/chatlogix?charset=utf8mb4');
        console.log('2. Run the SQL commands shown above to fix database and tables');
        console.log('3. Restart your application');
    }
    catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
fixCharacterSet()
    .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
