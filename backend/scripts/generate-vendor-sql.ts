/**
 * Generate SQL statements for vendor import
 * Run this script to get SQL statements that can be executed directly
 */

import { generateSQLFile } from './vendor-data.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

console.log('🚀 Generating vendor import SQL...');

try {
  const sqlContent = generateSQLFile();
  const outputPath = join(process.cwd(), 'vendor-import.sql');
  
  writeFileSync(outputPath, sqlContent);
  
  console.log(`✅ SQL file generated: ${outputPath}`);
  console.log('\n📋 To import vendors into your database:');
  console.log('1. Connect to your PostgreSQL database');
  console.log('2. Run the SQL commands from vendor-import.sql');
  console.log('3. Or use: psql "your-database-url" -f vendor-import.sql');
  
} catch (error) {
  console.error('❌ Error generating SQL:', error);
  process.exit(1);
}
