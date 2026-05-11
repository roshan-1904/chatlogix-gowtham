/**
 * Unit Tests for Conversation Memory Service - AI-Powered Extraction
 * Tests for Gap 4 improvement: AI-powered memory extraction
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractKeyFacts, updateConversationMemory } from '../conversationMemoryService.js';
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

describe('extractKeyFacts - AI-Powered Extraction', () => {
  const mockConversationId = 'test-conv-123';
  const mockNormalizedMessage = "Hi, I'm Ravi. I want 5 boxes for my wife's birthday tomorrow.";

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: AI extraction enabled
    (env as any).USE_AI_MEMORY_EXTRACTION = 'true';
  });

  describe('AI Extraction Success', () => {
    it('should extract comprehensive information from conversation', async () => {
      const mockConversationHistory = [
        { content: "Hi, I'm Ravi. I want 5 boxes for my wife's birthday tomorrow.", senderType: 'customer', timestamp: new Date() },
        { content: 'Hello! I can help you with that.', senderType: 'assistant', timestamp: new Date() }
      ];

      const mockAIResponse = JSON.stringify({
        keyFacts: [
          'Customer name: Ravi',
          'Order quantity: 5 boxes',
          'Special occasion: birthday for wife on tomorrow'
        ],
        customerPreferences: {
          deliveryTime: 'unclear',
          paymentMethod: 'unclear'
        },
        customerInformation: {
          name: 'Ravi',
          addresses: [],
          specialOccasions: [{
            type: 'birthday',
            date: 'tomorrow',
            person: 'wife'
          }]
        },
        ongoingTopics: ['Order placement'],
        unclearInformation: [],
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
        mockNormalizedMessage,
        mockConversationHistory
      );

      expect(result.keyFacts).toContain('Customer name: Ravi');
      expect(result.keyFacts).toContain('Special occasion: birthday for wife on tomorrow');
      expect(mockAIService.generateResponse).toHaveBeenCalled();
    });

    it('should extract customer preferences correctly', async () => {
      const mockConversationHistory = [
        { content: 'I prefer cash payment and morning delivery', senderType: 'customer', timestamp: new Date() }
      ];

      const mockAIResponse = JSON.stringify({
        keyFacts: ['Customer prefers cash payment', 'Customer prefers morning delivery'],
        customerPreferences: {
          deliveryTime: 'morning',
          paymentMethod: 'cash',
          communicationStyle: 'polite'
        },
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
          customerPreferences: {}
        }),
        update: vi.fn().mockResolvedValue({})
      };

      const result = await extractKeyFacts(
        mockConversationId,
        'I prefer cash payment',
        mockConversationHistory
      );

      expect(result.keyFacts).toContain('Customer prefers morning delivery');
      expect(result.keyFacts).toContain('Payment preference: cash');
    });

    it('should handle unclear information gracefully', async () => {
      const mockConversationHistory = [
        { content: 'I want something for tomorrow, maybe evening time', senderType: 'customer', timestamp: new Date() }
      ];

      const mockAIResponse = JSON.stringify({
        keyFacts: ['Delivery date preference: tomorrow', 'Delivery time preference: evening'],
        customerPreferences: {
          deliveryDate: 'tomorrow',
          deliveryTime: 'evening'
        },
        customerInformation: {},
        ongoingTopics: [],
        unclearInformation: ['Delivery address not yet confirmed'],
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
        'I want something for tomorrow',
        mockConversationHistory
      );

      expect(result.keyFacts.some(fact => fact.includes('[NEEDS CLARIFICATION]'))).toBe(true);
    });
  });

  describe('Fallback Mechanism', () => {
    it('should fallback to keyword extraction when AI fails', async () => {
      const mockConversationHistory = [
        { content: 'I prefer morning delivery', senderType: 'customer', timestamp: new Date() }
      ];

      const mockAIService = {
        generateResponse: vi.fn().mockRejectedValue(new Error('AI service unavailable'))
      };
      (AIService as any).mockImplementation(() => mockAIService);

      (prisma as any).message = {
        findMany: vi.fn().mockResolvedValue(mockConversationHistory)
      };

      const result = await extractKeyFacts(
        mockConversationId,
        'I prefer morning delivery',
        mockConversationHistory
      );

      // Should still extract using keyword fallback
      expect(result.keyFacts).toContain('Customer prefers morning delivery');
    });

    it('should fallback when JSON parsing fails', async () => {
      const mockConversationHistory = [
        { content: 'I prefer morning delivery', senderType: 'customer', timestamp: new Date() }
      ];

      const mockAIService = {
        generateResponse: vi.fn().mockResolvedValue('Invalid JSON response')
      };
      (AIService as any).mockImplementation(() => mockAIService);

      (prisma as any).message = {
        findMany: vi.fn().mockResolvedValue(mockConversationHistory)
      };

      const result = await extractKeyFacts(
        mockConversationId,
        'I prefer morning delivery',
        mockConversationHistory
      );

      // Should fallback to keyword extraction
      expect(result.keyFacts).toContain('Customer prefers morning delivery');
    });

    it('should use keyword extraction when feature flag is disabled', async () => {
      (env as any).USE_AI_MEMORY_EXTRACTION = 'false';

      const mockConversationHistory = [
        { content: 'I prefer morning delivery and I am allergic to nuts', senderType: 'customer', timestamp: new Date() }
      ];

      const result = await extractKeyFacts(
        mockConversationId,
        'I prefer morning delivery',
        mockConversationHistory
      );

      expect(result.keyFacts).toContain('Customer prefers morning delivery');
      expect(result.keyFacts).toContain('Customer mentioned: allergic');
    });
  });

  describe('JSON Parsing', () => {
    it('should handle JSON wrapped in markdown code blocks', async () => {
      const mockConversationHistory = [
        { content: 'Test message', senderType: 'customer', timestamp: new Date() }
      ];

      const mockAIResponse = '```json\n' + JSON.stringify({
        keyFacts: ['Test fact'],
        customerPreferences: {},
        customerInformation: {},
        ongoingTopics: [],
        unclearInformation: [],
        importantContext: []
      }) + '\n```';

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
        'Test message',
        mockConversationHistory
      );

      expect(result.keyFacts).toContain('Test fact');
    });

    it('should handle plain JSON response', async () => {
      const mockConversationHistory = [
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
        findUnique: vi.fn().mockResolvedValue({
          customerPreferences: {}
        }),
        update: vi.fn().mockResolvedValue({})
      };

      const result = await extractKeyFacts(
        mockConversationId,
        'Test message',
        mockConversationHistory
      );

      expect(result.keyFacts).toContain('Test fact');
    });
  });

  describe('Data Transformation', () => {
    it('should transform structured data into keyFacts array', async () => {
      const mockConversationHistory = [
        { content: 'Test', senderType: 'customer', timestamp: new Date() }
      ];

      const mockAIResponse = JSON.stringify({
        keyFacts: ['Fact 1', 'Fact 2'],
        customerPreferences: {
          deliveryTime: 'evening',
          paymentMethod: 'cash'
        },
        customerInformation: {
          name: 'John',
          addresses: ['123 Main St']
        },
        ongoingTopics: ['Order'],
        unclearInformation: ['Need address'],
        importantContext: ['Context 1']
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
        'Test',
        mockConversationHistory
      );

      expect(result.keyFacts).toContain('Fact 1');
      expect(result.keyFacts).toContain('Fact 2');
      expect(result.keyFacts).toContain('Customer prefers evening delivery');
      expect(result.keyFacts).toContain('Payment preference: cash');
      expect(result.keyFacts).toContain('Customer name: John');
      expect(result.keyFacts).toContain('Customer address 1: 123 Main St');
      expect(result.keyFacts.some(fact => fact.includes('[NEEDS CLARIFICATION]'))).toBe(true);
      expect(result.keyFacts).toContain('Context 1');
    });

    it('should store structured data in customerPreferences', async () => {
      const mockConversationHistory = [
        { content: 'Test', senderType: 'customer', timestamp: new Date() }
      ];

      const mockAIResponse = JSON.stringify({
        keyFacts: [],
        customerPreferences: {
          deliveryTime: 'morning'
        },
        customerInformation: {
          name: 'Jane'
        },
        ongoingTopics: ['Topic 1'],
        unclearInformation: [],
        importantContext: []
      });

      const mockAIService = {
        generateResponse: vi.fn().mockResolvedValue(mockAIResponse)
      };
      (AIService as any).mockImplementation(() => mockAIService);

      const mockUpdate = vi.fn().mockResolvedValue({});
      (prisma as any).conversationMemory = {
        findUnique: vi.fn().mockResolvedValue({
          customerPreferences: {}
        }),
        update: mockUpdate
      };

      await extractKeyFacts(
        mockConversationId,
        'Test',
        mockConversationHistory
      );

      expect(mockUpdate).toHaveBeenCalled();
      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.data.customerPreferences).toHaveProperty('preferences');
      expect(updateCall.data.customerPreferences).toHaveProperty('information');
      expect(updateCall.data.customerPreferences).toHaveProperty('ongoingTopics');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty conversation history', async () => {
      const result = await extractKeyFacts(
        mockConversationId,
        mockNormalizedMessage,
        []
      );

      expect(result.keyFacts).toEqual([]);
    });

    it('should fetch conversation history if not provided', async () => {
      const mockMessages = [
        { content: 'Test message', senderType: 'customer', timestamp: new Date() }
      ];

      (prisma as any).message = {
        findMany: vi.fn().mockResolvedValue(mockMessages)
      };

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
        findUnique: vi.fn().mockResolvedValue({
          customerPreferences: {}
        }),
        update: vi.fn().mockResolvedValue({})
      };

      await extractKeyFacts(mockConversationId, mockNormalizedMessage);

      expect((prisma as any).message.findMany).toHaveBeenCalledWith({
        where: { conversationId: mockConversationId },
        orderBy: { timestamp: 'desc' },
        take: 30,
        select: {
          content: true,
          senderType: true,
          timestamp: true
        }
      });
    });

    it('should remove duplicate facts', async () => {
      const mockConversationHistory = [
        { content: 'Test', senderType: 'customer', timestamp: new Date() }
      ];

      const mockAIResponse = JSON.stringify({
        keyFacts: ['Duplicate fact', 'Duplicate fact', 'Unique fact'],
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
          customerPreferences: {}
        }),
        update: vi.fn().mockResolvedValue({})
      };

      const result = await extractKeyFacts(
        mockConversationId,
        'Test',
        mockConversationHistory
      );

      const uniqueFacts = [...new Set(result.keyFacts)];
      expect(result.keyFacts.length).toBe(uniqueFacts.length);
    });
  });
});

describe('updateConversationMemory - Enhanced', () => {
  const mockConversationId = 'test-conv-123';
  const mockVendorId = 'test-vendor-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should auto-extract key facts when conversation history is provided', async () => {
    const mockConversationHistory = [
      { content: "I'm Ravi, I want 5 boxes", senderType: 'customer', timestamp: new Date() }
    ];

    const mockAIResponse = JSON.stringify({
      keyFacts: ['Customer name: Ravi', 'Order quantity: 5 boxes'],
      customerPreferences: {},
      customerInformation: { name: 'Ravi' },
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

    await updateConversationMemory(mockConversationId, mockVendorId, {
      conversationHistory: mockConversationHistory,
      currentMessage: "I'm Ravi",
      incrementTurn: true
    });

    expect(mockAIService.generateResponse).toHaveBeenCalled();
  });

  it('should merge existing preferences with new structured data', async () => {
    const existingPreferences = {
      preferences: { deliveryTime: 'morning' }
    };

    const mockAIResponse = JSON.stringify({
      keyFacts: [],
      customerPreferences: { paymentMethod: 'cash' },
      customerInformation: {},
      ongoingTopics: [],
      unclearInformation: [],
      importantContext: []
    });

    const mockAIService = {
      generateResponse: vi.fn().mockResolvedValue(mockAIResponse)
    };
    (AIService as any).mockImplementation(() => mockAIService);

    const mockUpdate = vi.fn().mockResolvedValue({});
    (prisma as any).conversationMemory = {
      findUnique: vi.fn().mockResolvedValue({
        keyFacts: [],
        ongoingTopics: [],
        customerPreferences: existingPreferences,
        importantContext: [],
        turnNumber: 0,
        conversationStage: 'greeting'
      }),
      update: mockUpdate
    };

    await updateConversationMemory(mockConversationId, mockVendorId, {
      conversationHistory: [{ content: 'Test', senderType: 'customer', timestamp: new Date() }],
      currentMessage: 'Test',
      incrementTurn: true
    });

    const updateCall = mockUpdate.mock.calls[0][0];
    const mergedPrefs = updateCall.data.customerPreferences;
    expect(mergedPrefs.preferences.deliveryTime).toBe('morning');
    expect(mergedPrefs.preferences.paymentMethod).toBe('cash');
  });
});

