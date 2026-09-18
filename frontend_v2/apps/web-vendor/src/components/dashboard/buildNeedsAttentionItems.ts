export interface NeedsAttentionItem {
  id: string;
  title: string;
  description: string;
  href: string;
  priority: number;
}

export interface BuildNeedsAttentionInput {
  pendingOrders: number;
  whatsappLive: boolean;
  lowBalanceWarning: boolean;
  aiPaused: number;
}

export function buildNeedsAttentionItems(input: BuildNeedsAttentionInput): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = [];

  if (input.pendingOrders > 0) {
    items.push({
      id: 'pending-orders',
      title: `${input.pendingOrders} pending order${input.pendingOrders === 1 ? '' : 's'}`,
      description: 'Confirm or update orders waiting on you',
      href: '/orders?status=pending',
      priority: 1,
    });
  }

  if (!input.whatsappLive) {
    items.push({
      id: 'whatsapp-connect',
      title: 'Connect your shop number',
      description: 'Let customers reach you on WhatsApp',
      href: '/settings/whatsapp',
      priority: 2,
    });
  }

  if (input.lowBalanceWarning) {
    items.push({
      id: 'low-wallet',
      title: 'Wallet balance is low',
      description: 'Add money so assistant replies keep going out',
      href: '/wallet',
      priority: 3,
    });
  }

  if (input.aiPaused > 0) {
    items.push({
      id: 'ai-paused',
      title: `${input.aiPaused} conversation${input.aiPaused === 1 ? '' : 's'} with AI paused`,
      description: 'Resume the assistant when you are ready',
      href: '/conversations',
      priority: 4,
    });
  }

  return items.sort((a, b) => a.priority - b.priority).slice(0, 5);
}
