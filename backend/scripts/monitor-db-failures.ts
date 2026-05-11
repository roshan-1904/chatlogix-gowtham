#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { logger } from '../src/logger.js';

/**
 * Database Failure Monitor Script
 * Analyzes database failure logs and provides insights
 */

interface DatabaseFailureLog {
  timestamp: string;
  operation: {
    operation: string;
    table: string;
    data: any;
    conversationId?: string;
    messageId?: string;
    timestamp: string;
  };
  error: string;
  errorType: string;
  stack?: string;
  retryCount: number;
}

interface FailureStats {
  totalFailures: number;
  failuresByOperation: Record<string, number>;
  failuresByErrorType: Record<string, number>;
  failuresByTable: Record<string, number>;
  recentFailures: DatabaseFailureLog[];
  hourlyFailures: Record<string, number>;
  retryStats: {
    totalRetries: number;
    maxRetries: number;
    avgRetries: number;
  };
}

class DatabaseFailureMonitor {
  private logsDir: string;

  constructor() {
    this.logsDir = join(process.cwd(), 'logs', 'database-failures');
  }

  /**
   * Analyze failure logs and generate statistics
   */
  analyzeFailures(): FailureStats {
    const stats: FailureStats = {
      totalFailures: 0,
      failuresByOperation: {},
      failuresByErrorType: {},
      failuresByTable: {},
      recentFailures: [],
      hourlyFailures: {},
      retryStats: {
        totalRetries: 0,
        maxRetries: 0,
        avgRetries: 0
      }
    };

    try {
      const logFiles = this.getLogFiles();
      
      for (const file of logFiles) {
        const failures = this.parseLogFile(file);
        
        for (const failure of failures) {
          stats.totalFailures++;
          
          // Count by operation
          const operation = failure.operation.operation;
          stats.failuresByOperation[operation] = (stats.failuresByOperation[operation] || 0) + 1;
          
          // Count by error type
          const errorType = failure.errorType;
          stats.failuresByErrorType[errorType] = (stats.failuresByErrorType[errorType] || 0) + 1;
          
          // Count by table
          const table = failure.operation.table;
          stats.failuresByTable[table] = (stats.failuresByTable[table] || 0) + 1;
          
          // Count by hour
          const hour = new Date(failure.timestamp).toISOString().substring(0, 13);
          stats.hourlyFailures[hour] = (stats.hourlyFailures[hour] || 0) + 1;
          
          // Retry statistics
          stats.retryStats.totalRetries += failure.retryCount;
          stats.retryStats.maxRetries = Math.max(stats.retryStats.maxRetries, failure.retryCount);
          
          // Recent failures (last 10)
          stats.recentFailures.push(failure);
        }
      }
      
      // Sort recent failures by timestamp
      stats.recentFailures.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      stats.recentFailures = stats.recentFailures.slice(0, 10);
      
      // Calculate average retries
      if (stats.totalFailures > 0) {
        stats.retryStats.avgRetries = stats.retryStats.totalRetries / stats.totalFailures;
      }
      
    } catch (error) {
      logger.error({ error }, 'Failed to analyze failure logs');
    }

    return stats;
  }

  /**
   * Get all log files
   */
  private getLogFiles(): string[] {
    try {
      const files = readdirSync(this.logsDir);
      return files
        .filter(file => file.endsWith('.log'))
        .map(file => join(this.logsDir, file))
        .sort((a, b) => statSync(b).mtime.getTime() - statSync(a).mtime.getTime());
    } catch (error) {
      logger.warn({ error }, 'Failed to read log directory');
      return [];
    }
  }

  /**
   * Parse a single log file
   */
  private parseLogFile(filePath: string): DatabaseFailureLog[] {
    const failures: DatabaseFailureLog[] = [];
    
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const failure = JSON.parse(line) as DatabaseFailureLog;
          failures.push(failure);
        } catch (parseError) {
          logger.warn({ parseError, line }, 'Failed to parse log line');
        }
      }
    } catch (error) {
      logger.error({ error, filePath }, 'Failed to read log file');
    }
    
    return failures;
  }

  /**
   * Generate a detailed report
   */
  generateReport(): void {
    console.log('📊 Database Failure Analysis Report');
    console.log('=====================================\n');
    
    const stats = this.analyzeFailures();
    
    if (stats.totalFailures === 0) {
      console.log('✅ No database failures found!');
      return;
    }
    
    console.log(`📈 Total Failures: ${stats.totalFailures}`);
    console.log(`🔄 Total Retries: ${stats.retryStats.totalRetries}`);
    console.log(`📊 Average Retries: ${stats.retryStats.avgRetries.toFixed(2)}`);
    console.log(`🔝 Max Retries: ${stats.retryStats.maxRetries}\n`);
    
    // Failures by operation
    console.log('📋 Failures by Operation:');
    Object.entries(stats.failuresByOperation)
      .sort(([,a], [,b]) => b - a)
      .forEach(([operation, count]) => {
        console.log(`  ${operation}: ${count} (${((count / stats.totalFailures) * 100).toFixed(1)}%)`);
      });
    console.log('');
    
    // Failures by error type
    console.log('❌ Failures by Error Type:');
    Object.entries(stats.failuresByErrorType)
      .sort(([,a], [,b]) => b - a)
      .forEach(([errorType, count]) => {
        console.log(`  ${errorType}: ${count} (${((count / stats.totalFailures) * 100).toFixed(1)}%)`);
      });
    console.log('');
    
    // Failures by table
    console.log('🗄️ Failures by Table:');
    Object.entries(stats.failuresByTable)
      .sort(([,a], [,b]) => b - a)
      .forEach(([table, count]) => {
        console.log(`  ${table}: ${count} (${((count / stats.totalFailures) * 100).toFixed(1)}%)`);
      });
    console.log('');
    
    // Recent failures
    console.log('🕐 Recent Failures (Last 10):');
    stats.recentFailures.forEach((failure, index) => {
      const time = new Date(failure.timestamp).toLocaleString();
      console.log(`  ${index + 1}. ${time} - ${failure.operation.operation} on ${failure.operation.table}`);
      console.log(`     Error: ${failure.errorType} - ${failure.error.substring(0, 100)}...`);
      console.log(`     Retries: ${failure.retryCount}`);
      console.log('');
    });
    
    // Hourly distribution
    console.log('⏰ Hourly Distribution (Last 24 hours):');
    const now = new Date();
    const hours = Array.from({ length: 24 }, (_, i) => {
      const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
      return hour.toISOString().substring(0, 13);
    }).reverse();
    
    hours.forEach(hour => {
      const count = stats.hourlyFailures[hour] || 0;
      const bar = '█'.repeat(Math.min(count, 20));
      console.log(`  ${hour}: ${count.toString().padStart(3)} ${bar}`);
    });
  }

  /**
   * Get actionable recommendations
   */
  getRecommendations(): string[] {
    const stats = this.analyzeFailures();
    const recommendations: string[] = [];
    
    if (stats.totalFailures === 0) {
      return ['✅ No issues detected - system is running smoothly!'];
    }
    
    // High failure rate
    if (stats.totalFailures > 100) {
      recommendations.push('🚨 High failure rate detected - investigate database connectivity');
    }
    
    // Connection errors
    const connectionErrors = stats.failuresByErrorType['PrismaClientInitializationError'] || 0;
    if (connectionErrors > 0) {
      recommendations.push('🔌 Database connection issues - check DATABASE_URL and network connectivity');
    }
    
    // High retry rate
    if (stats.retryStats.avgRetries > 2) {
      recommendations.push('🔄 High retry rate - consider increasing retry delays or fixing root cause');
    }
    
    // Table-specific issues
    const messageFailures = stats.failuresByTable['message'] || 0;
    if (messageFailures > stats.totalFailures * 0.8) {
      recommendations.push('📝 Message table issues - check table structure and constraints');
    }
    
    // Recent spike
    const recentFailures = stats.recentFailures.filter(f => {
      const failureTime = new Date(f.timestamp);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return failureTime > oneHourAgo;
    }).length;
    
    if (recentFailures > 10) {
      recommendations.push('⚡ Recent failure spike - check for ongoing issues');
    }
    
    return recommendations;
  }
}

// CLI interface
function main() {
  const monitor = new DatabaseFailureMonitor();
  
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Database Failure Monitor

Usage: npm run monitor:db-failures [options]

Options:
  --help, -h     Show this help message
  --stats        Show statistics only
  --recommend    Show recommendations only
  --full         Show full report (default)
`);
    return;
  }
  
  if (args.includes('--stats')) {
    const stats = monitor.analyzeFailures();
    console.log(JSON.stringify(stats, null, 2));
    return;
  }
  
  if (args.includes('--recommend')) {
    const recommendations = monitor.getRecommendations();
    console.log('💡 Recommendations:');
    recommendations.forEach(rec => console.log(`  ${rec}`));
    return;
  }
  
  // Default: full report
  monitor.generateReport();
  
  console.log('\n💡 Recommendations:');
  const recommendations = monitor.getRecommendations();
  recommendations.forEach(rec => console.log(`  ${rec}`));
}

main();
