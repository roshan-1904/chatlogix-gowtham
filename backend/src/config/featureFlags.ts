import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';

/**
 * Feature flag system for gradual rollout of new features
 */
export class FeatureFlags {
  private static instance: FeatureFlags;
  private flags: Map<string, boolean> = new Map();

  private constructor() {
    this.initializeFlags();
  }

  public static getInstance(): FeatureFlags {
    if (!FeatureFlags.instance) {
      FeatureFlags.instance = new FeatureFlags();
    }
    return FeatureFlags.instance;
  }

  private initializeFlags(): void {
    // Initialize from environment variables
    this.flags.set('structured-responses', env.USE_STRUCTURED_AI_RESPONSES === 'true');
    this.flags.set('customer-insights', env.USE_CUSTOMER_INSIGHTS === 'true');
    this.flags.set('event-processing', env.USE_EVENT_PROCESSING === 'true');
    
    // Default to false if not set
    this.flags.set('structured-responses', this.flags.get('structured-responses') || false);
    this.flags.set('customer-insights', this.flags.get('customer-insights') || false);
    this.flags.set('event-processing', this.flags.get('event-processing') || false);

    logger.info({
      'structured-responses': this.flags.get('structured-responses'),
      'customer-insights': this.flags.get('customer-insights'),
      'event-processing': this.flags.get('event-processing')
    }, 'Feature flags initialized');
  }

  /**
   * Check if a feature is enabled
   */
  public isEnabled(featureName: string): boolean {
    return this.flags.get(featureName) || false;
  }

  /**
   * Check if structured AI responses are enabled for a specific vendor
   */
  public async isStructuredResponsesEnabled(vendorId?: string): Promise<boolean> {
    const globalEnabled = this.isEnabled('structured-responses');
    
    if (!globalEnabled) {
      return false;
    }

    // TODO: Add vendor-specific feature flags in database
    // For now, return global setting
    return globalEnabled;
  }

  /**
   * Check if customer insights are enabled
   */
  public async isCustomerInsightsEnabled(vendorId?: string): Promise<boolean> {
    const globalEnabled = this.isEnabled('customer-insights');
    
    if (!globalEnabled) {
      return false;
    }

    // TODO: Add vendor-specific feature flags in database
    return globalEnabled;
  }

  /**
   * Check if event processing is enabled
   */
  public async isEventProcessingEnabled(vendorId?: string): Promise<boolean> {
    const globalEnabled = this.isEnabled('event-processing');
    
    if (!globalEnabled) {
      return false;
    }

    // TODO: Add vendor-specific feature flags in database
    return globalEnabled;
  }

  /**
   * Get AI prompt version for A/B testing
   */
  public async getAIPromptVersion(vendorId?: string): Promise<string> {
    // TODO: Implement A/B testing logic
    // For now, return default version
    return 'v1';
  }

  /**
   * Enable a feature flag
   */
  public enableFeature(featureName: string): void {
    this.flags.set(featureName, true);
    logger.info({ featureName }, 'Feature flag enabled');
  }

  /**
   * Disable a feature flag
   */
  public disableFeature(featureName: string): void {
    this.flags.set(featureName, false);
    logger.info({ featureName }, 'Feature flag disabled');
  }

  /**
   * Get all feature flags status
   */
  public getAllFlags(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    this.flags.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Update feature flag from external source (e.g., admin panel)
   */
  public updateFlag(featureName: string, enabled: boolean): void {
    this.flags.set(featureName, enabled);
    logger.info({ featureName, enabled }, 'Feature flag updated');
  }
}

// Export singleton instance
export const featureFlags = FeatureFlags.getInstance();

// ---------------------------------------------------------------------------
// Per-vendor feature flag reader
// ---------------------------------------------------------------------------
// Vendor.featureFlags is a Json column shaped like { [flag: string]: boolean }.
// Phase 5 will replace the simple in-memory cache below with a proper LRU +
// 30s TTL invalidator. Until then, this minimal cache prevents hot-path DB
// reads on every webhook delivery.

interface CachedFlag {
  value: boolean;
  expiresAt: number;
}

const VENDOR_FLAG_CACHE = new Map<string, CachedFlag>();
const VENDOR_FLAG_CACHE_TTL_MS = 30 * 1000;

function vendorFlagCacheKey(vendorId: string, flag: string): string {
  return `${vendorId}:${flag}`;
}

/**
 * Read a per-vendor boolean feature flag from `Vendor.featureFlags`.
 * Falls back to `false` when the vendor is missing, the column is null,
 * the key is absent, or the DB read fails (fail-closed for safety).
 */
export async function isVendorFlagOn(vendorId: string, flag: string): Promise<boolean> {
  if (!vendorId || !flag) return false;

  const cached = VENDOR_FLAG_CACHE.get(vendorFlagCacheKey(vendorId, flag));
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { featureFlags: true }
    });
    const flags = (vendor?.featureFlags as Record<string, unknown> | null) ?? null;
    const raw = flags?.[flag];
    const value = raw === true;

    VENDOR_FLAG_CACHE.set(vendorFlagCacheKey(vendorId, flag), {
      value,
      expiresAt: Date.now() + VENDOR_FLAG_CACHE_TTL_MS
    });
    return value;
  } catch (err) {
    logger.warn({ err, vendorId, flag }, 'Failed to read vendor feature flag, defaulting to false');
    return false;
  }
}

export function clearVendorFlagCache(): void {
  VENDOR_FLAG_CACHE.clear();
}
