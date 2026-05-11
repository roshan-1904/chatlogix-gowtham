// backend/scripts/analyzeMultiStageConversation.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function analyzeConversation(conversationId) {
    try {
        console.log(`\n🔍 ANALYZING CONVERSATION: ${conversationId}\n`);
        console.log('='.repeat(80));
        // 1. Get conversation details
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                customer: {
                    select: { phone: true }
                },
                vendor: {
                    select: { businessName: true, aiBotName: true }
                }
            }
        });
        if (!conversation) {
            console.log('❌ Conversation not found');
            return;
        }
        console.log('\n📋 CONVERSATION DETAILS');
        console.log('-'.repeat(80));
        console.log(`ID: ${conversation.id}`);
        console.log(`Vendor: ${conversation.vendor.businessName}`);
        console.log(`Customer: ${conversation.customer.phone}`);
        console.log(`Status: ${conversation.status}`);
        console.log(`Created: ${conversation.createdAt}`);
        console.log(`AI Paused: ${conversation.aiPaused}`);
        // 2. Get last 25 messages
        const messages = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { timestamp: 'desc' },
            take: 25
        });
        console.log(`\n💬 LAST 25 MESSAGES (${messages.length} found)`);
        console.log('-'.repeat(80));
        messages.reverse().forEach((msg, idx) => {
            const time = msg.timestamp.toISOString().replace('T', ' ').substring(0, 19);
            console.log(`\n[${idx + 1}] ${time} | ${msg.senderType.toUpperCase()}`);
            console.log(`    Content: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}`);
            const normalizedContent = msg.normalizedContent;
            if (normalizedContent) {
                console.log(`    Normalized: ${normalizedContent.substring(0, 200)}${normalizedContent.length > 200 ? '...' : ''}`);
            }
            if (msg.aiTokensUsed > 0) {
                console.log(`    AI Tokens: ${msg.aiTokensUsed}`);
            }
        });
        // 3. Get Stage Execution Logs
        const stageLogs = await prisma.stageExecutionLog.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        console.log(`\n⚙️ STAGE EXECUTION LOGS (${stageLogs.length} found)`);
        console.log('-'.repeat(80));
        if (stageLogs.length === 0) {
            console.log('⚠️  NO STAGE EXECUTION LOGS FOUND - Multi-stage AI may not be running!');
        }
        else {
            // Group by messageId
            const logsByMessage = new Map();
            stageLogs.forEach((log) => {
                if (!logsByMessage.has(log.messageId)) {
                    logsByMessage.set(log.messageId, []);
                }
                logsByMessage.get(log.messageId).push(log);
            });
            logsByMessage.forEach((logs, messageId) => {
                console.log(`\n📨 Message ID: ${messageId}`);
                const sortedLogs = logs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                sortedLogs.forEach((log) => {
                    const status = log.success ? '✅' : '❌';
                    const time = log.createdAt.toISOString().replace('T', ' ').substring(0, 19);
                    console.log(`  ${status} ${log.stageName} (${log.stageType})`);
                    console.log(`     Time: ${time} | Duration: ${log.duration}ms | Tokens: ${log.tokensUsed || 0} | Cost: $${(log.cost || 0).toFixed(6)}`);
                    if (!log.success) {
                        console.log(`     ❌ Error: ${log.errorType || 'Unknown'} - ${log.errorMessage?.substring(0, 100) || 'No message'}`);
                        if (log.fallbackUsed) {
                            console.log(`     ⚠️  Fallback used`);
                        }
                    }
                });
            });
        }
        // 4. Get Quality Metrics
        const qualityMetrics = await prisma.qualityMetrics.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        console.log(`\n📊 QUALITY METRICS (${qualityMetrics.length} found)`);
        console.log('-'.repeat(80));
        if (qualityMetrics.length === 0) {
            console.log('⚠️  NO QUALITY METRICS FOUND');
        }
        else {
            qualityMetrics.forEach((metric, idx) => {
                console.log(`\n[${idx + 1}] Message ID: ${metric.messageId}`);
                console.log(`    Naturalness: ${metric.naturalnessScore}/5.0`);
                console.log(`    Completeness: ${(metric.completenessScore * 100).toFixed(1)}%`);
                console.log(`    Continuity: ${(metric.continuityScore * 100).toFixed(1)}%`);
                console.log(`    Overall: ${metric.overallScore}/5.0`);
                console.log(`    Tokens: ${metric.totalTokensUsed} | Cost: $${metric.totalCost.toFixed(6)} | Duration: ${metric.totalDuration}ms`);
                if (metric.issues && Array.isArray(metric.issues) && metric.issues.length > 0) {
                    console.log(`    ⚠️  Issues: ${JSON.stringify(metric.issues)}`);
                }
                if (metric.stagesExecuted && Array.isArray(metric.stagesExecuted)) {
                    console.log(`    Stages: ${metric.stagesExecuted.join(', ')}`);
                }
            });
        }
        // 5. Get Conversation Memory
        const memory = await prisma.conversationMemory.findUnique({
            where: { conversationId }
        });
        console.log(`\n🧠 CONVERSATION MEMORY`);
        console.log('-'.repeat(80));
        if (!memory) {
            console.log('⚠️  NO CONVERSATION MEMORY FOUND');
        }
        else {
            console.log(`Turn Number: ${memory.turnNumber}`);
            console.log(`Stage: ${memory.conversationStage}`);
            console.log(`Last Updated: ${memory.lastUpdated}`);
            console.log(`Key Facts: ${JSON.stringify(memory.keyFacts, null, 2)}`);
            console.log(`Ongoing Topics: ${JSON.stringify(memory.ongoingTopics, null, 2)}`);
            console.log(`Summary: ${memory.conversationSummary.substring(0, 200)}${memory.conversationSummary.length > 200 ? '...' : ''}`);
        }
        // 6. Get Correction History
        const corrections = await prisma.correctionHistory.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        console.log(`\n🔧 CORRECTION HISTORY (${corrections.length} found)`);
        console.log('-'.repeat(80));
        if (corrections.length === 0) {
            console.log('No corrections detected');
        }
        else {
            corrections.forEach((correction, idx) => {
                console.log(`\n[${idx + 1}] ${correction.createdAt.toISOString()}`);
                console.log(`    Field: ${correction.correctedField}`);
                console.log(`    Original: ${correction.originalValue}`);
                console.log(`    Corrected: ${correction.correctedValue}`);
                console.log(`    Confidence: ${correction.confidence}`);
            });
        }
        // 7. Analysis Summary
        console.log(`\n📈 ANALYSIS SUMMARY`);
        console.log('='.repeat(80));
        const assistantMessages = messages.filter(m => m.senderType === 'assistant');
        const customerMessages = messages.filter(m => m.senderType === 'customer');
        console.log(`Total Messages: ${messages.length} (${customerMessages.length} customer, ${assistantMessages.length} assistant)`);
        console.log(`Stage Logs: ${stageLogs.length}`);
        console.log(`Failed Stages: ${stageLogs.filter((l) => !l.success).length}`);
        console.log(`Quality Metrics: ${qualityMetrics.length}`);
        console.log(`Average Quality Score: ${qualityMetrics.length > 0 ? (qualityMetrics.reduce((sum, m) => sum + m.overallScore, 0) / qualityMetrics.length).toFixed(2) : 'N/A'}/5.0`);
        // Check if multi-stage is working
        const recentStageLogs = stageLogs.filter((l) => {
            const logTime = l.createdAt.getTime();
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            return logTime > oneHourAgo;
        });
        if (recentStageLogs.length === 0) {
            console.log(`\n⚠️  WARNING: No recent stage execution logs found!`);
            console.log(`   Multi-stage AI may not be running or may be using fallback mode.`);
        }
        else {
            const failedStages = recentStageLogs.filter((l) => !l.success);
            if (failedStages.length > 0) {
                console.log(`\n⚠️  WARNING: ${failedStages.length} failed stages in recent logs:`);
                failedStages.forEach((log) => {
                    console.log(`   - ${log.stageName}: ${log.errorMessage?.substring(0, 100) || 'Unknown error'}`);
                });
            }
        }
        // Check for common issues
        console.log(`\n🔍 POTENTIAL ISSUES:`);
        console.log('-'.repeat(80));
        if (stageLogs.length === 0) {
            console.log('❌ No stage execution logs - Multi-stage AI not running');
        }
        if (qualityMetrics.length === 0 && assistantMessages.length > 0) {
            console.log('⚠️  No quality metrics but assistant messages exist - Quality assessment may be failing');
        }
        if (memory === null && messages.length > 5) {
            console.log('⚠️  No conversation memory - Memory service may not be working');
        }
        const highFailureRate = stageLogs.length > 0 && (stageLogs.filter((l) => !l.success).length / stageLogs.length) > 0.2;
        if (highFailureRate) {
            console.log('⚠️  High failure rate in stage execution (>20%)');
        }
        const lowQualityScores = qualityMetrics.filter((m) => m.overallScore < 4.0).length;
        if (lowQualityScores > 0) {
            console.log(`⚠️  ${lowQualityScores} messages with quality score < 4.0`);
        }
    }
    catch (error) {
        console.error('❌ Error analyzing conversation:', error);
    }
    finally {
        await prisma.$disconnect();
    }
}
const conversationId = process.argv[2];
if (!conversationId) {
    console.error('Usage: ts-node analyzeMultiStageConversation.ts <conversationId>');
    process.exit(1);
}
analyzeConversation(conversationId);
