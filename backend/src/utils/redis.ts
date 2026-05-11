import Redis from 'ioredis';
import { env } from '../config/env.js';

let redisClient: Redis | null = null;

/**
 * Get Redis client instance with graceful degradation
 * Returns null if Redis URL is not configured or connection fails
 */
export function getRedisClient(): Redis | null {
  if (redisClient) {
    return redisClient;
  }

  if (!env.REDIS_URL) {
    console.warn('Redis URL not configured. Caching will be disabled.');
    return null;
  }

  try {
    redisClient = new Redis(env.REDIS_URL, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
      // Don't throw - allow graceful degradation
    });

    redisClient.on('connect', () => {
      console.log('Redis client connected');
    });

    // Attempt to connect (non-blocking)
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
    // Don't throw - allow graceful degradation
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
    // Don't throw - allow graceful degradation
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
    // Don't throw - allow graceful degradation
  }
}

// Initialize Redis client on module load
getRedisClient();

