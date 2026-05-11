/**
 * Integration Tests for Memory Extraction
 * Tests full conversation flow with AI-powered memory extraction
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractKeyFacts, updateConversationMemory, retrieveConversationMemory } from '../conversationMemoryService.js';
import { extractAndSave } from '../dataExtractionService.js';
import { AIService } from '../aiService.js';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';

// Mock dependencies
vi.mock('../aiService.js');
vi.mock('../../config/env.js');
vi.mock('../../db/prisma.js');
vi.mock('../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));
vi.mock('../../utils/cacheStrategy.js', () => ({
  getCachedConversationMemory: vi.fn().mockResolvedValue(null),
  cacheConversationMemory: vi.fn(),
  invalidateConversationCache: vi.fn()
}));
vi.mock('../../utils/redis.js', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn()
}));

describe('Memory Extraction Integration Tests', () => {
  const mockConversationId = 'test-conv-integration-123';
  const mockVendorId = 'test-vendor-123';
  const mockCustomerId = 'test-customer-123';

  beforeEach(() => {
    vi.clearAllMocks();
    (env as any).USE_AI_MEMORY_EXTRACTION = 'true';
  });

  describe('Full Conversation Flow', () => {
    it('should extract and store memory throughout a conversation', async () => {
      const conversationHistory = [
        { content: "Hi, I'm Ravi", senderType: 'customer', timestamp: new Date('2024-01-01T10:00:00Z') },
        { content: 'Hello! How can I help you?', senderType: 'assistant', timestamp: new Date('2024-01-01T10:00:01Z') },
        { content: "I want 5 boxes for my wife's birthday tomorrow", senderType: 'customer', timestamp: new Date('2024-01-01T10:00:02Z') },
        { content: 'Great! What delivery address?', senderType: 'assistant', timestamp: new Date('2024-01-01T10:00:03Z') },
        { content: '123 Main St, please deliver in the morning', senderType: 'customer', timestamp: new Date('2024-01-01T10:00:04Z') }
      ];

      const mockAIResponse = JSON.stringify({
        keyFacts: [
          'Customer name: Ravi',
          'Order quantity: 5 boxes',
          'Special occasion: birthday for wife on tomorrow',
          'Delivery address: 123 Main St',
          'Delivery time preference: morning'
        ],
        customerPreferences: {
          deliveryTime: 'morning',
          deliveryDate: 'tomorrow'
        },
        customerInformation: {
          name: 'Ravi',
          addresses: ['123 Main St'],
          specialOccasions: [{
            type: 'birthday',
            date: 'tomorrow',
            person: 'wife'
          }]
        },
        ongoingTopics: ['Order placement'],
        unclearInformation: [],
        importantContext: ['Special occasion order']
      });

      const mockAIService = {
        generateResponse: vi.fn().mockResolvedValue(mockAIResponse)
      };
      (AIService as any).mockImplementation(() => mockAIService);

      (prisma as any).conversationMemory = {
        findUnique: vi.fn()
          .mockResolvedValueOnce(null) // First call - no memory exists
          .mockResolvedValue({
            keyFacts: [],
            ongoingTopics: [],
            customerPreferences: {},
            importantContext: [],
            turnNumber: 0,
            conversationStage: 'greeting'
          }),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({})
      };

      (prisma as any).message = {
        findMany: vi.fn().mockResolvedValue(conversationHistory)
      };

      // Simulate memory update after order creation
      await updateConversationMemory(mockConversationId, mockVendorId, {
        conversationHistory,
        currentMessage: '123 Main St, please deliver in the morning',
        incrementTurn: true
      });

      expect(mockAIService.generateResponse).toHaveBeenCalled();
      expect((prisma as any).conversationMemory.update).toHaveBeenCalled();
    });

    it('should handle memory update after order creation', async () => {
      const mockValidationResult = {
        isValid: true,
        validatedData: {
          orderItems: [
            { product: 'boxes', quantity: 5 }
          ]
        },
        errors: []
      };

      const mockResponse = {
        extractedData: {
          ongoingTopics: ['Order placement']
        }
      };

      const mockAIResponse = JSON.stringify({
        keyFacts: ['Order created: 5 boxes'],
        customerPreferences: {},
        customerInformation: {},
        ongoingTopics: ['Order placement'],
        unclearInformation: [],
        importantContext: []
      });

      const mockAIService = {
        generateResponse: vi.fn().mockResolvedValue(mockAIResponse)
      };
      (AIService as any).mockImplementation(() => mockAIService);

      (prisma as any).order = {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'order-123' })
      };

      (prisma as any).conversationMemory = {
        findUnique: vi.fn().mockResolvedValue({
          keyFacts: [],
          ongoingTopics: [],
          customerPreferences: {},
          importantContext: [],
          turnNumber: 0,
          conversationStage: 'greeting'
        }),
        update: vi.fn().mockResolvedValue({})
      };

      (prisma as any).message = {
        findMany: vi.fn().mockResolvedValue([
          { content: 'I want 5 boxes', senderType: 'customer', timestamp: new Date() }
        ])
      };

      await extractAndSave(
        mockResponse,
        mockValidationResult,
        mockConversationId,
        mockVendorId,
        mockCustomerId
      );

      expect((prisma as any).conversationMemory.update).toHaveBeenCalled();
    });
  });

  describe('Long Conversation Handling', () => {
    it('should handle conversations with 30+ messages', async () => {
      // Create 35 messages
      const longConversationHistory = Array.from({ length: 35 }, (_, i) => ({
        content: `Message ${i + 1}`,
        senderType: i % 2 === 0 ? 'customer' : 'assistant',
        timestamp: new Date(`2024-01-01T10:00:${String(i).padStart(2, '0')}Z`)
      }));

      const mockAIResponse = JSON.stringify({
        keyFacts: Array.from({ length: 10 }, (_, i) => `Fact ${i + 1}`),
        customerPreferences: {},
        customerInformation: {},
        ongoingTopics: [],
        unclearInformation: [],
        importantContext: []
      });

      const mockAIService = {
        generateResponse: vi.fn().mockResolvedValue(mockAIResponse)
      };
      (AIService as any).mockImplementation(() => mockAIService);

      (prisma as any).conversationMemory = {
        findUnique: vi.fn().mockResolvedValue({
          keyFacts: [],
          ongoingTopics: [],
          customerPreferences: {},
          importantContext: [],
          turnNumber: 0,
          conversationStage: 'greeting'
        }),
        update: vi.fn().mockResolvedValue({})
      };

      const result = await extractKeyFacts(
        mockConversationId,
        'Latest message',
        longConversationHistory.slice(-30) // Should use last 30 messages
      );

      expect(result.keyFacts.length).toBeGreaterThan(0);
      expect(mockAIService.generateResponse).toHaveBeenCalled();
    });
  });

  describe('Unclear Information Handling', () => {
    it('should extract and mark unclear information for clarification', async () => {
      const conversationHistory = [
        { content: 'I want something for tomorrow, maybe evening time', senderType: 'customer', timestamp: new Date() },
        { content: 'Not sure about the address yet', senderType: 'customer', timestamp: new Date() }
      ];

      const mockAIResponse = JSON.stringify({
        keyFacts: [
          'Delivery date preference: tomorrow',
          'Delivery time preference: evening',
          '[NEEDS CLARIFICATION] Delivery address not yet confirmed'
        ],
        customerPreferences: {
          deliveryDate: 'tomorrow',
          deliveryTime: 'evening'
        },
        customerInformation: {},
        ongoingTopics: [],
        unclearInformation: ['Delivery address not yet confirmed - customer will provide later'],
        importantContext: []
      });

      const mockAIService = {
        generateResponse: vi.fn().mockResolvedValue(mockAIResponse)
      };
      (AIService as any).mockImplementation(() => mockAIService);

      (prisma as any).conversationMemory = {
        findUnique: vi.fn().mockResolvedValue({
          customerPreferences: {}
        }),
        update: vi.fn().mockResolvedValue({})
      };

      const result = await extractKeyFacts(
        mockConversationId,
        'Not sure about the address yet',
        conversationHistory
      );

      const unclearFacts = result.keyFacts.filter(fact => fact.includes('[NEEDS CLARIFICATION]'));
      expect(unclearFacts.length).toBeGreaterThan(0);
    });
  });

  describe('Memory Retrieval After Update', () => {
    it('should retrieve updated memory with extracted facts', async () => {
      const storedMemory = {
        keyFacts: ['Customer name: Ravi', 'Delivery preference: morning'],
        ongoingTopics: ['Order placement'],
        customerPreferences: {
          preferences: { deliveryTime: 'morning' },
          information: { name: 'Ravi' }
        },
        conversationSummary: 'Customer Ravi wants to place an order',
        importantContext: [],
        turnNumber: 5,
        conversationStage: 'information_gathering'
      };

      (prisma as any).conversationMemory = {
        findUnique: vi.fn().mockResolvedValue(storedMemory)
      };

      (prisma as any).message = {
        findMany: vi.fn().mockResolvedValue([])
      };

      const memory = await retrieveConversationMemory({
        conversationId: mockConversationId,
        vendorId: mockVendorId,
        normalizedMessage: 'Test'
      });

      expect(memory.keyFacts).toContain('Customer name: Ravi');
      expect(memory.customerPreferences.preferences.deliveryTime).toBe('morning');
    });
  });

  describe('Error Recovery', () => {
    it('should recover from AI failure and use fallback', async () => {
      const conversationHistory = [
        { content: 'I prefer morning delivery', senderType: 'customer', timestamp: new Date() }
      ];

      const mockAIService = {
        generateResponse: vi.fn()
          .mockRejectedValueOnce(new Error('AI service unavailable'))
          .mockRejectedValueOnce(new Error('Retry failed'))
      };
      (AIService as any).mockImplementation(() => mockAIService);

      (prisma as any).message = {
        findMany: vi.fn().mockResolvedValue(conversationHistory)
      };

      const result = await extractKeyFacts(
        mockConversationId,
        'I prefer morning delivery',
        conversationHistory
      );

      // Should fallback to keyword extraction
      expect(result.keyFacts).toContain('Customer prefers morning delivery');
    });

    it('should handle database errors gracefully', async () => {
      const conversationHistory = [
        { content: 'Test message', senderType: 'customer', timestamp: new Date() }
      ];

      const mockAIResponse = JSON.stringify({
        keyFacts: ['Test fact'],
        customerPreferences: {},
        customerInformation: {},
        ongoingTopics: [],
        unclearInformation: [],
        importantContext: []
      });

      const mockAIService = {
        generateResponse: vi.fn().mockResolvedValue(mockAIResponse)
      };
      (AIService as any).mockImplementation(() => mockAIService);

      (prisma as any).conversationMemory = {
        findUnique: vi.fn().mockRejectedValue(new Error('Database error')),
        update: vi.fn().mockRejectedValue(new Error('Database error'))
      };

      // Should not throw, but handle error gracefully
      const result = await extractKeyFacts(
        mockConversationId,
        'Test message',
        conversationHistory
      );

      // Should still return facts even if database update fails
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

