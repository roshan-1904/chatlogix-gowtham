type WAReaction = { message_id?: string; emoji?: string };
type WAContext = { id?: string; from?: string };
type WALocation = {
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
};
type WAContact = {
  name?: { formatted_name?: string; first_name?: string; last_name?: string };
  phones?: Array<{ phone?: string; wa_id?: string; type?: string }>;
  emails?: Array<{ email?: string; type?: string }>;
  org?: { company?: string; title?: string };
};
type WAInteractive = {
  type?: 'button_reply' | 'list_reply' | string;
  button_reply?: { id?: string; title?: string };
  list_reply?: { id?: string; title?: string; description?: string };
};

type WAMessage = {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  audio?: { id?: string; mime_type?: string };
  image?: { id?: string; mime_type?: string; caption?: string; sha256?: string };
  video?: { id?: string; mime_type?: string; caption?: string; sha256?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string; sha256?: string };
  sticker?: { id?: string; mime_type?: string; sha256?: string; animated?: boolean };
  location?: WALocation;
  contacts?: WAContact[];
  interactive?: WAInteractive;
  reaction?: WAReaction;
  context?: WAContext;
};

type WAStatus = {
  id: string;
  recipient_id: string;
  status: string;
  timestamp?: string;
  errors?: Array<{ code?: number; title?: string; message?: string; error_data?: any; href?: string }>;
};

type WAChangeValue = {
  messages?: WAMessage[];
  statuses?: WAStatus[];
  metadata?: { phone_number_id?: string; display_phone_number?: string };
};

export type ParsedMessageType =
  | 'text'
  | 'audio'
  | 'image'
  | 'document'
  | 'video'
  | 'location'
  | 'sticker'
  | 'contact'
  | 'interactive';

export type MessageStatusValue = 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageCreatedEvent {
  kind: 'message_created';
  phoneNumberId: string | undefined;
  from: string;
  whatsappMessageId: string;
  messageType: ParsedMessageType;
  text?: string;
  caption?: string;
  mediaId?: string;
  mimeType?: string;
  filename?: string;
  replyToWhatsappMessageId?: string;
  structuredPayload?: Record<string, any>;
  timestamp?: string;
  raw: any;
}

export interface ReactionEvent {
  kind: 'message_reaction_added' | 'message_reaction_removed';
  phoneNumberId: string | undefined;
  from: string;
  whatsappMessageId: string;
  parentWhatsappMessageId: string;
  emoji: string | null;
  timestamp?: string;
  raw: any;
}

export interface StatusEvent {
  kind: 'message_status_updated';
  phoneNumberId: string | undefined;
  recipientId: string;
  whatsappMessageId: string;
  status: MessageStatusValue;
  errorCode?: number;
  errorMessage?: string;
  timestamp?: string;
  raw: any;
}

export type ParsedWAEvent = MessageCreatedEvent | ReactionEvent | StatusEvent;

const SUPPORTED_MESSAGE_TYPES: ParsedMessageType[] = [
  'text',
  'audio',
  'image',
  'document',
  'video',
  'location',
  'sticker',
  'contact',
  'interactive'
];

function isSupportedMessageType(t: string): t is ParsedMessageType {
  return (SUPPORTED_MESSAGE_TYPES as string[]).includes(t);
}

function isAllowedStatus(s: string): s is MessageStatusValue {
  return s === 'sent' || s === 'delivered' || s === 'read' || s === 'failed';
}

function buildInteractive(interactive: WAInteractive | undefined): {
  content?: string;
  payload: Record<string, any>;
} {
  if (!interactive) return { payload: {} };
  if (interactive.type === 'button_reply' && interactive.button_reply) {
    return {
      content: interactive.button_reply.title,
      payload: {
        type: 'button_reply',
        id: interactive.button_reply.id,
        title: interactive.button_reply.title
      }
    };
  }
  if (interactive.type === 'list_reply' && interactive.list_reply) {
    return {
      content: interactive.list_reply.title,
      payload: {
        type: 'list_reply',
        id: interactive.list_reply.id,
        title: interactive.list_reply.title,
        description: interactive.list_reply.description
      }
    };
  }
  return { payload: { type: interactive.type } };
}

function parseMessage(m: WAMessage, phoneNumberId: string | undefined): ParsedWAEvent | null {
  if (!m?.from || !m?.id) return null;

  // Reactions arrive inside the messages[] array with type === 'reaction'
  if (m.type === 'reaction' && m.reaction?.message_id) {
    const emoji = m.reaction.emoji && m.reaction.emoji.length > 0 ? m.reaction.emoji : null;
    return {
      kind: emoji ? 'message_reaction_added' : 'message_reaction_removed',
      phoneNumberId,
      from: m.from,
      whatsappMessageId: m.id,
      parentWhatsappMessageId: m.reaction.message_id,
      emoji,
      timestamp: m.timestamp,
      raw: m
    };
  }

  if (!isSupportedMessageType(m.type)) {
    return null;
  }

  const replyToWhatsappMessageId = m.context?.id;
  const base: MessageCreatedEvent = {
    kind: 'message_created',
    phoneNumberId,
    from: m.from,
    whatsappMessageId: m.id,
    messageType: m.type,
    timestamp: m.timestamp,
    replyToWhatsappMessageId,
    raw: m
  };

  switch (m.type) {
    case 'text':
      return { ...base, text: m.text?.body };
    case 'audio':
      return { ...base, mediaId: m.audio?.id, mimeType: m.audio?.mime_type };
    case 'image':
      return {
        ...base,
        mediaId: m.image?.id,
        mimeType: m.image?.mime_type,
        caption: m.image?.caption
      };
    case 'video':
      return {
        ...base,
        mediaId: m.video?.id,
        mimeType: m.video?.mime_type,
        caption: m.video?.caption
      };
    case 'document':
      return {
        ...base,
        mediaId: m.document?.id,
        mimeType: m.document?.mime_type,
        filename: m.document?.filename,
        caption: m.document?.caption
      };
    case 'sticker':
      return {
        ...base,
        mediaId: m.sticker?.id,
        mimeType: m.sticker?.mime_type,
        structuredPayload: { animated: m.sticker?.animated ?? false }
      };
    case 'location':
      return {
        ...base,
        structuredPayload: {
          latitude: m.location?.latitude,
          longitude: m.location?.longitude,
          name: m.location?.name,
          address: m.location?.address
        }
      };
    case 'contact':
      return {
        ...base,
        structuredPayload: { contacts: m.contacts ?? [] }
      };
    case 'interactive': {
      const { content, payload } = buildInteractive(m.interactive);
      return { ...base, text: content, structuredPayload: payload };
    }
    default:
      return null;
  }
}

function parseStatus(s: WAStatus, phoneNumberId: string | undefined): StatusEvent | null {
  if (!s?.id || !s?.status) return null;
  if (!isAllowedStatus(s.status)) return null;
  const error = s.errors?.[0];
  return {
    kind: 'message_status_updated',
    phoneNumberId,
    recipientId: s.recipient_id,
    whatsappMessageId: s.id,
    status: s.status,
    errorCode: error?.code,
    errorMessage: error?.message ?? error?.title,
    timestamp: s.timestamp,
    raw: s
  };
}

/**
 * Parse a WhatsApp Business webhook payload into a flat list of typed events.
 * Covers message creations (all 9 supported types), reactions, and outbound
 * status updates. Unknown message types are dropped (logged at the caller).
 */
export function parseWhatsAppEvents(payload: any): ParsedWAEvent[] {
  const out: ParsedWAEvent[] = [];
  const entries = payload?.entry ?? [];
  for (const entry of entries) {
    const changes = entry?.changes ?? [];
    for (const ch of changes) {
      const value: WAChangeValue = ch?.value ?? {};
      const phoneNumberId = value?.metadata?.phone_number_id;

      for (const m of value.messages ?? []) {
        const ev = parseMessage(m, phoneNumberId);
        if (ev) out.push(ev);
      }

      for (const s of value.statuses ?? []) {
        const ev = parseStatus(s, phoneNumberId);
        if (ev) out.push(ev);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Legacy adapter: existing webhook handler still consumes this shape until the
// per-vendor `whatsapp_conversation_parity` flag is rolled out 100%. Returns
// only message_created events, mapped into the previous narrow union so the
// legacy code path stays unchanged.
// ---------------------------------------------------------------------------

export type ParsedWAMessage = {
  phoneNumberId: string | undefined;
  from: string;
  type: 'text' | 'audio' | 'image' | 'document' | 'other';
  text?: string;
  whatsappMessageId?: string;
  raw: any;
};

export function parseWhatsAppPayload(payload: any): ParsedWAMessage[] {
  return parseWhatsAppEvents(payload)
    .filter((e): e is MessageCreatedEvent => e.kind === 'message_created')
    .map((e) => ({
      phoneNumberId: e.phoneNumberId,
      from: e.from,
      type: (['text', 'audio', 'image', 'document'].includes(e.messageType)
        ? e.messageType
        : 'other') as ParsedWAMessage['type'],
      text: e.text,
      whatsappMessageId: e.whatsappMessageId,
      raw: e.raw
    }));
}
