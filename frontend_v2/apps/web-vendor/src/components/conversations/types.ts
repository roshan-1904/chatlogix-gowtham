export type MessageType =
  | 'text'
  | 'audio'
  | 'image'
  | 'document'
  | 'video'
  | 'location'
  | 'sticker'
  | 'contact'
  | 'interactive'
  | 'reaction'
  | string;

export type MessageStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | string;

export type MediaFetchState = 'pending' | 'ready' | 'failed' | 'expired' | string;

export interface PendingReplyTarget {
  id: string;
  contentPreview: string;
  contentEn?: string | null;
}

export interface MessageReplyPreview {
  id: string;
  contentPreview: string;
  /**
   * Vendor English for the quoted body, when the API sends it.
   * Preview uses `contentEn ?? contentPreview`.
   */
  contentEn?: string | null;
  type: MessageType;
  senderType: string;
  timestamp: string;
}

export interface MessageMediaInfo {
  state: MediaFetchState;
  mimeType?: string | null;
  filename?: string | null;
  caption?: string | null;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  fileSizeBytes?: number | null;
  /**
   * Authenticated API path (e.g. `/api/messages/<id>/media`) that streams
   * the file from S3. `null` when the media is not yet `ready`.
   */
  mediaUrl?: string | null;
}

export interface MessageReactionGroup {
  emoji: string;
  count: number;
  reactorIds: string[];
}

export interface MessageStatusEvent {
  id: string;
  status: MessageStatus;
  occurredAt: string;
  recordedAt?: string;
}

export interface Message {
  id: string;
  content: string;
  /**
   * Vendor-facing English (or Latin-script) rendering of `content`.
   * Thread shows English first with the original underneath when this differs
   * from `content`. List snippets use this when present.
   */
  contentEn?: string | null;
  timestamp: string;
  senderType: string;
  type: MessageType;
  /**
   * Conversation-parity additive fields (optional for backwards compat with the
   * legacy text-only payload while the per-vendor flag rolls out).
   */
  status?: MessageStatus;
  failureReason?: string | null;
  whatsappMessageId?: string | null;
  structuredPayload?: Record<string, unknown> | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  replyTo?: MessageReplyPreview | null;
  media?: MessageMediaInfo | null;
  reactions?: MessageReactionGroup[];
  /**
   * Only present when the API was called with `?includeStatusHistory=true`.
   */
  statusEvents?: MessageStatusEvent[];
}

export interface Conversation {
  id: string;
  vendorId: string;
  customerId: string;
  status: string;
  aiPaused?: boolean;
  updatedAt: string;
  createdAt: string;
  /**
   * Optional denormalized customer name for display.
   * This comes from CustomerInsights when available.
   */
  customerName?: string;
  customer: {
    id: string;
    phone: string;
  };
  _count?: {
    messages: number;
  };
  lastMessage: Message | null;
  /**
   * Optional insight / analytics fields.
   * These are all optional to support gradual backend rollout.
   */
  orderCount?: number;
  totalSpent?: number;
  hasActiveOrder?: boolean;
  activeOrderStatus?: string | null;
  lastMessageSender?: 'customer' | 'vendor' | 'ai' | string;
  minutesSinceLastMessage?: number;
}

export interface CustomerInsights {
  customerName?: string;
  alternativePhoneNumber?: string;
  email?: string;
  preferredLanguage?: string;
  basicDetails?: string;
  purchaseHistory?: string;
  preferences?: string;
  communicationStyle?: string;
  currentOrder?: string;
  primaryDeliveryAddress?: string;
  deliveryAddress?: string;
  deliveryInstructions?: string;
  whatsappLocation?: any;
  specialRequests?: string;
  specialOccasions?: any;
  dietaryRestrictions?: string;
  paymentPreferences?: string;
  lastUpdated?: string;
  createdAt?: string;
}

export interface OrderItem {
  product: string; // Product name
  productId?: string; // Product ID (for future mapping)
  quantity: number;
  unit?: string;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  matchedProductId?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  items: unknown; // Can be string (JSON) or array
  totalAmount: number;
  deliveryAddress?: string;
  deliveryInstructions?: string;
  specialRequests?: string;
  estimatedDelivery?: string;
  createdAt: string;
  confirmedAt?: string;
  customer?: {
    phone: string;
    id?: string;
  };
  vendor?: {
    businessName?: string;
    phone?: string;
  };
  conversation?: {
    id: string;
    messages?: Array<{
      content: string;
      senderType: string;
      timestamp: string;
    }>;
  };
  productIds?: string[]; // Array of product IDs (for future mapping)
  productMapping?: { [productName: string]: string }; // Product name to ID mapping
}

/**
 * Paginated conversations response (backend optimal shape).
 * All fields are optional so we can safely support the current
 * non-paginated array response as a fallback.
 */
export interface ConversationsResponse {
  conversations?: Conversation[];
  total?: number;
  page?: number;
  hasMore?: boolean;
}

/**
 * Cursor-based paginated messages response.
 */
export interface MessagesResponse {
  messages: Message[];
  hasMore: boolean;
  oldestMessageId: string | null;
  /**
   * Optional AI pause flag for this conversation.
   * Present in some legacy responses.
   */
  aiPaused?: boolean;
}

export interface SearchConversationsResponse extends ConversationsResponse {}


