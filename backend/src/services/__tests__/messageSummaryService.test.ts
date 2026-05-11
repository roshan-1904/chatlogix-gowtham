/**
 * Unit Tests for Message Summary Service
 * Tests for generateMessageSummary, buildSummaryPrompt, and extractKeyInfoFromMessage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateMessageSummary } from '../messageSummaryService.js';
import { CustomerInsightsService } from '../customerInsightsService.js';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import OpenAI from 'openai';

// Mock dependencies
vi.mock('../../db/prisma.js');
vi.mock('../../config/env.js');
vi.mock('../customerInsightsService.js');
vi.mock('openai', () => ({
  default: vi.fn()
}));
vi.mock('../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('generateMessageSummary', () => {
  const mockMessageId = 'msg-123';
  const mockConversationId = 'conv-123';
  const mockCustomerId = 'customer-123';
  const mockVendorId = 'vendor-123';

  beforeEach(() => {
    vi.clearAllMocks();
    (env as any).OPENAI_API_KEY = 'test-api-key';
  });

  describe('Order Confirmation Flow', () => {
    it('should generate summary for customer providing name after being asked', async () => {
      const mockCustomerMessage = {
        content: 'Murali',
        senderType: 'customer'
      };
      const mockLastAssistantMessage = 'I need your name to confirm the order. Could you please provide your name?';
      const mockConversationContext = {
        conversationStage: 'order_confirmation',
        pendingOrder: {
          totalAmount: 339800,
          orderNumber: 'ORD-12345',
          items: [
            { name: 'Karuppu Kavuni Brownie', quantity: 2 }
          ]
        }
      };

      // Mock customer insights (no name yet)
      const mockInsights = {
        customerName: undefined,
        deliveryAddress: undefined,
        preferences: '',
        communicationStyle: ''
      };
      vi.spyOn(CustomerInsightsService.prototype, 'getOrCreateInsights').mockResolvedValue(mockInsights as any);

      // Mock OpenAI response
      const mockSummary = `What Happened: Customer provided name "Murali"
What Was Asked: Assistant asked for customer name to confirm order
Known Info: Customer Name: Murali (just provided), Pending Order: ₹3398
Missing Info: Delivery Address
Key Info Extracted: Name mentioned: Murali, Order confirmation in progress
Expected Next: Customer will provide delivery address or confirm order`;

      const mockCompletion = {
        choices: [{
          message: {
            content: mockSummary
          }
        }],
        usage: {
          prompt_tokens: 150,
          completion_tokens: 80,
          total_tokens: 230
        }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockCompletion);
      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate
          }
        }
      } as any));

      const result = await generateMessageSummary(
        mockMessageId,
        mockConversationId,
        mockCustomerId,
        mockVendorId,
        mockCustomerMessage,
        mockLastAssistantMessage,
        mockConversationContext
      );

      expect(result.summary).toContain('Murali');
      expect(result.summary).toContain('name');
      expect(result.summary).toContain('order');
      expect(result.expectedNext).toBeTruthy();
      expect(result.metadata?.tokensUsed).toBe(230);
      expect(result.metadata?.model).toBe('gpt-4o-mini');
    });

    it('should include known customer info in summary', async () => {
      const mockCustomerMessage = {
        content: 'What is my order status?',
        senderType: 'customer'
      };
      const mockLastAssistantMessage = 'Your order is being prepared.';
      const mockConversationContext = {
        conversationStage: 'order_status',
        pendingOrder: null
      };

      // Mock customer insights (name and address known)
      const mockInsights = {
        customerName: 'Murali',
        deliveryAddress: 'Tower 10 304, TVH Visita Heights',
        preferences: 'Prefers morning delivery',
        communicationStyle: 'Polite, uses respectful terms'
      };
      vi.spyOn(CustomerInsightsService.prototype, 'getOrCreateInsights').mockResolvedValue(mockInsights as any);

      const mockSummary = `What Happened: Customer asked about order status
What Was Asked: None
Known Info: Customer Name: Murali, Delivery Address: Tower 10 304, Preferences: Prefers morning delivery
Missing Info: None
Expected Next: Customer will wait for order update`;

      const mockCompletion = {
        choices: [{
          message: {
            content: mockSummary
          }
        }],
        usage: {
          prompt_tokens: 120,
          completion_tokens: 60,
          total_tokens: 180
        }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockCompletion);
      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate
          }
        }
      } as any));

      const result = await generateMessageSummary(
        mockMessageId,
        mockConversationId,
        mockCustomerId,
        mockVendorId,
        mockCustomerMessage,
        mockLastAssistantMessage,
        mockConversationContext
      );

      expect(result.summary).toContain('Murali');
      expect(result.summary).toContain('Known Info');
      expect(result.summary).toContain('Delivery Address');
    });
  });

  describe('Redundant Question Prevention', () => {
    it('should mark customer name as known info when already in insights', async () => {
      const mockCustomerMessage = {
        content: 'I want to order 2 boxes',
        senderType: 'customer'
      };
      const mockLastAssistantMessage = 'What would you like to order?';
      const mockConversationContext = {
        conversationStage: 'order_new',
        pendingOrder: null
      };

      // Mock customer insights (name already known)
      const mockInsights = {
        customerName: 'Murali',
        deliveryAddress: undefined,
        preferences: '',
        communicationStyle: ''
      };
      vi.spyOn(CustomerInsightsService.prototype, 'getOrCreateInsights').mockResolvedValue(mockInsights as any);

      const mockSummary = `What Happened: Customer wants to order 2 boxes
What Was Asked: None
Known Info: Customer Name: Murali
Missing Info: Delivery Address
Expected Next: Customer will provide more order details`;

      const mockCompletion = {
        choices: [{
          message: {
            content: mockSummary
          }
        }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockCompletion);
      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate
          }
        }
      } as any));

      const result = await generateMessageSummary(
        mockMessageId,
        mockConversationId,
        mockCustomerId,
        mockVendorId,
        mockCustomerMessage,
        mockLastAssistantMessage,
        mockConversationContext
      );

      expect(result.summary).toContain('Known Info');
      expect(result.summary).toContain('Murali');
      expect(result.summary).toContain('Missing Info');
    });
  });

  describe('Error Handling', () => {
    it('should return empty summary when OpenAI is not configured', async () => {
      (env as any).OPENAI_API_KEY = undefined;

      const result = await generateMessageSummary(
        mockMessageId,
        mockConversationId,
        mockCustomerId,
        mockVendorId,
        { content: 'Test', senderType: 'customer' },
        null,
        { conversationStage: 'greeting' }
      );

      expect(result.summary).toBe('');
      expect(result.expectedNext).toBe('');
    });

    it('should handle OpenAI API errors gracefully', async () => {
      vi.spyOn(CustomerInsightsService.prototype, 'getOrCreateInsights').mockResolvedValue({
        customerName: undefined,
        deliveryAddress: undefined,
        preferences: '',
        communicationStyle: ''
      } as any);

      const mockCreate = vi.fn().mockRejectedValue(new Error('API Error'));
      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate
          }
        }
      } as any));

      const result = await generateMessageSummary(
        mockMessageId,
        mockConversationId,
        mockCustomerId,
        mockVendorId,
        { content: 'Test', senderType: 'customer' },
        null,
        { conversationStage: 'greeting' }
      );

      expect(result.summary).toBe('');
      expect(result.expectedNext).toBe('');
    });

    it('should handle customer insights service errors gracefully', async () => {
      vi.spyOn(CustomerInsightsService.prototype, 'getOrCreateInsights').mockRejectedValue(
        new Error('Database error')
      );

      const result = await generateMessageSummary(
        mockMessageId,
        mockConversationId,
        mockCustomerId,
        mockVendorId,
        { content: 'Test', senderType: 'customer' },
        null,
        { conversationStage: 'greeting' }
      );

      expect(result.summary).toBe('');
      expect(result.expectedNext).toBe('');
    });
  });

  describe('Summary Generation with Different Contexts', () => {
    it('should generate summary without customer insights (new customer)', async () => {
      const mockCustomerMessage = {
        content: 'Hello',
        senderType: 'customer'
      };
      const mockLastAssistantMessage = null;
      const mockConversationContext = {
        conversationStage: 'greeting',
        pendingOrder: null
      };

      // Mock empty customer insights (new customer)
      const mockInsights = {
        customerName: undefined,
        deliveryAddress: undefined,
        preferences: '',
        communicationStyle: '',
        isNewCustomer: true
      };
      vi.spyOn(CustomerInsightsService.prototype, 'getOrCreateInsights').mockResolvedValue(mockInsights as any);

      const mockSummary = `What Happened: Customer sent greeting
What Was Asked: None
Known Info: None
Missing Info: Customer Name, Delivery Address
Expected Next: Customer will ask about products or place order`;

      const mockCompletion = {
        choices: [{
          message: {
            content: mockSummary
          }
        }],
        usage: {
          prompt_tokens: 80,
          completion_tokens: 40,
          total_tokens: 120
        }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockCompletion);
      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate
          }
        }
      } as any));

      const result = await generateMessageSummary(
        mockMessageId,
        mockConversationId,
        mockCustomerId,
        mockVendorId,
        mockCustomerMessage,
        mockLastAssistantMessage,
        mockConversationContext
      );

      expect(result.summary).toContain('greeting');
      expect(result.summary).toContain('Missing Info');
    });

    it('should include pending order information in summary', async () => {
      const mockCustomerMessage = {
        content: 'Yes, confirm it',
        senderType: 'customer'
      };
      const mockLastAssistantMessage = 'Would you like to confirm your order?';
      const mockConversationContext = {
        conversationStage: 'order_confirmation',
        pendingOrder: {
          totalAmount: 500000,
          orderNumber: 'ORD-67890',
          items: [
            { name: 'Product A', quantity: 3 },
            { name: 'Product B', quantity: 2 }
          ]
        }
      };

      const mockInsights = {
        customerName: 'John',
        deliveryAddress: '123 Main St',
        preferences: '',
        communicationStyle: ''
      };
      vi.spyOn(CustomerInsightsService.prototype, 'getOrCreateInsights').mockResolvedValue(mockInsights as any);

      const mockSummary = `What Happened: Customer confirmed order
What Was Asked: Assistant asked for order confirmation
Known Info: Customer Name: John, Delivery Address: 123 Main St, Pending Order: ₹5000
Missing Info: None
Expected Next: Order will be confirmed and processed`;

      const mockCompletion = {
        choices: [{
          message: {
            content: mockSummary
          }
        }],
        usage: {
          prompt_tokens: 140,
          completion_tokens: 70,
          total_tokens: 210
        }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockCompletion);
      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate
          }
        }
      } as any));

      const result = await generateMessageSummary(
        mockMessageId,
        mockConversationId,
        mockCustomerId,
        mockVendorId,
        mockCustomerMessage,
        mockLastAssistantMessage,
        mockConversationContext
      );

      expect(result.summary).toContain('₹5000');
      expect(result.summary).toContain('confirmed');
    });
  });
});

