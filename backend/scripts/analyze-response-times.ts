// backend/scripts/analyze-response-times.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ResponseTimeStats {
  messageId: string;
  conversationId: string;
  totalDuration: number;
  stageDurations: Array<{ stageName: string; duration: number }>;
  tokensUsed: number;
  cost: number;
  timestamp: Date;
}

async function analyzeResponseTimes(
  conversationId?: string,
  vendorId?: string,
  limit: number = 50
) {
  try {
    console.log('\n⏱️  RESPONSE TIME ANALYSIS\n');
    console.log('='.repeat(80));

    // Build query conditions
    const where: any = {};
    if (conversationId) where.conversationId = conversationId;
    if (vendorId) where.vendorId = vendorId;

    // Get Quality Metrics (has totalDuration per message)
    const qualityMetrics = await (prisma as any).qualityMetrics.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        conversation: {
          include: {
            vendor: { select: { businessName: true } },
            customer: { select: { phone: true } }
          }
        }
      }
    });

    if (qualityMetrics.length === 0) {
      console.log('⚠️  No quality metrics found. Calculating from StageExecutionLog...\n');
      
      // Fallback: Calculate from StageExecutionLog
      const stageLogs = await (prisma as any).stageExecutionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit * 10 // Get more logs to group by message
      });

      if (stageLogs.length === 0) {
        console.log('❌ No stage execution logs found');
        return;
      }

      // Group by messageId and calculate totals
      const messageStats = new Map<string, ResponseTimeStats>();
      
      stageLogs.forEach((log: any) => {
        if (!messageStats.has(log.messageId)) {
          messageStats.set(log.messageId, {
            messageId: log.messageId,
            conversationId: log.conversationId,
            totalDuration: 0,
            stageDurations: [],
            tokensUsed: 0,
            cost: 0,
            timestamp: log.createdAt
          });
        }
        
        const stats = messageStats.get(log.messageId)!;
        stats.totalDuration += log.duration;
        stats.stageDurations.push({
          stageName: log.stageName,
          duration: log.duration
        });
        stats.tokensUsed += log.tokensUsed || 0;
        stats.cost += log.cost || 0;
      });

      // Display results
      const statsArray = Array.from(messageStats.values())
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, limit);

      displayResults(statsArray, 'StageExecutionLog');
      calculateStatistics(statsArray);
      return;
    }

    // Get stage logs for detailed breakdown
    const messageIds = qualityMetrics.map((m: any) => m.messageId);
    const stageLogs = await (prisma as any).stageExecutionLog.findMany({
      where: {
        ...where,
        messageId: { in: messageIds }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Group stage logs by messageId
    const stageLogsByMessage = new Map<string, any[]>();
    stageLogs.forEach((log: any) => {
      if (!stageLogsByMessage.has(log.messageId)) {
        stageLogsByMessage.set(log.messageId, []);
      }
      stageLogsByMessage.get(log.messageId)!.push(log);
    });

    // Combine quality metrics with stage breakdowns
    const combinedStats: ResponseTimeStats[] = qualityMetrics.map((metric: any) => {
      const stages = stageLogsByMessage.get(metric.messageId) || [];
      const stageDurations = stages.map((s: any) => ({
        stageName: s.stageName,
        duration: s.duration
      }));
      
      // Calculate total duration from stages if QualityMetrics.totalDuration is 0 or missing
      const calculatedTotal = stageDurations.reduce((sum, s) => sum + s.duration, 0);
      const totalDuration = metric.totalDuration > 0 ? metric.totalDuration : calculatedTotal;
      
      return {
        messageId: metric.messageId,
        conversationId: metric.conversationId,
        totalDuration: totalDuration,
        stageDurations: stageDurations,
        tokensUsed: metric.totalTokensUsed,
        cost: metric.totalCost,
        timestamp: metric.createdAt
      };
    });

    displayResults(combinedStats, 'QualityMetrics');
    calculateStatistics(combinedStats);

  } catch (error) {
    console.error('❌ Error analyzing response times:', error);
  } finally {
    await prisma.$disconnect();
  }
}

function displayResults(stats: ResponseTimeStats[], source: string) {
  console.log(`\n📊 RESPONSE TIMES (from ${source})`);
  console.log('-'.repeat(80));
  
  stats.forEach((stat, idx) => {
    const timeStr = stat.timestamp.toISOString().replace('T', ' ').substring(0, 19);
    const durationSec = (stat.totalDuration / 1000).toFixed(2);
    
    console.log(`\n[${idx + 1}] Message: ${stat.messageId.substring(0, 8)}...`);
    console.log(`    Time: ${timeStr}`);
    console.log(`    ⏱️  Total Duration: ${stat.totalDuration}ms (${durationSec}s)`);
    console.log(`    💰 Cost: $${stat.cost.toFixed(6)} | Tokens: ${stat.tokensUsed}`);
    
    if (stat.stageDurations.length > 0) {
      console.log(`    📋 Stage Breakdown:`);
      stat.stageDurations.forEach(stage => {
        const stageSec = (stage.duration / 1000).toFixed(2);
        const percentage = ((stage.duration / stat.totalDuration) * 100).toFixed(1);
        console.log(`       - ${stage.stageName}: ${stage.duration}ms (${stageSec}s) - ${percentage}%`);
      });
    }
  });
}

function calculateStatistics(stats: ResponseTimeStats[]) {
  if (stats.length === 0) return;

  const durations = stats.map(s => s.totalDuration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);
  const sorted = durations.sort((a, b) => a - b);
  const medianDuration = sorted[Math.floor(sorted.length / 2)];

  // Calculate percentiles
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  // Stage-wise averages
  const stageTotals = new Map<string, { total: number; count: number }>();
  stats.forEach(stat => {
    stat.stageDurations.forEach(stage => {
      if (!stageTotals.has(stage.stageName)) {
        stageTotals.set(stage.stageName, { total: 0, count: 0 });
      }
      const stageStat = stageTotals.get(stage.stageName)!;
      stageStat.total += stage.duration;
      stageStat.count += 1;
    });
  });

  console.log('\n📈 STATISTICS');
  console.log('='.repeat(80));
  console.log(`Total Messages Analyzed: ${stats.length}`);
  console.log(`\n⏱️  Response Time Statistics:`);
  console.log(`   Average: ${(avgDuration / 1000).toFixed(2)}s (${avgDuration.toFixed(0)}ms)`);
  console.log(`   Median: ${(medianDuration / 1000).toFixed(2)}s (${medianDuration.toFixed(0)}ms)`);
  console.log(`   Min: ${(minDuration / 1000).toFixed(2)}s (${minDuration.toFixed(0)}ms)`);
  console.log(`   Max: ${(maxDuration / 1000).toFixed(2)}s (${maxDuration.toFixed(0)}ms)`);
  console.log(`\n📊 Percentiles:`);
  console.log(`   P50: ${(p50 / 1000).toFixed(2)}s`);
  console.log(`   P75: ${(p75 / 1000).toFixed(2)}s`);
  console.log(`   P90: ${(p90 / 1000).toFixed(2)}s`);
  console.log(`   P95: ${(p95 / 1000).toFixed(2)}s`);
  console.log(`   P99: ${(p99 / 1000).toFixed(2)}s`);

  if (stageTotals.size > 0) {
    console.log(`\n⚙️  Average Stage Durations:`);
    const stageAverages = Array.from(stageTotals.entries())
      .map(([name, stat]) => ({
        name,
        avg: stat.total / stat.count,
        count: stat.count
      }))
      .sort((a, b) => b.avg - a.avg);

    stageAverages.forEach(stage => {
      console.log(`   ${stage.name}: ${(stage.avg / 1000).toFixed(2)}s (${stage.avg.toFixed(0)}ms) - ${stage.count} executions`);
    });
  }

  // Performance warnings
  console.log(`\n⚠️  Performance Warnings:`);
  const slowMessages = stats.filter(s => s.totalDuration > 10000); // > 10s
  if (slowMessages.length > 0) {
    console.log(`   ${slowMessages.length} messages took > 10s`);
  }
  
  const verySlowMessages = stats.filter(s => s.totalDuration > 30000); // > 30s
  if (verySlowMessages.length > 0) {
    console.log(`   ${verySlowMessages.length} messages took > 30s`);
  }

  // Cost analysis
  const totalCost = stats.reduce((sum, s) => sum + s.cost, 0);
  const avgCost = totalCost / stats.length;
  const totalTokens = stats.reduce((sum, s) => sum + s.tokensUsed, 0);
  const avgTokens = totalTokens / stats.length;

  console.log(`\n💰 Cost Analysis:`);
  console.log(`   Total Cost: $${totalCost.toFixed(6)}`);
  console.log(`   Average Cost per Message: $${avgCost.toFixed(6)}`);
  console.log(`   Total Tokens: ${totalTokens.toLocaleString()}`);
  console.log(`   Average Tokens per Message: ${avgTokens.toFixed(0)}`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const conversationId = args.find(arg => arg.startsWith('--conversation='))?.split('=')[1];
const vendorId = args.find(arg => arg.startsWith('--vendor='))?.split('=')[1];
const limit = parseInt(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '50');

// Run analysis
analyzeResponseTimes(conversationId, vendorId, limit);

