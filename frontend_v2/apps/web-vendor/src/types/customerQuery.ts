export type CustomerQueryStatus =
  | 'open'
  | 'answered'
  | 'promoted_to_faq'
  | 'needs_catalog_fix'
  | 'dismissed';

export type CustomerQueryCategory = 'product' | 'policy' | 'other';

export interface CustomerQueryListItem {
  id: string;
  customerName: string | null;
  customerPhone: string;
  conversationId: string;
  questionEn: string;
  questionOriginal: string;
  category: CustomerQueryCategory;
  status: CustomerQueryStatus;
  hitCount: number;
  lastSeenAt: string;
  createdAt: string;
  productId?: string | null;
}

export interface CustomerQueryMessageSnippet {
  id: string;
  senderType: string;
  content: string;
  contentEn: string | null;
  timestamp: string;
}

export interface CustomerQueryDetail extends CustomerQueryListItem {
  vendorAnswerOriginal: string | null;
  vendorAnswerEn: string | null;
  faqId: string | null;
  dismissReason: string | null;
  answeredAt: string | null;
  messages: CustomerQueryMessageSnippet[];
}

export interface CustomerQueryListResponse {
  queries: CustomerQueryListItem[];
  page: number;
  pageSize: number;
  total: number;
}
