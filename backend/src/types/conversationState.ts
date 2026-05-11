import { z } from 'zod';

export const MetaSchema = z.object({
  vendorId: z.string(),
  vendorName: z.string().optional().default(''),
  conversationId: z.string(),
  customerId: z.string(),
  customerPhone: z.string().optional().default(''),
  locale: z.string().optional().default('en-IN'),
  currency: z.string().optional().default('INR'),
  nowIso: z.string()
});

export const CustomerSchema = z.object({
  basicDetails: z.string().optional().default(''),
  preferences: z.string().optional().default(''),
  communicationStyle: z.string().optional().default(''),
  deliveryAddress: z.string().optional().default(''),
  deliveryInstructions: z.string().optional().default(''),
  specialRequests: z.string().optional().default('')
});

export const OrderItemSchema = z.object({
  product: z.string(),
  quantity: z.number().nonnegative(),
  unit: z.string().optional(),
  unitPrice: z.number().nonnegative().optional().default(0),
  totalPrice: z.number().nonnegative().optional().default(0)
});

export const OrderTotalsSchema = z.object({
  subtotal: z.number().nonnegative().optional().default(0),
  tax: z.number().nonnegative().optional().default(0),
  shipping: z.number().nonnegative().optional().default(0),
  total: z.number().nonnegative().optional().default(0)
});

export const OrderSchema = z.object({
  status: z.enum(['draft', 'pending', 'confirmed']).optional().default('pending'),
  items: z.array(OrderItemSchema).optional().default([]),
  totals: OrderTotalsSchema.optional().default({}),
  deliveryDate: z.string().optional().default(''),
  deliveryTime: z.string().optional().default(''),
  deliveryAddress: z.string().optional().default(''),
  deliveryInstructions: z.string().optional().default(''),
  specialRequests: z.string().optional().default(''),
  notes: z.string().optional().default('')
});

export const ProductRecommendationSchema = z.object({
  product: z.string(),
  reason: z.string(),
  price: z.number().optional(),
  upsell: z.boolean().optional().default(false),
  qtySuggestion: z.string().optional()
});

export const LastMessageSchema = z.object({
  senderType: z.enum(['customer', 'assistant']),
  content: z.string(),
  timestamp: z.string()
});

export const VendorSchema = z.object({
  aiProducts: z.array(z.object({ name: z.string(), price: z.number().optional(), unit: z.string().optional() })).optional().default([]),
  aiPreparationTimeMinutes: z.number().optional().default(0)
});

export const ConversationStateSchema = z.object({
  schemaVersion: z.literal('1.0'),
  state: z.object({
    meta: MetaSchema,
    customer: CustomerSchema,
    order: OrderSchema,
    productRecommendations: z.array(ProductRecommendationSchema).optional().default([]),
    lastMessages: z.array(LastMessageSchema).optional().default([]),
    vendor: VendorSchema
  }),
  task: z.string()
});

export type ConversationState = z.infer<typeof ConversationStateSchema>;

// AI Response schema (echoed state + customerMessage + audit)
export const ConversationStateResponseSchema = z.object({
  schemaVersion: z.literal('1.0'),
  state: ConversationStateSchema.shape.state,
  customerMessage: z.string().min(1),
  audit: z.object({
    reasoning: z.string().optional().default(''),
    fieldsUpdated: z.array(z.string()).optional().default([])
  }).optional().default({})
});

export type ConversationStateResponse = z.infer<typeof ConversationStateResponseSchema>;

export function createEmptyConversationState(params: {
  vendorId: string;
  vendorName?: string;
  conversationId: string;
  customerId: string;
  customerPhone?: string;
  nowIso?: string;
}): ConversationState {
  return {
    schemaVersion: '1.0',
    state: {
      meta: {
        vendorId: params.vendorId,
        vendorName: params.vendorName || '',
        conversationId: params.conversationId,
        customerId: params.customerId,
        customerPhone: params.customerPhone || '',
        locale: 'en-IN',
        currency: 'INR',
        nowIso: params.nowIso || new Date().toISOString()
      },
      customer: {
        basicDetails: '',
        preferences: '',
        communicationStyle: '',
        deliveryAddress: '',
        deliveryInstructions: '',
        specialRequests: ''
      },
      order: {
        status: 'pending',
        items: [],
        totals: { subtotal: 0, tax: 0, shipping: 0, total: 0 },
        deliveryDate: '',
        deliveryTime: '',
        deliveryAddress: '',
        deliveryInstructions: '',
        specialRequests: '',
        notes: ''
      },
      productRecommendations: [],
      lastMessages: [],
      vendor: {
        aiProducts: [],
        aiPreparationTimeMinutes: 0
      }
    },
    task: 'Fill/normalize fields. Preserve existing values unless NEW info is clearly provided by customer.'
  };
}


