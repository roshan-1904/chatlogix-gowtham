/** Rollout toggles — no env vars; redeploy processor Lambda to change (§17). */
export const CATALOG_SLICING_ENABLED = false;

/** Phase 1: log computed slice while keeping legacy prompt until CATALOG_SLICING_ENABLED is true. */
export const CATALOG_SLICING_SHADOW_LOG = false;

export const FULL_CATALOG_FAST_PATH_MAX = 12;
export const K_PRODUCT = 12;
export const K_BROWSE = 25;
export const PROMPT_CATALOG_DESC_MAX_CHARS = 280;

/** Browse uses full catalog when active SKU count is at or below this (spec §6.3 D). */
export const BROWSE_FULL_CATALOG_MAX = 20;

export const DEFAULT_CONVERSATION_MODEL = 'gpt-5.6-luna' as const;

/** Optional: enable slicing only for these vendor ids (phase 2); empty = fleet flag only. */
export const SANDBOX_VENDOR_IDS: readonly string[] = [];
