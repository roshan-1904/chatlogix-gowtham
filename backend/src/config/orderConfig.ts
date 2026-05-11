/**
 * Order Management Configuration
 * 
 * Centralized configuration for order management system.
 * Reference: Phase 9 of Order Management System Implementation Plan
 */

export const ORDER_CONFIG = {
  INTENT_DETECTION: {
    PATTERN_CONFIDENCE_THRESHOLD: 0.8,
    AI_CONFIDENCE_THRESHOLD: 0.7,
    FALLBACK_CONFIDENCE_THRESHOLD: 0.6,
  },
  VALIDATION: {
    TOTAL_MISMATCH_THRESHOLD: 1, // Rupees
    MAX_DUPLICATE_ITEMS: 0,
    MIN_ITEMS_AFTER_REMOVAL: 1,
    PRICE_CHANGE_ALERT_THRESHOLD: 0.2, // 20%
  },
  RECOVERY: {
    AUTO_RECOVERY_ENABLED: true,
    RECOVERY_CHECK_INTERVAL: 300000, // 5 minutes
    MAX_RECOVERY_ATTEMPTS: 3,
  },
  ALERTS: {
    SUSPICIOUS_CHANGE_THRESHOLD: -100, // Rupees
    ITEMS_LOST_THRESHOLD: -1,
    ENABLE_VENDOR_NOTIFICATIONS: true,
    PRICE_DROP_THRESHOLD: 0.2, // 20%
    RAPID_CHANGES_THRESHOLD: 5, // Changes in 5 minutes
  },
  TRANSACTIONS: {
    ISOLATION_LEVEL: 'ReadCommitted' as const,
    MAX_WAIT: 5000, // 5 seconds
    TIMEOUT: 10000, // 10 seconds
  },
} as const;

