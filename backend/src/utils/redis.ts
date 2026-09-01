import Redis, { Cluster } from 'ioredis';
import { env } from '../config/env.js';

export type RedisClient = Redis | Cluster;

let redisClient: RedisClient | null = null;

function normalizeRedisUrl(raw: string): URL {
  return new URL(raw.includes('://') ? raw : `rediss://${raw}`);
}

function isElastiCacheServerless(hostname: string): boolean {
  return hostname.includes('.serverless.') && hostname.includes('.cache.amazonaws.com');
}

function attachClientLogging(client: RedisClient): void {
  client.on('error', (err) => {
    console.error('Redis connection error:', err);
  });
  client.on('connect', () => {
    console.log('Redis client connected');
  });
}

/**
 * Get Redis client instance with graceful degradation
 * Returns null if Redis URL is not configured or connection fails
 */
export function getRedisClient(): RedisClient | null {
  if (redisClient) {
    return redisClient;
  }

  if (!env.REDIS_URL) {
    console.warn('Redis URL not configured. Caching will be disabled.');
    return null;
  }

  try {
    const parsed = normalizeRedisUrl(env.REDIS_URL);
    const port = parsed.port ? Number(parsed.port) : 6379;
    const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
    const username = parsed.username || undefined;
    const useTls = parsed.protocol === 'rediss:' || isElastiCacheServerless(parsed.hostname);

    const redisOptions = {
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      username,
      password,
      ...(useTls ? { tls: {} } : {})
    };

    // ElastiCache Serverless speaks the Redis Cluster protocol and requires TLS.
    // A standalone ioredis client will fail even with a correct host:port.
    if (isElastiCacheServerless(parsed.hostname)) {
      redisClient = new Cluster(
        [{ host: parsed.hostname, port }],
        {
          dnsLookup: (address, callback) => callback(null, address),
          redisOptions
        }
      );
    } else {
      redisClient = new Redis({
        host: parsed.hostname,
        port,
        ...redisOptions
      });
    }

    attachClientLogging(redisClient);

    redisClient.connect().catch((err) => {
      console.warn('Redis connection failed, caching disabled:', err.message);
      redisClient = null;
    });

    return redisClient;
  } catch (error) {
    console.error('Failed to initialize Redis client:', error);
    return null;
  }
}

/**
 * Get cached value by key
 * Returns null if cache miss or Redis unavailable
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const data = await client.get(key);
    if (!data) {
      return null;
    }
    return JSON.parse(data) as T;
  } catch (error) {
    console.error(`Error getting cache for key ${key}:`, error);
    return null;
  }
}

/**
 * Set cached value with TTL
 * Silently fails if Redis unavailable
 */
export async function setCached(key: string, value: any, ttlSeconds: number): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    return;
  }

  try {
    const serialized = JSON.stringify(value);
    await client.setex(key, ttlSeconds, serialized);
  } catch (error) {
    console.error(`Error setting cache for key ${key}:`, error);
  }
}

/**
 * Delete cached value by key
 * Silently fails if Redis unavailable
 */
export async function deleteCached(key: string): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    return;
  }

  try {
    await client.del(key);
  } catch (error) {
    console.error(`Error deleting cache for key ${key}:`, error);
  }
}

/**
 * Delete multiple cached values by pattern
 * Silently fails if Redis unavailable
 */
export async function deleteCachedByPattern(pattern: string): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    return;
  }

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (error) {
    console.error(`Error deleting cache by pattern ${pattern}:`, error);
  }
}

getRedisClient();
