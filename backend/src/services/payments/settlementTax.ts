import { getPlatformSettings } from '../platformSettingsService.js';
import type { SettlementTaxRates } from './settlementService.js';

export function taxRatesForVendorId(vendor: {
  panEncrypted: string | null;
}): SettlementTaxRates {
  const settings = getPlatformSettings();
  const tdsBps =
    vendor.panEncrypted != null && vendor.panEncrypted !== ''
      ? settings.tds194oBps
      : settings.tds194oNoPanBps;
  return { gstTcsBps: settings.gstTcsBps, tdsBps };
}
