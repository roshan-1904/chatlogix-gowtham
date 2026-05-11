window.CL_DATA.modules.push({
  id: 'm03', ph: 1, icon: '🤝', status: 'planned',
  title: 'Human Handoff & Agent Console',
  desc: 'Detection works · escalations queue · build the agent console to actually answer them',
  tags: ['handoff', 'agent', 'support', 'escalation'],
  deps: [],

  overview: '`humanHandoffService.ts` already detects when a customer needs a human (anger, complex complaint, refund disputes) and queues escalations. Missing piece: the agent-side surface. Builds the live conversation takeover UI in web-vendor (already has AI-pause toggle), an inbound queue with priority, agent-typing indicators back over WhatsApp, hand-back-to-AI button, and SLA timers. Closes the loop on the partial implementation flagged in the audit.',
});
