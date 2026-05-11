window.CL_DATA.modules.push({
  id: 'm17', ph: 3, icon: '📣', status: 'planned',
  title: 'TTS Replies & Outbound Campaigns',
  desc: 'AI-generated voice replies · drip campaigns · broadcast announcements · re-engagement sequences',
  tags: ['outbound', 'tts', 'campaigns', 'broadcast'],
  deps: ['m09', 'm13'],

  overview: 'Today the pipeline is purely reactive: customer messages → AI replies. Adds two outbound capabilities. (1) TTS replies — AI generates a voice note response in the customer\'s language when they sent a voice note, more natural for low-literacy buyers. (2) Campaigns — drip sequences for cart abandonment, re-engagement, broadcast announcements (sale, restock, festival offers) all routed through Meta\'s template-message rules. Built on top of the existing notification queue + `ConversationMemory` segmentation.',
});
