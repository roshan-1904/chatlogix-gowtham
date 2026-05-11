/**
 * Fix Data Encoding Issues in MySQL
 *
 * This script checks and fixes encoding issues in text fields
 * Run with: npx tsx scripts/fix-data-encoding.ts
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
async function checkDataEncoding() {
    console.log('🔍 Checking data encoding issues...\n');
    try {
        // Check a sample message for encoding issues
        console.log('1. Checking sample messages for encoding issues...');
        const messages = await prisma.message.findMany({
            take: 5,
            orderBy: { timestamp: 'desc' }
        });
        let foundIssues = false;
        for (const msg of messages) {
            // Check for common encoding issues
            const hasGarbledChars = /[^\x00-\x7F]/.test(msg.content) &&
                /[^\u0000-\uFFFF]/.test(msg.content.replace(/[\u0020-\u007E\u00A0-\uFFFF]/g, ''));
            if (hasGarbledChars || msg.content.includes('fyè') || msg.content.includes('Õé')) {
                console.log(`   ⚠️  Found potential encoding issue in message ${msg.id.substring(0, 10)}...`);
                console.log(`   Content preview: ${msg.content.substring(0, 100)}...`);
                foundIssues = true;
            }
        }
        if (!foundIssues) {
            console.log('   ✅ No obvious encoding issues found in sample messages\n');
        }
        else {
            console.log('   ⚠️  Encoding issues detected\n');
        }
        // Check vendor data
        console.log('2. Checking vendor data...');
        const vendors = await prisma.vendor.findMany({
            take: 2
        });
        for (const vendor of vendors) {
            const fields = [
                vendor.aiGreeting,
                vendor.aiClosing,
                vendor.aiSystemPrompt
            ].filter(Boolean);
            for (const field of fields) {
                if (field && (field.includes('fyè') || field.includes('Õé') || /[^\x00-\x7F]/.test(field))) {
                    console.log(`   ⚠️  Found potential encoding issue in vendor ${vendor.id}`);
                    foundIssues = true;
                }
            }
        }
        if (!foundIssues) {
            console.log('   ✅ No obvious encoding issues found\n');
        }
        console.log('\n💡 Solution:');
        console.log('1. Update DATABASE_URL to explicitly set charset:');
        console.log('   DATABASE_URL=mysql://apiuser:ChatLogix!@65.1.191.185:3306/chatlogix?charset=utf8mb4');
        console.log('\n2. If data is already corrupted, you may need to:');
        console.log('   - Re-import the data with proper encoding');
        console.log('   - Or update the connection and re-save the data');
    }
    catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
checkDataEncoding()
    .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
