/**
 * Diagnostic script to check multi-stage AI worker configuration
 */
import { env } from '../src/config/env.js';
function checkConfiguration() {
    console.log('\n🔍 Multi-Stage AI Worker Configuration Check\n');
    console.log('='.repeat(60));
    // Check environment variables
    console.log('\n📋 Environment Variables:');
    console.log(`  ENABLE_MULTI_STAGE_AI: ${env.ENABLE_MULTI_STAGE_AI || '(not set)'}`);
    console.log(`  MULTI_STAGE_AI_ROLLOUT_PERCENTAGE: ${env.MULTI_STAGE_AI_ROLLOUT_PERCENTAGE || '(not set)'}`);
    console.log(`  INCOMING_QUEUE_URL: ${env.INCOMING_QUEUE_URL || '(not set)'}`);
    console.log(`  RESPONSE_QUEUE_URL: ${env.RESPONSE_QUEUE_URL || '(not set)'}`);
    console.log(`  NODE_ENV: ${process.env.NODE_ENV || '(not set)'}`);
    // Check feature flag logic
    console.log('\n🎛️  Feature Flag Status:');
    const enableMultiStage = env.ENABLE_MULTI_STAGE_AI;
    const rolloutPercentage = env.MULTI_STAGE_AI_ROLLOUT_PERCENTAGE;
    if (enableMultiStage === 'false') {
        console.log('  ❌ Multi-stage AI: DISABLED (explicitly set to false)');
        console.log('  → All messages will use legacy processing');
    }
    else if (enableMultiStage === 'true') {
        console.log('  ✅ Multi-stage AI: ENABLED for ALL conversations');
        console.log('  → All messages will use multi-stage processing');
    }
    else if (enableMultiStage === 'percentage' || rolloutPercentage) {
        const percentage = rolloutPercentage ? Number.parseInt(rolloutPercentage, 10) : 0;
        if (Number.isNaN(percentage) || percentage < 0 || percentage > 100) {
            console.log('  ⚠️  Multi-stage AI: INVALID CONFIGURATION');
            console.log(`  → Invalid rollout percentage: ${rolloutPercentage}`);
            console.log('  → Defaulting to DISABLED');
        }
        else {
            console.log(`  🔄 Multi-stage AI: GRADUAL ROLLOUT (${percentage}%)`);
            console.log(`  → ${percentage}% of conversations will use multi-stage`);
            console.log(`  → ${100 - percentage}% will use legacy`);
        }
    }
    else {
        console.log('  ❌ Multi-stage AI: DISABLED (not configured)');
        console.log('  → Default behavior: all messages use legacy processing');
        console.log('  → To enable: Set ENABLE_MULTI_STAGE_AI=true');
    }
    // Test feature flag with sample conversation IDs
    console.log('\n🧪 Testing Feature Flag Logic:');
    const testIds = ['conv-test-123', 'conv-test-456', 'conv-test-789'];
    function testShouldUseMultiStage(conversationId) {
        const enableMultiStage = env.ENABLE_MULTI_STAGE_AI;
        const rolloutPercentage = env.MULTI_STAGE_AI_ROLLOUT_PERCENTAGE;
        if (enableMultiStage === 'false')
            return false;
        if (enableMultiStage === 'true')
            return true;
        if (rolloutPercentage) {
            const percentage = Number.parseInt(rolloutPercentage, 10);
            if (Number.isNaN(percentage) || percentage < 0 || percentage > 100)
                return false;
            let hash = 0;
            for (let i = 0; i < conversationId.length; i++) {
                const char = conversationId.codePointAt(i) ?? 0;
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            hash = Math.abs(hash);
            return (hash % 100) < percentage;
        }
        return false;
    }
    testIds.forEach(id => {
        const result = testShouldUseMultiStage(id);
        const hash = (() => {
            let h = 0;
            for (let i = 0; i < id.length; i++) {
                const char = id.codePointAt(i) ?? 0;
                h = ((h << 5) - h) + char;
                h = h & h;
            }
            return Math.abs(h);
        })();
        console.log(`  Conversation: ${id}`);
        console.log(`    Hash: ${hash}, Mod: ${hash % 100}`);
        console.log(`    Use Multi-Stage: ${result ? '✅ YES' : '❌ NO'}`);
    });
    // Check queue configuration
    console.log('\n📬 Queue Configuration:');
    if (env.INCOMING_QUEUE_URL) {
        console.log(`  ✅ INCOMING_QUEUE_URL: ${env.INCOMING_QUEUE_URL}`);
    }
    else {
        console.log('  ❌ INCOMING_QUEUE_URL: NOT SET');
    }
    if (env.RESPONSE_QUEUE_URL) {
        console.log(`  ✅ RESPONSE_QUEUE_URL: ${env.RESPONSE_QUEUE_URL}`);
    }
    else {
        console.log('  ❌ RESPONSE_QUEUE_URL: NOT SET');
    }
    // Recommendations
    console.log('\n💡 Recommendations:');
    if (!env.ENABLE_MULTI_STAGE_AI) {
        console.log('  1. Set ENABLE_MULTI_STAGE_AI=true to enable multi-stage processing');
        console.log('  2. Or set ENABLE_MULTI_STAGE_AI=percentage with MULTI_STAGE_AI_ROLLOUT_PERCENTAGE=10');
    }
    if (!env.INCOMING_QUEUE_URL) {
        console.log('  3. Set INCOMING_QUEUE_URL in .env file');
    }
    if (env.ENABLE_MULTI_STAGE_AI === 'percentage' && !env.MULTI_STAGE_AI_ROLLOUT_PERCENTAGE) {
        console.log('  4. Set MULTI_STAGE_AI_ROLLOUT_PERCENTAGE when using percentage rollout');
    }
    console.log('\n' + '='.repeat(60) + '\n');
}
checkConfiguration();
