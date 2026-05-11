window.CL_DATA.modules.push({
  id: 'm02', ph: 1, icon: '📦', status: 'planned',
  title: 'Shipping Integration',
  desc: 'Shiprocket primary (India) + Delhivery — AWB, label PDF, rate quote, tracking webhook',
  tags: ['shipping', 'shiprocket', 'delhivery', 'logistics'],
  deps: ['m01'],

  overview: '`shippingService.ts` is a 9-TODO skeleton — the most-incomplete service in the backend. Builds out: `createShipment`, `getShippingRates`, `generateLabel`, `trackShipment` against Shiprocket (India default) and Delhivery. AI auto-creates shipment on payment confirmation; tracking updates flow back to the customer over WhatsApp via existing notification queue. Vendor dashboard surfaces label PDFs and live status. Without this, vendors stay on manual fulfillment outside ChatLogix.',
});
