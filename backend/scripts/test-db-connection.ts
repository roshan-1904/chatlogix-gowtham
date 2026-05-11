/**
 * Database Connection Test Script
 * 
 * This script tests the database connection and provides diagnostic information
 * Run with: npx tsx scripts/test-db-connection.ts
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
} else if (existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
} else if (existsSync(backendEnvPath)) {
  config({ path: backendEnvPath });
} else {
  config();
}

const DATABASE_URL = process.env.DATABASE_URL;

console.log('\n🔍 Database Connection Diagnostics\n');
console.log('='.repeat(50));

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in environment variables');
  console.log('\nPlease set DATABASE_URL in your .env file');
  process.exit(1);
}

// Parse and display connection info (masked)
try {
  const url = new URL(DATABASE_URL);
  const params = url.searchParams;
  
  console.log('\n📋 Connection Details:');
  console.log(`   Host: ${url.hostname}`);
  console.log(`   Port: ${url.port || '5432'}`);
  console.log(`   Database: ${url.pathname?.replace(/^\//, '') || 'unknown'}`);
  console.log(`   User: ${url.username || 'not set'}`);
} catch (err) {
  console.error('❌ Invalid DATABASE_URL format');
  console.error(err);
  process.exit(1);
}

console.log('\n🔌 Testing Connection...\n');

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

async function testConnection() {
  try {
    // Test basic connectivity
    console.log('1. Testing basic connectivity...');
    await prisma.$queryRaw`SELECT 1 AS ok`;
    console.log('   ✅ Connection successful!\n');

    // Test database version
    console.log('2. Testing database version...');
    const version = await prisma.$queryRaw<Array<{ version: string }>>`
      SELECT version() as version
    `;
    console.log(`   ✅ Database version: ${version[0]?.version?.substring(0, 50)}...\n`);

    // Test if Conversation table exists
    console.log('3. Testing table access...');
    const tableCheck = await prisma.$queryRaw<Array<{ exists: bigint }>>`
      SELECT COUNT(*) as exists
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name = 'Conversation'
    `;
    console.log(`   ✅ Conversation table exists: ${tableCheck[0]?.exists === 1n}\n`);

    // Test if aiPaused column exists
    console.log('4. Testing aiPaused column...');
    const columnCheck = await prisma.$queryRaw<Array<{ exists: bigint }>>`
      SELECT COUNT(*) as exists
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'Conversation'
      AND column_name = 'aiPaused'
    `;
    console.log(`   ${columnCheck[0]?.exists === 1n ? '✅' : '⚠️'} aiPaused column exists: ${columnCheck[0]?.exists === 1n}\n`);

    if (columnCheck[0]?.exists === 0n) {
      console.log('   💡 Run the migration: ALTER TABLE "Conversation" ADD COLUMN "aiPaused" BOOLEAN NOT NULL DEFAULT false;\n');
    }

    console.log('✅ All connection tests passed!\n');
    
  } catch (error: any) {
    console.error('\n❌ Connection test failed!\n');
    console.error('Error Details:');
    console.error(`   Type: ${error?.name || 'Unknown'}`);
    console.error(`   Message: ${error?.message || 'Unknown error'}`);
    
    if (error?.code) {
      console.error(`   Code: ${error.code}`);
    }

    console.log('\n💡 Troubleshooting Tips:');
    console.log('   1. Verify your DATABASE_URL is correct');
    console.log('   2. Check if your PostgreSQL server is running');
    console.log('   3. Verify database credentials (username, password)');
    console.log('   4. Check firewall/network settings');
    console.log('   5. Ensure the database exists');
    console.log('   6. Check PostgreSQL server logs for connection errors');
    console.log('');
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();

