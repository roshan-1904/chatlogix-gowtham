import { PrismaClient } from '@prisma/client';
import { logger } from '../logger.js';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaLogEnabled = process.env.PRISMA_DEBUG === 'true';

// Connection pool configuration to prevent exhaustion
// Default: connection_limit=9, pool_timeout=10s
// Increase for high-concurrency scenarios
const connectionLimit = parseInt(process.env.DATABASE_CONNECTION_LIMIT || '20', 10);
const poolTimeout = parseInt(process.env.DATABASE_POOL_TIMEOUT || '20', 10);

// Build connection URL with pool parameters if not already present
let databaseUrl = process.env.DATABASE_URL || '';
if (databaseUrl && !databaseUrl.includes('connection_limit')) {
  try {
    const url = new URL(databaseUrl);
    url.searchParams.set('connection_limit', connectionLimit.toString());
    url.searchParams.set('pool_timeout', poolTimeout.toString());
    databaseUrl = url.toString();
  } catch (urlError) {
    // If URL parsing fails, use original DATABASE_URL
    // This can happen with connection strings that don't follow standard URL format
    logger.warn({ err: urlError }, 'Failed to parse DATABASE_URL for pool configuration, using original URL');
    databaseUrl = process.env.DATABASE_URL || '';
  }
}

export const prisma: PrismaClient = global.prisma ?? new PrismaClient({
  log: prismaLogEnabled ? ['query', 'error', 'warn'] as any : ['error', 'warn'] as any,
  datasources: {
    db: {
      url: databaseUrl || process.env.DATABASE_URL
    }
  }
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Log database connection details (masked) and attempt a lightweight connectivity probe
try {
  const url = process.env.DATABASE_URL || '';
  if (url) {
    try {
      const u = new URL(url);
      const params = u.searchParams;
      const summary = {
        host: u.hostname,
        port: u.port || '5432',
        db: u.pathname?.replace(/^\//, '') || 'unknown'
      };
      logger.info({ db: summary }, '🧪 Prisma DB config summary');
    } catch {}
  } else {
    logger.warn('DATABASE_URL is empty or undefined');
  }
  // Fire-and-forget probe; do not block startup
  // Use a timeout to prevent hanging on connection issues
  const probePromise = Promise.race([
    prisma.$queryRaw`SELECT 1 AS ok`,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection probe timeout')), 5000)
    )
  ]);
  
  probePromise
    .then(() => {
      logger.info('🟢 Prisma connectivity probe succeeded');
    })
    .catch((err: any) => {
      // Only log as warning for connection issues - this is expected if DB is unreachable
      const isConnectionError = err?.code === 'P1001' || 
                                err?.message?.includes("Can't reach database server") ||
                                err?.message?.includes('Connection probe timeout') ||
                                err?.message?.includes('ECONNREFUSED') ||
                                err?.message?.includes('ETIMEDOUT');
      
      if (isConnectionError) {
        logger.warn({
          errType: err?.name,
          message: err?.message,
          note: 'Database connection unavailable - server will start but DB operations will fail'
        }, '⚠️  Prisma connectivity probe: Database unreachable');
        logger.info('💡 Run "npm run db:test" to diagnose connection issues');
      } else {
        // Log other errors as errors
        logger.error({
          errType: err?.name,
          message: err?.message,
        }, '🔴 Prisma connectivity probe failed');
      }
    });
  // Middleware to log slow queries
  prisma.$use(async (params, next) => {
    const start = Date.now();
    try {
      const result = await next(params);
      const duration = Date.now() - start;
      if (duration > 1000) {
        logger.warn({ model: params.model, action: params.action, duration }, '🐢 Slow Prisma query');
      }
      return result;
    } catch (err: any) {
      const duration = Date.now() - start;
      logger.error({ model: params.model, action: params.action, duration, errType: err?.name, message: err?.message }, '❌ Prisma query failed');
      throw err;
    }
  });
} catch {}


