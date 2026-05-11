/**
 * Intent Classification Test Script
 * 
 * Tests intent classification with common customer messages from JSON file
 * Validates accuracy and logs results to file
 * 
 * Features:
 * - Tests all intent types with multilingual messages
 * - Proper order context handling for order_update scenarios
 * - Comprehensive validation and error handling
 * - Performance tracking and analysis
 * - Language-specific statistics
 */

import { classifyIntent } from '../src/services/intentClassificationService.js';
import { normalizeMessage } from '../src/services/messageNormalizationService.js';
import { prisma } from '../src/db/prisma.js';

import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_VENDOR_ID = process.env.TEST_VENDOR_ID || 'vendor_ibell_001';
const TEST_MESSAGES_FILE = join(__dirname, 'test-messages', 'intent-classification-test-cases.json');
const OUTPUT_DIR = join(process.cwd(), 'test-results');
const LOG_FILE = join(OUTPUT_DIR, `intent-classification-test-${Date.now()}.log`);
const JSON_RESULTS_FILE = join(OUTPUT_DIR, `intent-classification-results-${Date.now()}.json`);

// Test order context (for order_update tests)
let testConversationId: string | null = null;
let testCustomerId: string | null = null;
let testOrderId: string | null = null;

interface TestCase {
  message: string;
  expectedPrimaryIntent: string;
  expectedSecondaryIntents?: string[];
  description: string;
  context?: {
    hasExistingOrder?: boolean;
    conversationStage?: string;
  };
}

interface TestMessages {
  testCases: TestCase[];
}

interface TestResult {
  testCase: TestCase;
  actual: {
    primaryIntent: string;
    secondaryIntents: string[];
    confidence: number;
    reasoning: string;
  };
  passed: boolean;
  issues: string[];
  performance: {
    timeMs: number;
  };
  language?: string;
}

interface TestSummary {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  passRate: string;
  averageTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  results: TestResult[];
  accuracyByIntent: Record<string, { total: number; passed: number; passRate: string }>;
  accuracyByLanguage?: Record<string, { total: number; passed: number; passRate: string }>;
}

/**
 * Setup test order context for order_update tests
 */
async function setupTestOrderContext(): Promise<void> {
  try {
    console.log('Setting up test order context...');
    
    // Find or create test customer
    console.log('Finding or creating test customer...');
    let customer = await prisma.customer.findFirst({
      where: {
        phone: '+919999999999' // Test phone number
      }
    });

    if (!customer) {
      console.log('Creating test customer...');
      customer = await prisma.customer.create({
        data: {
          phone: '+919999999999'
        }
      });
    }
    testCustomerId = customer.id;
    console.log(`Test customer ID: ${testCustomerId}`);

    // Find or create test conversation
    console.log('Finding or creating test conversation...');
    let conversation = await prisma.conversation.findFirst({
      where: {
        vendorId: TEST_VENDOR_ID,
        customerId: customer.id
      }
    });

    if (!conversation) {
      console.log('Creating test conversation...');
      conversation = await prisma.conversation.create({
        data: {
          vendorId: TEST_VENDOR_ID,
          customerId: customer.id
        }
      });
    }
    testConversationId = conversation.id;
    console.log(`Test conversation ID: ${testConversationId}`);

    // Create test pending order if it doesn't exist
    console.log('Finding or creating test order...');
    let order = await prisma.order.findFirst({
      where: {
        conversationId: conversation.id,
        vendorId: TEST_VENDOR_ID,
        status: 'pending'
      }
    });

    if (!order) {
      console.log('Creating test order...');
      order = await prisma.order.create({
        data: {
          vendorId: TEST_VENDOR_ID,
          customerId: customer.id,
          conversationId: conversation.id,
          orderNumber: 'TEST-ORDER-001',
          status: 'pending',
          items: [
            {
              product: 'Brownie',
              quantity: 3,
              unitPrice: 500,
              totalPrice: 1500
            }
          ],
          totalAmount: 1500
        }
      });
    }
    testOrderId = order.id;
    console.log(`Test order ID: ${testOrderId}`);
    console.log('Test order context setup complete!');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.warn(`Warning: Could not setup test order context: ${errorMessage}`);
    if (errorStack) {
      console.warn(`Stack: ${errorStack.substring(0, 200)}`);
    }
    console.warn('Order_update tests may not work correctly without proper context');
    console.warn('Continuing with tests anyway...');
  }
}

/**
 * Cleanup test data
 */
async function cleanupTestData(): Promise<void> {
  try {
    if (testOrderId) {
      await prisma.order.deleteMany({
        where: {
          id: testOrderId
        }
      }).catch(() => {});
    }
  } catch (error: unknown) {
    // Ignore cleanup errors - not critical for test execution
    if (error instanceof Error) {
      // Silently ignore cleanup failures
    }
  }
}

/**
 * Detect language from message (simple heuristic)
 */
function detectLanguage(message: string): string {
  const lower = message.toLowerCase();
  
  // Tamil indicators
  if (/[க-ன]/.test(message) || 
      /\b(irukka|venum|pannu|maadi|enna|evlo|naale|innum|kitta|kuduthuten)\b/i.test(lower)) {
    return 'tamil';
  }
  
  // Kannada indicators
  if (/[ಅ-ಹ]/.test(message) || 
      /\b(ideya|beku|maadi|yestu|naale|innu|jothe|kottide)\b/i.test(lower)) {
    return 'kannada';
  }
  
  // Malayalam indicators
  if (/[അ-ഹ]/.test(message) || 
      /\b(unda|vende|cheyyu|ethra|naale|koode|humanodu|koduthu)\b/i.test(lower)) {
    return 'malayalam';
  }
  
  // Telugu indicators
  if (/[అ-హ]/.test(message) || 
      /\b(undha|kavali|cheyandi|entha|repu|inko|tho|ichanu)\b/i.test(lower)) {
    return 'telugu';
  }
  
  // Tanglish (Tamil + English mix)
  if (/\b(bro|anna|sir|madam)\b/i.test(lower) && 
      /\b(irukku|venum|pannu|enna|evlo)\b/i.test(lower)) {
    return 'tanglish';
  }
  
  return 'english';
}

function log(message: string, toConsole: boolean = true): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  if (toConsole) {
    console.log(message);
  }
  
  try {
    appendFileSync(LOG_FILE, logMessage + '\n');
  } catch (error: unknown) {
    // If log file write fails, at least show in console
    if (!toConsole) {
      console.log(message);
    }
    // Silently continue - logging failure shouldn't stop tests
  }
}

function logSection(title: string): void {
  const separator = '='.repeat(60);
  log('');
  log(separator);
  log(title);
  log(separator);
}

/**
 * Validate test result against expected values
 */
function validateResult(
  result: any,
  testCase: TestCase
): { passed: boolean; issues: string[] } {
  const issues: string[] = [];
  let passed = true;

  // Check primary intent
  if (result.primaryIntent !== testCase.expectedPrimaryIntent) {
    passed = false;
    issues.push(`Expected primary intent "${testCase.expectedPrimaryIntent}" but got "${result.primaryIntent}"`);
  }

  // Check secondary intents if specified
  if (testCase.expectedSecondaryIntents && testCase.expectedSecondaryIntents.length > 0) {
    const missingSecondary = testCase.expectedSecondaryIntents.filter(
      expected => !result.secondaryIntents?.includes(expected)
    );
    if (missingSecondary.length > 0) {
      passed = false;
      issues.push(`Missing secondary intents: ${missingSecondary.join(', ')}`);
    }

    // Warn about unexpected secondary intents (not a failure, but worth noting)
    const unexpectedSecondary = result.secondaryIntents?.filter(
      actual => !testCase.expectedSecondaryIntents?.includes(actual)
    ) || [];
    if (unexpectedSecondary.length > 0) {
      issues.push(`Note: Unexpected secondary intents detected: ${unexpectedSecondary.join(', ')}`);
    }
  }

  // Check confidence threshold (warning, not failure)
  if (result.confidence < 0.7) {
    issues.push(`Low confidence: ${result.confidence.toFixed(2)} (expected >= 0.7)`);
  }

  // Check if reasoning is present
  if (!result.reasoning || result.reasoning.trim().length === 0) {
    issues.push(`Missing reasoning from AI`);
  }

  return { passed, issues };
}

async function runIntentClassificationTest(): Promise<void> {
  console.log('🚀 Starting Intent Classification Test Suite...\n');
  console.log('Step 1: Creating output directory...');
  
  // Create output directory
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log('✓ Output directory created');
  } catch (error) {
    console.error('❌ Failed to create output directory:', error);
    process.exit(1);
  }
  
  // Initialize log file
  console.log('Step 2: Initializing log file...');
  try {
    writeFileSync(LOG_FILE, `Intent Classification Test Suite\nStarted: ${new Date().toISOString()}\n\n`);
    console.log('✓ Log file initialized');
  } catch (error) {
    console.error('❌ Failed to create log file:', error);
    process.exit(1);
  }
  
  logSection('🧪 Starting Intent Classification Test Suite');
  
  // Load test cases from JSON first (before DB operations)
  console.log('\nStep 3: Loading test cases from JSON file...');
  let testCases: TestCase[];
  try {
    const testData = JSON.parse(readFileSync(TEST_MESSAGES_FILE, 'utf-8')) as TestMessages;
    testCases = testData.testCases;
    
    if (!testCases || testCases.length === 0) {
      throw new Error('No test cases found in JSON file');
    }
    
    log(`Loaded ${testCases.length} test cases from ${TEST_MESSAGES_FILE}`);
    console.log(`✓ Loaded ${testCases.length} test cases`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    log(`❌ Error loading test cases: ${errorMessage}`);
    console.error(`❌ Error loading test cases: ${errorMessage}`);
    if (errorStack) {
      log(`Stack: ${errorStack}`);
      console.error(`Stack: ${errorStack}`);
    }
    process.exit(1);
  }
  
  // Setup test order context (optional, skip if it hangs)
  console.log('\nStep 4: Setting up test order context (optional)...');
  log('Setting up test order context for order_update tests...');
  
  // Try setup with a short timeout, skip if it hangs
  const setupWithTimeout = Promise.race([
    setupTestOrderContext(),
    new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Setup timeout - skipping')), 3000);
    })
  ]);
  
  try {
    await setupWithTimeout;
    if (testConversationId) {
      log(`✓ Test conversation ID: ${testConversationId}`);
      console.log(`✓ Test conversation ID: ${testConversationId}`);
    }
    if (testOrderId) {
      log(`✓ Test order ID: ${testOrderId}`);
      console.log(`✓ Test order ID: ${testOrderId}`);
    }
    console.log('✓ Test order context setup complete');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`⚠️ Warning: Test order context setup skipped: ${errorMessage}`);
    console.warn(`⚠️ Warning: Test order context setup skipped: ${errorMessage}`);
    console.warn('Continuing with tests (order_update tests may not work correctly)...');
  }
  
  log('');
  console.log('\nStep 5: Starting test execution...\n');
  
  log(`Testing ${testCases.length} test cases...\n`);
  console.log(`Testing ${testCases.length} test cases...\n`);
  
  const results: TestResult[] = [];
  let passedCount = 0;
  let failedCount = 0;
  let errorCount = 0;
  
  // Progress tracking
  const startTime = Date.now();
  const progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const completed = results.length;
    const remaining = testCases.length - completed;
    const avgTime = completed > 0 ? elapsed / completed : 0;
    const estimatedRemaining = Math.round((remaining * avgTime) / 1000);
    process.stdout.write(`\r⏳ Progress: ${completed}/${testCases.length} (${((completed / testCases.length) * 100).toFixed(1)}%) | Est. remaining: ${estimatedRemaining}s`);
  }, 1000);
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const testNumber = i + 1;
    
    log(`[${testNumber}/${testCases.length}] Testing: "${testCase.message}"`);
    log(`   Expected: ${testCase.expectedPrimaryIntent}`);
    if (testCase.expectedSecondaryIntents && testCase.expectedSecondaryIntents.length > 0) {
      log(`   Expected Secondary: ${testCase.expectedSecondaryIntents.join(', ')}`);
    }
    
    try {
      const testStartTime = Date.now();
      
      // Normalize message
      const normalizedMessage = await normalizeMessage(testCase.message, TEST_VENDOR_ID);
      
      // Detect language
      const detectedLanguage = detectLanguage(testCase.message);
      
      // Get conversation memory (empty for isolated tests)
      const memory = {
        keyFacts: [],
        ongoingTopics: [],
        customerPreferences: {},
        conversationSummary: '',
        importantContext: [],
        turnNumber: testCase.context?.conversationStage === 'order_confirmation' ? 5 : 0,
        conversationStage: (testCase.context?.conversationStage || 'greeting') as any
      };
      
      // Use test conversation ID if order context is needed
      const conversationId = testCase.context?.hasExistingOrder && testConversationId
        ? testConversationId
        : undefined;
      
      // Classify intent
      // IMPORTANT: We disable fallback and cache to test ONLY AI responses
      // - disableFallback = true: Throws errors instead of using keyword fallback
      // - disableCache = true: Always gets fresh AI responses (no cached results)
      // This allows us to fine-tune the AI prompt and see pure AI performance
      const result = await classifyIntent(
        normalizedMessage,
        memory,
        [],
        TEST_VENDOR_ID,
        conversationId,
        true, // disableFallback = true - only test AI responses, throw errors if AI fails
        true  // disableCache = true - always get fresh AI responses, no cached fallback results
      );
      
      const timeMs = Date.now() - testStartTime;
      
      // Validate result
      const validation = validateResult(result, testCase);
      
      const testResult: TestResult = {
        testCase,
        actual: {
          primaryIntent: result.primaryIntent,
          secondaryIntents: result.secondaryIntents || [],
          confidence: result.confidence || 0,
          reasoning: result.reasoning || ''
        },
        passed: validation.passed,
        issues: validation.issues,
        performance: { timeMs },
        language: detectedLanguage
      };
      
      results.push(testResult);
      
      if (validation.passed && validation.issues.length === 0) {
        passedCount++;
        log(`   ✅ PASSED (${timeMs}ms, confidence: ${result.confidence?.toFixed(2)}, language: ${detectedLanguage})`);
      } else if (validation.passed) {
        // Passed but with warnings
        passedCount++;
        log(`   ⚠️  PASSED WITH WARNINGS (${timeMs}ms, confidence: ${result.confidence?.toFixed(2)})`);
        validation.issues.forEach(issue => log(`      - ${issue}`));
      } else {
        failedCount++;
        log(`   ❌ FAILED`);
        validation.issues.forEach(issue => log(`      - ${issue}`));
      }
      
      log(`   Actual: ${result.primaryIntent}${result.secondaryIntents?.length ? ` (secondary: ${result.secondaryIntents.join(', ')})` : ''}`);
      if (result.reasoning) {
      const maxReasoningLength = 150;
      const reasoningPreview = result.reasoning.length > maxReasoningLength 
        ? result.reasoning.substring(0, maxReasoningLength) + '...'
        : result.reasoning;
      log(`   Reasoning: ${reasoningPreview}`);
      }
      log('');
      
  } catch (error: unknown) {
    errorCount++;
    failedCount++;
    const detectedLanguage = detectLanguage(testCase.message);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    log(`   ❌ ERROR: ${errorMessage}`);
    if (errorStack) {
      const stackPreview = errorStack.substring(0, 200);
      log(`   Stack: ${stackPreview}...`);
    }
      
      results.push({
        testCase,
        actual: {
          primaryIntent: 'error',
          secondaryIntents: [],
          confidence: 0,
          reasoning: errorMessage
        },
        passed: false,
        issues: [`Error: ${errorMessage}`],
        performance: { timeMs: 0 },
        language: detectedLanguage
      });
      log('');
    }
  }
  
  clearInterval(progressInterval);
  process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear progress line
  
  // Calculate statistics
  const totalTime = Date.now() - startTime;
  const times = results.map(r => r.performance.timeMs).filter(t => t > 0);
  const minTime = times.length > 0 ? Math.min(...times) : 0;
  const maxTime = times.length > 0 ? Math.max(...times) : 0;
  const avgTime = times.length > 0 ? Math.round(times.reduce((sum, t) => sum + t, 0) / times.length) : 0;
  
  // Accuracy by intent type
  const accuracyByIntent: Record<string, { total: number; passed: number; passRate: string }> = {};
  results.forEach(result => {
    const intent = result.testCase.expectedPrimaryIntent;
    if (!accuracyByIntent[intent]) {
      accuracyByIntent[intent] = { total: 0, passed: 0, passRate: '0%' };
    }
    accuracyByIntent[intent].total++;
    if (result.passed) {
      accuracyByIntent[intent].passed++;
    }
  });
  
  Object.entries(accuracyByIntent).forEach(([intent, stats]) => {
    stats.passRate = ((stats.passed / stats.total) * 100).toFixed(2) + '%';
  });
  
  // Accuracy by language
  const accuracyByLanguage: Record<string, { total: number; passed: number; passRate: string }> = {};
  results.forEach(result => {
    const lang = result.language || 'unknown';
    if (!accuracyByLanguage[lang]) {
      accuracyByLanguage[lang] = { total: 0, passed: 0, passRate: '0%' };
    }
    accuracyByLanguage[lang].total++;
    if (result.passed) {
      accuracyByLanguage[lang].passed++;
    }
  });
  
  Object.entries(accuracyByLanguage).forEach(([lang, stats]) => {
    stats.passRate = ((stats.passed / stats.total) * 100).toFixed(2) + '%';
  });
  
  // Generate summary
  const summary: TestSummary = {
    timestamp: new Date().toISOString(),
    totalTests: testCases.length,
    passed: passedCount,
    failed: failedCount,
    passRate: ((passedCount / testCases.length) * 100).toFixed(2) + '%',
    averageTimeMs: avgTime,
    minTimeMs: minTime,
    maxTimeMs: maxTime,
    results,
    accuracyByIntent,
    accuracyByLanguage
  };
  
  // Save JSON results
  writeFileSync(JSON_RESULTS_FILE, JSON.stringify(summary, null, 2));
  
  // Log summary
  logSection('📊 TEST SUMMARY');
  log(`Total Tests: ${summary.totalTests}`);
  log(`✅ Passed: ${summary.passed}`);
  log(`❌ Failed: ${summary.failed}`);
  if (errorCount > 0) {
    log(`⚠️  Errors: ${errorCount}`);
  }
  log(`📈 Pass Rate: ${summary.passRate}`);
  log(`⏱️  Performance:`);
  log(`   - Average: ${summary.averageTimeMs}ms`);
  log(`   - Min: ${summary.minTimeMs}ms`);
  log(`   - Max: ${summary.maxTimeMs}ms`);
  log(`   - Total time: ${Math.round(totalTime / 1000)}s`);
  log(`\n📄 Detailed results saved to:`);
  log(`   - Log file: ${LOG_FILE}`);
  log(`   - JSON results: ${JSON_RESULTS_FILE}`);
  
  // Print failed tests
  if (failedCount > 0) {
    logSection('❌ FAILED TESTS');
    const failedResults = results.filter(r => !r.passed);
    failedResults.forEach((result, idx) => {
      log(`\n${idx + 1}. "${result.testCase.message}"`);
      log(`   Description: ${result.testCase.description}`);
      log(`   Language: ${result.language || 'unknown'}`);
      log(`   Expected: ${result.testCase.expectedPrimaryIntent}`);
      log(`   Got: ${result.actual.primaryIntent}`);
      log(`   Confidence: ${result.actual.confidence.toFixed(2)}`);
      if (result.actual.secondaryIntents.length > 0) {
        log(`   Secondary Intents: ${result.actual.secondaryIntents.join(', ')}`);
      }
      result.issues.forEach(issue => log(`   - ${issue}`));
      if (result.actual.reasoning) {
        log(`   Reasoning: ${result.actual.reasoning}`);
      }
    });
    
    log(`\nTotal failed: ${failedResults.length}`);
  }
  
  // Performance breakdown by intent type
  logSection('⏱️  PERFORMANCE BY INTENT TYPE');
  const performanceByIntent: Record<string, { count: number; totalTime: number; avgTime: number; minTime: number; maxTime: number }> = {};
  results.forEach(result => {
    const intent = result.actual.primaryIntent;
    if (!performanceByIntent[intent]) {
      performanceByIntent[intent] = { count: 0, totalTime: 0, avgTime: 0, minTime: Infinity, maxTime: 0 };
    }
    performanceByIntent[intent].count++;
    performanceByIntent[intent].totalTime += result.performance.timeMs;
    performanceByIntent[intent].minTime = Math.min(performanceByIntent[intent].minTime, result.performance.timeMs);
    performanceByIntent[intent].maxTime = Math.max(performanceByIntent[intent].maxTime, result.performance.timeMs);
  });
  
  Object.entries(performanceByIntent).forEach(([intent, stats]) => {
    stats.avgTime = Math.round(stats.totalTime / stats.count);
    log(`${intent}: ${stats.count} tests`);
    log(`   - Avg: ${stats.avgTime}ms, Min: ${stats.minTime}ms, Max: ${stats.maxTime}ms`);
  });
  
  // Accuracy breakdown by intent type
  logSection('📈 ACCURACY BY INTENT TYPE');
  Object.entries(accuracyByIntent)
    .sort((a, b) => Number.parseFloat(b[1].passRate) - Number.parseFloat(a[1].passRate))
    .forEach(([intent, stats]) => {
      const passRateNum = Number.parseFloat(stats.passRate);
      const status = passRateNum >= 90 ? '✅' : passRateNum >= 70 ? '⚠️' : '❌';
      log(`${status} ${intent}: ${stats.passed}/${stats.total} (${stats.passRate})`);
    });
  
  // Accuracy by language
  logSection('🌍 ACCURACY BY LANGUAGE');
  Object.entries(accuracyByLanguage)
    .sort((a, b) => Number.parseFloat(b[1].passRate) - Number.parseFloat(a[1].passRate))
    .forEach(([lang, stats]) => {
      const passRateNum = Number.parseFloat(stats.passRate);
      const status = passRateNum >= 90 ? '✅' : passRateNum >= 70 ? '⚠️' : '❌';
      log(`${status} ${lang}: ${stats.passed}/${stats.total} (${stats.passRate})`);
    });
  
  log('\n' + '='.repeat(60));
  log(`Test completed: ${new Date().toISOString()}`);
  log(`Total execution time: ${Math.round(totalTime / 1000)}s`);
  log('='.repeat(60));
  
  // Cleanup test data
  await cleanupTestData();
  
  // Print summary to console
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${summary.totalTests}`);
  console.log(`✅ Passed: ${summary.passed}`);
  console.log(`❌ Failed: ${summary.failed}`);
  if (errorCount > 0) {
    console.log(`⚠️  Errors: ${errorCount}`);
  }
  console.log(`📈 Pass Rate: ${summary.passRate}`);
  console.log(`⏱️  Average Time: ${summary.averageTimeMs}ms`);
  console.log(`\n📄 Detailed results:`);
  console.log(`   - Log file: ${LOG_FILE}`);
  console.log(`   - JSON results: ${JSON_RESULTS_FILE}`);
  console.log('='.repeat(60));
  
  // Exit with error code if tests failed
  if (failedCount > 0) {
    process.exit(1);
  }
}

// Run the test suite immediately
(async () => {
  try {
    console.log('📋 Starting Intent Classification Test Suite...\n');
    await runIntentClassificationTest();
    process.exit(0);
  } catch (err: any) {
    const errorMsg = `❌ Test suite failed: ${err?.message || String(err)}`;
    console.error(errorMsg);
    if (err?.stack) {
      console.error(err.stack);
    }
    try {
      appendFileSync(LOG_FILE, `\n${errorMsg}\n${err?.stack || ''}\n`);
    } catch {
      // Ignore if log file write fails
    }
    process.exit(1);
  }
})();

export { runIntentClassificationTest };
