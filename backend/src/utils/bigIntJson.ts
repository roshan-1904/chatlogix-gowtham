/** JSON-safe string for Prisma BigInt settlement fields (rule 11). */
export function bigintToDecimalString(value: bigint | null | undefined): string | null {
  if (value == null) return null;
  return value.toString();
}

/** Walk a plain object and stringify known BigInt fields for API responses. */
export function stringifyBigIntFields<T extends Record<string, unknown>>(
  row: T,
  keys: (keyof T)[]
): T {
  const out = { ...row };
  for (const key of keys) {
    const v = out[key];
    if (typeof v === 'bigint') {
      (out as Record<string, unknown>)[key as string] = v.toString();
    }
  }
  return out;
}
