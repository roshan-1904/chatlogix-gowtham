/**
 * Convert PostgreSQL SQL export files to MySQL format
 *
 * This script converts PostgreSQL INSERT statements to MySQL-compatible format
 * Run with: npx tsx scripts/convert-postgres-to-mysql.ts
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
const backupDir = path.resolve(process.cwd(), 'database_backup');
const outputDir = path.resolve(process.cwd(), 'database_backup', 'mysql');
// Create output directory if it doesn't exist
if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
}
function convertPostgresToMySQL(content) {
    let converted = content;
    // Remove "public". schema prefix
    converted = converted.replace(/"public"\./g, '');
    // Remove double quotes around table names in INSERT INTO statements
    // But escape reserved keywords with backticks
    converted = converted.replace(/INSERT INTO "([^"]+)" \(/g, (match, tableName) => {
        // MySQL reserved keywords that need escaping
        const reservedKeywords = ['Order', 'order', 'Group', 'group', 'User', 'user'];
        if (reservedKeywords.includes(tableName)) {
            return `INSERT INTO \`${tableName}\` (`;
        }
        return `INSERT INTO ${tableName} (`;
    });
    // Remove double quotes around column names in the column list
    // This regex matches the column list: ("col1", "col2", "col3")
    converted = converted.replace(/\(("([^"]+)",?\s*)+\)/g, (match) => {
        // Remove all quotes from column names but keep commas and spaces
        return match.replace(/"/g, '');
    });
    // Convert boolean 'true'/'false' to 1/0 (MySQL uses 1/0 for BOOLEAN)
    // Match boolean values in VALUES clause, being careful not to match string values
    // Pattern: , 'true', or , 'false', or ('true', or ('false',
    converted = converted.replace(/, 'true'(?=,|\))/g, ', 1');
    converted = converted.replace(/, 'false'(?=,|\))/g, ', 0');
    converted = converted.replace(/\('true'(?=,|\))/g, '(1');
    converted = converted.replace(/\('false'(?=,|\))/g, '(0');
    return converted;
}
function processFile(filename) {
    // Skip _prisma_migrations - Prisma handles this automatically
    if (filename.includes('_prisma_migrations')) {
        console.log(`Skipping ${filename} (Prisma handles migrations)`);
        return;
    }
    const inputPath = path.join(backupDir, filename);
    const outputPath = path.join(outputDir, filename);
    console.log(`Converting ${filename}...`);
    try {
        const content = readFileSync(inputPath, 'utf-8');
        const converted = convertPostgresToMySQL(content);
        writeFileSync(outputPath, converted, 'utf-8');
        console.log(`  ✓ Converted ${filename}`);
    }
    catch (error) {
        console.error(`  ✗ Error converting ${filename}:`, error.message);
    }
}
// Get all SQL files
const files = readdirSync(backupDir).filter(file => file.endsWith('.sql'));
console.log('Converting PostgreSQL SQL files to MySQL format...\n');
// Process each file
files.forEach(processFile);
console.log('\n✅ Conversion complete!');
console.log(`Converted files are in: ${outputDir}`);
console.log('\nImport order (respects foreign key dependencies):');
console.log('1. Customer_rows.sql');
console.log('2. Vendor_rows.sql');
console.log('3. Conversation_rows.sql');
console.log('4. Message_rows.sql');
console.log('5. Order_rows.sql');
console.log('6. CreditUsage_rows.sql');
console.log('7. WalletTransaction_rows.sql');
console.log('8. WhatsAppNumber_rows.sql');
console.log('9. CustomerInsights_rows.sql');
console.log('10. Admin_rows.sql (if needed)');
console.log('\nImport command:');
console.log('mysql -h 65.1.191.185 -u apiuser -p chatlogix < database_backup/mysql/filename.sql');
