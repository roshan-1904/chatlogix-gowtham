/** Preset auto-recharge amounts (millirupees): ₹500, ₹1,000, ₹2,000. */
export const AUTO_RECHARGE_PRESET_AMOUNTS_MILLI = [500_000, 1_000_000, 2_000_000] as const;

export type AutoRechargePresetMilli = (typeof AUTO_RECHARGE_PRESET_AMOUNTS_MILLI)[number];

export const AUTO_RECHARGE_SCHEDULE_DELAY_MS = 25 * 60 * 60 * 1000;

export const AUTO_RECHARGE_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

export function isAutoRechargePresetMilli(value: number): value is AutoRechargePresetMilli {
  return (AUTO_RECHARGE_PRESET_AMOUNTS_MILLI as readonly number[]).includes(value);
}
