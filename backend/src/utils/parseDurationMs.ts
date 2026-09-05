const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000
};

/**
 * Parse a duration string like "7d", "1h", "30m" into milliseconds.
 */
export function parseDurationMs(value: string): number {
  const trimmed = value.trim();
  const match = /^(\d+)([smhd])$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid duration format: ${value}`);
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  const multiplier = UNIT_MS[unit];

  if (!multiplier || amount <= 0) {
    throw new Error(`Invalid duration format: ${value}`);
  }

  return amount * multiplier;
}
