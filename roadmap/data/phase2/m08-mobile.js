window.CL_DATA.modules.push({
  id: 'm08', ph: 2, icon: '📱', status: 'planned',
  title: 'Vendor Mobile App Polish',
  desc: 'Expo app has 5 screens · add push notifications, real-time, AI-pause takeover, offline queue',
  tags: ['mobile', 'expo', 'react-native', 'push-notifications'],
  deps: ['m03'],

  overview: 'SMB vendors live on their phones. `vendor-mobile/` Expo app already has Home, Orders, Catalog, Settings, Login screens working against the API. Hardens it for daily use: Expo push notifications on new orders + handoff escalations, one-tap order accept/decline, payment-link share button, conversation takeover (pair with m03 agent console), and an offline queue so vendors in patchy connectivity don\'t lose actions.',
});
