window.CL_DATA.modules.push({
  id: 'm04', ph: 1, icon: '🔔', status: 'planned',
  title: 'Notifications Expansion',
  desc: 'Wire email service into orders · WhatsApp templates · per-vendor preferences · delivery webhook',
  tags: ['notifications', 'email', 'whatsapp-templates', 'delivery'],
  deps: ['m01', 'm02'],

  overview: 'Email service (`emailVerification.ts`) exists but only powers signup verification — order events go via WhatsApp only. This module wires email as a fallback channel for order confirmations, payment receipts, shipment notifications, and refund confirmations. Cleans up WhatsApp template management (Meta-approved templates per event type), tracks delivery status from the WA webhook into `NotificationHistory`, and adds per-vendor notification preferences (which channels for which events).',
});
