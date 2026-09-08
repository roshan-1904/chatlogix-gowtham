/** Scripted timeline for the “With ChatLogix” hero inbox simulation (~10s). */
export type HeroAfterSimEvent =
  | {
      atMs: number;
      action: 'appear';
      chatId: string;
      preview: string;
      time: string;
      unread?: number;
      isVoice?: boolean;
    }
  | { atMs: number; action: 'typing'; chatId: string }
  | { atMs: number; action: 'reply'; chatId: string; preview: string; countsAsOrder?: boolean }
  | {
      atMs: number;
      action: 'customer';
      chatId: string;
      preview: string;
      unread?: number;
      isVoice?: boolean;
    };

export interface HeroAfterChatRow {
  visible: boolean;
  name: string;
  time: string;
  preview: string;
  isVoice?: boolean;
  unread?: number;
  typing: boolean;
  fromShop: boolean;
  justArrived: boolean;
}

export function emptyHeroAfterChatState(
  chats: ReadonlyArray<{ id: string; name: string; time: string }>,
): Record<string, HeroAfterChatRow> {
  return Object.fromEntries(
    chats.map((c) => [
      c.id,
      {
        visible: false,
        name: c.name,
        time: c.time,
        preview: '',
        typing: false,
        fromShop: false,
        justArrived: false,
      },
    ]),
  );
}

export function countScriptOrders(script: ReadonlyArray<HeroAfterSimEvent>): number {
  return script.filter((e) => e.action === 'reply' && e.countsAsOrder).length;
}

export function applyHeroAfterSimEvent(
  state: Record<string, HeroAfterChatRow>,
  event: HeroAfterSimEvent,
): Record<string, HeroAfterChatRow> {
  const clearArrived = Object.fromEntries(
    Object.entries(state).map(([id, row]) => [id, { ...row, justArrived: false }]),
  );

  if (event.action === 'appear') {
    return {
      ...clearArrived,
      [event.chatId]: {
        ...clearArrived[event.chatId],
        visible: true,
        preview: event.preview,
        time: event.time,
        unread: event.unread ?? 1,
        isVoice: event.isVoice,
        typing: false,
        fromShop: false,
        justArrived: true,
      },
    };
  }

  const row = clearArrived[event.chatId];
  if (!row) return clearArrived;

  if (event.action === 'typing') {
    return {
      ...clearArrived,
      [event.chatId]: {
        ...row,
        visible: true,
        typing: true,
        fromShop: false,
        unread: undefined,
        isVoice: false,
        preview: 'typing…',
      },
    };
  }

  if (event.action === 'reply') {
    return {
      ...clearArrived,
      [event.chatId]: {
        ...row,
        visible: true,
        typing: false,
        fromShop: true,
        unread: undefined,
        isVoice: false,
        preview: event.preview,
      },
    };
  }

  return {
    ...clearArrived,
    [event.chatId]: {
      ...row,
      visible: true,
      typing: false,
      fromShop: false,
      unread: event.unread ?? 1,
      isVoice: event.isVoice,
      preview: event.preview,
    },
  };
}
