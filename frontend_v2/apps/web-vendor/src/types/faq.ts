/**
 * FAQ type definitions
 */

export interface Faq {
  id: string;
  vendorId: string;
  question: string;
  answer: string;
  isActive: boolean;
  embeddingPending?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FaqFormData {
  question: string;
  answer: string;
  isActive: boolean;
}
