/**
 * Multi-Stage AI Processing Orchestrator
 * 
 * Coordinates execution of all stages (0-9) for multi-stage AI processing
 * 
 * Reference:
 * - Phase 4: Stage Execution Orchestrator (Implementation Plan)
 * - Proposed Multi-Stage Architecture (Requirements Document)
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import { MultiStageResponse, StageContext, StageExecutionResult } from '../types/multiStage.js';
import {
  fallbackNormalization,
  fallbackIntentClassification,
  fallbackAIResponse,
  fallbackMessageComposition,
  fallbackIntentPrioritization,
  fallbackCorrectionDetection,
  fallbackOrderUpdateValidation,
  fallbackProactiveAssistance,
  fallbackResponseRefinement,
  fallbackDataValidation,
  fallbackQualityAssessment
} from './stageFallbacks.js';
import { AIService } from './aiService.js';
import { publishToQueue } from '../queue/sqsClient.js';
import { env } from '../config/env.js';

// Import actual services (Phase 5 implementations)
import { retrieveConversationMemory, setHandoffConfirmationStatus, updateConversationMemory } from './conversationMemoryService.js';
import { invalidateConversationCache } from '../utils/cacheStrategy.js';
import {
  extractOngoingTopicsFromIntent,
  extractOngoingTopicsFromResponse,
  extractPreferencesFromInsights,
  extractPreferencesFromExtractedData,
  validateClarificationNeeds
} from './memoryUpdateHelpers.js';
import { normalizeMessage } from './messageNormalizationService.js';
import { classifyIntent } from './intentClassificationService.js';
import { prioritizeIntents } from './intentPrioritizationService.js';
import { detectCorrection } from './correctionDetectionService.js';
import { fetchRelevantData } from './contextFetcherService.js';
import { buildFocusedPrompt } from './promptBuilderService.js';
import { generatePrimaryAIResponse } from './primaryAIResponseService.js';
import { validateOrderUpdate } from './orderUpdateValidationService.js';
import { generateProactiveAssistance } from './proactiveAssistanceService.js';
import { refineResponse } from './responseRefinementService.js';
import { composeMessage } from './messageCompositionService.js';
import { validateExtractedData, validateOrderConfirmation, validateOrderCancellation, validateRepeatOrder, formatValidationErrors } from './dataValidationService.js';
import { extractAndSave } from './dataExtractionService.js';
import { assessQuality } from './qualityAssessmentService.js';
import { queueResponse } from './responseQueuingService.js';
import { enrichWithAdditionalData } from './dataEnrichmentService.js';
import { humanHandoffService } from './humanHandoffService.js';
import { WhatsAppTemplateService } from './whatsappTemplateService.js';
import { getMultiStageLogger, cleanupLogger } from './multiStageLoggingService.js';
import { calculateCostFromUsage, aggregateCostBreakdown } from '../utils/costCalculator.js';
import { executeUnifiedAI } from './unifiedAIProcessorService.js';

const aiService = new AIService();
const whatsappTemplateService = new WhatsAppTemplateService();

// Stage timeout limits (ms). Exceeding these causes the stage catch block to run its fallback.
const STAGE_TIMEOUTS: Record<string, number> = {
  stage_0:   5_000,  // normalization
  stage_1:   8_000,  // intent classification
  stage_1_5: 6_000,  // intent prioritization
  stage_1_7: 5_000,  // correction detection
  stage_4:  15_000,  // primary AI response (largest model, most time)
  stage_4_7: 8_000,  // proactive assistance
  stage_6:  10_000,  // response refinement
  stage_8_5: 8_000,  // quality assessment
};

export class MultiStageOrchestrator {
  private stagesExecuted: string[] = [];
  private stagesSkipped: string[] = [];
  private totalTokensUsed = 0;
  private totalCost = 0;
  private totalDuration = 0;
  private errors: Array<{ stage: string; error: string }> = [];
  private stageCosts: Map<string, { tokens: number; cost: number; model?: string; promptTokens?: number; completionTokens?: number }> = new Map();

  /**
   * Race a promise against a timeout. On timeout the stage's existing catch block
   * runs its fallback — no additional error handling needed here.
   */
  private withTimeout<T>(promise: Promise<T>, stageName: string): Promise<T> {
    const ms = STAGE_TIMEOUTS[stageName.replace('.', '_')];
    if (!ms) return promise; // no timeout configured for this stage
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Stage ${stageName} timed out after ${ms}ms`)), ms)
      )
    ]);
  }

  /**
   * Execute the complete multi-stage pipeline
   */
  async execute(context: StageContext): Promise<MultiStageResponse> {
    const startTime = Date.now();
    const stageLogger = getMultiStageLogger(context); // MOVE THIS TO START - fixes logging bug
    
    // Reset stage costs tracking for this execution
    this.stageCosts.clear();

    try {
      // Stage 0.5: Conversation Memory Retrieval (moved first — enables fast-path check before any AI calls)
      const memory = await this.executeStage0_5(context);
      context.memory = memory;

      // Fast path: pattern-based classification for simple messages — bypasses all AI stages
      const fastPathResult = this.checkFastPath(context.rawMessage, memory);
      if (fastPathResult) {
        return await this.handleFastPath(context, fastPathResult, startTime);
      }

      // -----------------------------------------------------------------------
      // Unified pipeline: Stages 0 + 1 + 1.5 + 1.7 + 2 + 3 + 4 + 6 → 1 AI call
      // -----------------------------------------------------------------------
      await this.executeUnifiedPipeline(context, startTime);
      const intentResult = context.intentResult!;
      const aiResponse   = context.aiResponse!;

      // Handoff Confirmation Check — tightened to avoid misrouting normal requests
      // as handoff confirmations. Only *standalone* affirmatives should confirm.
      if (context.memory?.handoffConfirmationPending) {
        const rawMsg = (context.normalizedMessage?.cleaned || context.rawMessage);
        const lowerMsg = rawMsg.toLowerCase();
        const trimmed = lowerMsg.trim();

        // Standalone affirmative only (e.g., "yes", "ok", "sure", "confirm", "pause").
        // Does NOT match "Yes please, I'd like to order..." — that's a new request.
        const standaloneAffirmative = /^\s*(yes|yeah|yep|sure|okay|ok|confirm|pause)\s*[.!]*\s*$/.test(trimmed);

        // If the message is clearly a fresh request (longer than 30 chars OR maps to
        // an order/product intent), clear the pending flag and fall through to normal
        // processing. This prevents "Yes please, I'd like to order..." from being
        // swallowed by the handoff flow.
        const orderLikeIntents = ['order_new', 'order_update', 'confirm_order', 'cancel_order', 'order_status', 'product_inquiry'];
        const isFreshRequest = rawMsg.length > 30 || orderLikeIntents.includes(intentResult.primaryIntent);

        if (!standaloneAffirmative && isFreshRequest) {
          logger.info({ conversationId: context.conversationId, intent: intentResult.primaryIntent }, 'Clearing stale handoffConfirmationPending — message is a fresh request');
          await setHandoffConfirmationStatus(context.conversationId, false);
          // fall through to normal pipeline
        } else {
        const isConfirmed = standaloneAffirmative;

        if (isConfirmed) {
          logger.info({ conversationId: context.conversationId }, 'Handoff confirmed by user');
          try {
            await updateConversationMemory(context.conversationId, context.vendorId, {
              currentMessage: context.rawMessage,
              ongoingTopics: ['Support confirmed'],
              incrementTurn: false
            });
          } catch (error) {
            logger.warn({ err: error }, 'Failed to update memory on handoff confirmation');
          }
          const handoffResult = await humanHandoffService.executeHandoff(context.conversationId, context.vendorId);
          await setHandoffConfirmationStatus(context.conversationId, false);
          const finalMessage = handoffResult.message;
          this.stagesSkipped.push('stage_4.5', 'stage_4.7', 'stage_5', 'stage_7', 'stage_7.5', 'stage_8', 'stage_8.5');
          await this.executeStage9(context, finalMessage);
          this.totalDuration = Date.now() - startTime;
          await this.logExecutionSummary(context);
          stageLogger.logFinalResult(finalMessage, 'support_confirmed', {}, this.stagesExecuted, this.stagesSkipped);
          stageLogger.save();
          cleanupLogger(context.messageId);
          return {
            finalMessage,
            intent: 'support_confirmed',
            extractedData: {},
            stagesExecuted: this.stagesExecuted,
            stagesSkipped: this.stagesSkipped,
            totalTokensUsed: this.totalTokensUsed,
            totalCost: this.totalCost,
            qualityScore: undefined
          };
        } else {
          logger.info({ conversationId: context.conversationId }, 'Handoff cancelled by user');
          await setHandoffConfirmationStatus(context.conversationId, false);
          if (lowerMsg.includes('no') || lowerMsg.includes('cancel')) {
            try {
              await updateConversationMemory(context.conversationId, context.vendorId, {
                currentMessage: context.rawMessage,
                ongoingTopics: ['Support cancelled'],
                incrementTurn: false
              });
            } catch (error) {
              logger.warn({ err: error }, 'Failed to update memory on handoff cancellation');
            }
            const finalMessage = "Okay, I will continue to assist you. How can I help?";
            this.stagesSkipped.push('stage_4.5', 'stage_4.7', 'stage_5', 'stage_7', 'stage_7.5', 'stage_8', 'stage_8.5');
            await this.executeStage9(context, finalMessage);
            this.totalDuration = Date.now() - startTime;
            await this.logExecutionSummary(context);
            stageLogger.logFinalResult(finalMessage, 'support_cancelled', {}, this.stagesExecuted, this.stagesSkipped);
            stageLogger.save();
            cleanupLogger(context.messageId);
            return {
              finalMessage,
              intent: 'support_cancelled',
              extractedData: {},
              stagesExecuted: this.stagesExecuted,
              stagesSkipped: this.stagesSkipped,
              totalTokensUsed: this.totalTokensUsed,
              totalCost: this.totalCost,
              qualityScore: undefined
            };
          }
        }
        } // close fresh-request else branch
      }

      // Support Intent early exit — suppress duplicate prompts if already pending
      if (intentResult.primaryIntent === 'support' && context.memory?.handoffConfirmationPending) {
        logger.info({ conversationId: context.conversationId }, 'Support intent while handoff already pending — skipping duplicate prompt');
      } else
      if (intentResult.primaryIntent === 'support') {
        logger.info({ conversationId: context.conversationId }, 'Support intent detected, asking for confirmation');
        try {
          await updateConversationMemory(context.conversationId, context.vendorId, {
            currentMessage: context.rawMessage,
            ongoingTopics: ['Support request'],
            incrementTurn: false
          });
        } catch (error) {
          logger.warn({ err: error }, 'Failed to update memory on support exit');
        }
        await setHandoffConfirmationStatus(context.conversationId, true);
        const finalMessage = "Do you want to pause the AI and connect to a human agent? Reply 'Yes' to confirm.";
        this.stagesSkipped.push('stage_4.5', 'stage_4.7', 'stage_5', 'stage_7', 'stage_7.5', 'stage_8', 'stage_8.5');
        await this.executeStage9(context, finalMessage);
        this.totalDuration = Date.now() - startTime;
        await this.logExecutionSummary(context);
        stageLogger.logFinalResult(finalMessage, 'support_request', {}, this.stagesExecuted, this.stagesSkipped);
        stageLogger.save();
        cleanupLogger(context.messageId);
        return {
          finalMessage,
          intent: 'support_request',
          extractedData: {},
          stagesExecuted: this.stagesExecuted,
          stagesSkipped: this.stagesSkipped,
          totalTokensUsed: this.totalTokensUsed,
          totalCost: this.totalCost,
          qualityScore: undefined
        };
      }

      // Stage 4.7: Proactive assistance — fire immediately after unified call (non-blocking)
      // Collected with a short timeout before Stage 7; skipped if not finished in time.
      const stage4_7Promise = this.executeStage4_7(context);

      // Stage 4.5: Order Update Validation (conditional — same as before)
      if (intentResult.primaryIntent === 'order_update') {
        await this.executeStage4_5(context, aiResponse);
      } else {
        this.stagesSkipped.push('stage_4.5');
        stageLogger.logSkippedStage('stage_4.5', `Intent is ${intentResult.primaryIntent}, not order_update`);
      }

      // Stages 5 + 6 are handled by the unified call natively — always skipped
      this.stagesSkipped.push('stage_5', 'stage_6');
      stageLogger.logSkippedStage('stage_5', 'Unified call handles clarification natively');
      stageLogger.logSkippedStage('stage_6', 'Unified call handles response refinement natively');

      // Collect Stage 4.7 result — 300 ms window; skip suggestions if not done yet
      const proactive4_7 = await Promise.race([
        stage4_7Promise,
        new Promise<null>(resolve => setTimeout(() => resolve(null), 300))
      ]);
      if (proactive4_7) context.proactiveAssistance = proactive4_7;

      context.refinedResponse = aiResponse; // Refinement already done in unified call
      const refinedResponse = context.refinedResponse;

      // Stage 7: Message Composition
      const finalMessage = await this.executeStage7(context, refinedResponse);

      // Stage 7.5: Data Validation
      const validationResult = await this.executeStage7_5(context, refinedResponse);
      context.validationResult = validationResult;

      // Stage 8: Database Update
      await this.executeStage8(context, refinedResponse, validationResult);

      // Stage 8.5: Quality Assessment (async, fire-and-forget - doesn't block response)
      this.executeStage8_5(context, finalMessage, refinedResponse)
        .catch(err => logger.warn({ err, conversationId: context.conversationId }, 'Quality assessment failed'));
      // Don't wait - continue to Stage 9 immediately

      // Stage 9: Response Queuing
      await this.executeStage9(context, finalMessage);

      // Stage 9.5: Generate Message Summary (async, non-blocking)
      this.executeStage9_5(context, finalMessage);

      this.totalDuration = Date.now() - startTime;

      await this.logExecutionSummary(context);
      
      stageLogger.logFinalResult(
        finalMessage,
        intentResult.primaryIntent,
        refinedResponse.extractedData || {},
        this.stagesExecuted,
        this.stagesSkipped
      );
      stageLogger.save();
      cleanupLogger(context.messageId);

      return {
        finalMessage,
        intent: intentResult.primaryIntent,
        extractedData: refinedResponse.extractedData || {},
        stagesExecuted: this.stagesExecuted,
        stagesSkipped: this.stagesSkipped,
        totalTokensUsed: this.totalTokensUsed,
        totalCost: this.totalCost,
        qualityScore: undefined, // Stage 8.5 runs async, quality score not available immediately
        // Legacy compatibility
        tokensUsed: this.totalTokensUsed,
        orderUpdateEvent: refinedResponse.extractedData?.orderUpdateType ? {
          action: 'update',
          orderItems: refinedResponse.extractedData.orderItems
        } : undefined
      };
    } catch (error) {
      logger.error({
        err: error as Error,
        conversationId: context.conversationId,
        vendorId: context.vendorId,
        messageId: context.messageId
      }, 'Multi-stage execution failed');
      
      // Log error and save before fallback
      // stageLogger is already available from the top of execute() method
      stageLogger.logStage(
        'ERROR',
        'error',
        'execute',
        context,
        { error: (error as Error).message },
        Date.now() - startTime,
        {
          success: false,
          error: error as Error
        }
      );
      stageLogger.save();
      cleanupLogger(context.messageId);
      
      return await this.executeFallback(context);
    }
  }

  /**
   * Stage 0: Message Normalization
   */
  private async executeStage0(context: StageContext): Promise<any> {
    const stageStart = Date.now();
    const stageName = 'stage_0';
    const stageLogger = getMultiStageLogger(context);

    try {
      const inputData = {
        rawMessage: context.rawMessage,
        vendorId: context.vendorId
      };
      
      const result = await this.withTimeout(normalizeMessage(context.rawMessage, context.vendorId), 'stage_0');

      stageLogger.logStage(
        stageName,
        '0',
        'normalizeMessage',
        inputData,
        result,
        Date.now() - stageStart,
        {
          success: true,
          tokensUsed: result.tokensUsed || 0,
          cost: result.cost || 0
        }
      );

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: result.tokensUsed || 0,
        cost: result.cost || 0,
        promptTokens: (result as any).promptTokens,
        completionTokens: (result as any).completionTokens,
        model: 'gpt-4o-mini'
      });

      this.stagesExecuted.push(stageName);
      this.totalTokensUsed += result.tokensUsed || 0;
      this.totalCost += result.cost || 0;

      return result;
    } catch (error) {
      const fallbackResult = fallbackNormalization(context.rawMessage);
      
      stageLogger.logStage(
        stageName,
        '0',
        'normalizeMessage',
        { rawMessage: context.rawMessage, vendorId: context.vendorId },
        fallbackResult,
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: true
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
      return fallbackResult;
    }
  }

  /**
   * Stage 0.5: Conversation Memory Retrieval
   */
  private async executeStage0_5(context: StageContext): Promise<any> {
    const stageStart = Date.now();
    const stageName = 'stage_0.5';
    const stageLogger = getMultiStageLogger(context);

    try {
      // Check if this is the first customer message
      const customerMessageCount = await prisma.message.count({
        where: {
          conversationId: context.conversationId,
          senderType: 'customer'
        }
      });
      
      // Set isFirstMessage flag if this is the first customer message (count === 1)
      context.isFirstMessage = customerMessageCount === 1;
      
      const inputData = {
        conversationId: context.conversationId,
        vendorId: context.vendorId,
        normalizedMessage: context.normalizedMessage?.cleaned || context.rawMessage
      };
      
      const memory = await retrieveConversationMemory(inputData);

      // Log database read operation
      stageLogger.logStage(
        stageName,
        '0.5',
        'retrieveConversationMemory',
        inputData,
        memory,
        Date.now() - stageStart,
        {
          success: true,
          databaseReads: [{
            table: 'ConversationMemory',
            query: 'SELECT * WHERE conversationId = ? AND vendorId = ?',
            filters: { conversationId: context.conversationId, vendorId: context.vendorId },
            resultCount: memory ? 1 : 0,
            data: memory
          }]
        }
      );

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: 0,
        cost: 0
      });

      this.stagesExecuted.push(stageName);
      return memory;
    } catch (error) {
      const fallbackMemory = {
        keyFacts: [],
        ongoingTopics: [],
        customerPreferences: {},
        conversationSummary: 'Memory unavailable',
        importantContext: [],
        turnNumber: 0,
        conversationStage: 'greeting' as const
      };
      
      stageLogger.logStage(
        stageName,
        '0.5',
        'retrieveConversationMemory',
        { conversationId: context.conversationId, vendorId: context.vendorId },
        fallbackMemory,
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: true
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
      return fallbackMemory;
    }
  }

  /**
   * Stage 1: Intent Understanding
   */
  private async executeStage1(context: StageContext): Promise<any> {
    const stageStart = Date.now();
    const stageName = 'stage_1';
    const stageLogger = getMultiStageLogger(context);

    try {
      // ENHANCEMENT: Fetch more messages for better context understanding (increased from 5 to 10)
      const lastMessages = await prisma.message.findMany({
        where: { conversationId: context.conversationId },
        orderBy: { timestamp: 'desc' },
        take: 10, // Increased from 5 for better context retention
        select: {
          senderType: true,
          content: true,
          timestamp: true
        }
      });

      const inputData = {
        normalizedMessage: context.normalizedMessage || { cleaned: context.rawMessage },
        memory: context.memory || {
          keyFacts: [],
          ongoingTopics: [],
          customerPreferences: {},
          conversationSummary: '',
          importantContext: [],
          turnNumber: 0,
          conversationStage: 'greeting'
        },
        lastMessages: lastMessages.reverse(),
        vendorId: context.vendorId
      };

      const result = await this.withTimeout(
        classifyIntent(
          inputData.normalizedMessage,
          inputData.memory,
          inputData.lastMessages,
          inputData.vendorId,
          context.conversationId
        ),
        'stage_1'
      );

      stageLogger.logStage(
        stageName,
        '1',
        'classifyIntent',
        inputData,
        result,
        Date.now() - stageStart,
        {
          success: true,
          tokensUsed: result.tokensUsed || 0,
          cost: result.cost || 0,
          aiResponse: result,
          decision: {
            type: 'intent_classification',
            reason: result.reasoning || 'Intent classified based on message content',
            outcome: {
              primaryIntent: result.primaryIntent,
              confidence: result.confidence,
              secondaryIntents: result.secondaryIntents
            }
          },
          databaseReads: [{
            table: 'Message',
            query: 'SELECT * WHERE conversationId = ? ORDER BY timestamp DESC LIMIT 5',
            filters: { conversationId: context.conversationId },
            resultCount: lastMessages.length,
            data: lastMessages
          }]
        }
      );

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: result.tokensUsed || 0,
        cost: result.cost || 0,
        promptTokens: (result as any).promptTokens,
        completionTokens: (result as any).completionTokens,
        model: 'gpt-4o-mini' // Stage 1 uses gpt-4o-mini
      });

      this.stagesExecuted.push(stageName);
      this.totalTokensUsed += result.tokensUsed || 0;
      this.totalCost += result.cost || 0;

      return result;
    } catch (error) {
      const fallbackResult = fallbackIntentClassification(context.rawMessage);
      
      stageLogger.logStage(
        stageName,
        '1',
        'classifyIntent',
        { rawMessage: context.rawMessage },
        fallbackResult,
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: true
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
      return fallbackResult;
    }
  }

  /**
   * Stage 1.5: Intent Prioritization
   */
  private async executeStage1_5(context: StageContext): Promise<any> {
    const stageStart = Date.now();
    const stageName = 'stage_1.5';
    const stageLogger = getMultiStageLogger(context);

    try {
      const intentResult = context.intentResult!;
      const inputData = {
        primaryIntent: intentResult.primaryIntent,
        secondaryIntents: intentResult.secondaryIntents || [],
        normalizedMessage: context.normalizedMessage?.cleaned || context.rawMessage
      };

      const result = await this.withTimeout(
        prioritizeIntents(
          inputData.primaryIntent,
          inputData.secondaryIntents,
          inputData.normalizedMessage
        ),
        'stage_1_5'
      );

      stageLogger.logStage(
        stageName,
        '1.5',
        'prioritizeIntents',
        inputData,
        result,
        Date.now() - stageStart,
        {
          success: true,
          decision: {
            type: 'intent_prioritization',
            reason: 'Prioritized multiple intents',
            outcome: {
              intentOrder: result.intentOrder || [],
              handlingStrategy: result.handlingStrategy
            }
          }
        }
      );

      const costCalc = result.cost !== undefined ? result.cost : 0;
      const tokensCalc = result.tokensUsed !== undefined ? result.tokensUsed : 0;

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: tokensCalc,
        cost: costCalc,
        promptTokens: (result as any).promptTokens,
        completionTokens: (result as any).completionTokens,
        model: 'gpt-4o-mini' // Stage 1.5 uses gpt-4o-mini
      });

      this.stagesExecuted.push(stageName);
      this.totalTokensUsed += tokensCalc;
      this.totalCost += costCalc;
      
      return result; // Return result for use in Stage 6 and 7
    } catch (error) {
      const fallbackResult = {
        handlingStrategy: 'handle_primary_first' as const,
        intentOrder: [context.intentResult?.primaryIntent || 'other', ...(context.intentResult?.secondaryIntents || [])],
        canCombine: false,
        followUpNeeded: true,
        tokensUsed: 0,
        cost: 0
      };
      
      stageLogger.logStage(
        stageName,
        '1.5',
        'prioritizeIntents',
        { primaryIntent: context.intentResult?.primaryIntent },
        {},
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: true
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
      return fallbackResult; // Return fallback result
    }
  }

  /**
   * Stage 1.7: Correction Detection
   */
  private async executeStage1_7(context: StageContext): Promise<any> {
    const stageStart = Date.now();
    const stageName = 'stage_1.7';
    const stageLogger = getMultiStageLogger(context);

    try {
      const lastMessages = await prisma.message.findMany({
        where: { conversationId: context.conversationId },
        orderBy: { timestamp: 'desc' },
        take: 5,
        select: { senderType: true, content: true }
      });

      const inputData = {
        normalizedMessage: context.normalizedMessage?.cleaned || context.rawMessage,
        lastMessages: lastMessages.reverse()
      };

      const result = await this.withTimeout(
        detectCorrection(inputData.normalizedMessage, inputData.lastMessages),
        'stage_1_7'
      );

      stageLogger.logStage(
        stageName,
        '1.7',
        'detectCorrection',
        inputData,
        result,
        Date.now() - stageStart,
        {
          success: true,
          decision: {
            type: 'correction_detection',
            reason: 'Detected if message is a correction',
            outcome: {
              isCorrection: result.isCorrection || false,
              correctedField: result.correctedField || null
            }
          },
          databaseReads: [{
            table: 'Message',
            query: 'SELECT * WHERE conversationId = ? ORDER BY timestamp DESC LIMIT 5',
            filters: { conversationId: context.conversationId },
            resultCount: lastMessages.length
          }]
        }
      );

      const costCalc = result.cost !== undefined ? result.cost : 0;
      const tokensCalc = result.tokensUsed !== undefined ? result.tokensUsed : 0;

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: tokensCalc,
        cost: costCalc,
        promptTokens: (result as any).promptTokens,
        completionTokens: (result as any).completionTokens,
        model: 'gpt-4o-mini'
      });

      this.stagesExecuted.push(stageName);
      this.totalTokensUsed += tokensCalc;
      this.totalCost += costCalc;
      return result;
    } catch (error) {
      stageLogger.logStage(
        stageName,
        '1.7',
        'detectCorrection',
        { normalizedMessage: context.normalizedMessage?.cleaned || context.rawMessage },
        {},
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: true
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
      return { isCorrection: false, confidence: 0 };
    }
  }

  /**
   * Stage 2: Context-Aware Data Fetching
   */
  private async executeStage2(context: StageContext): Promise<any> {
    const stageStart = Date.now();
    const stageName = 'stage_2';
    const stageLogger = getMultiStageLogger(context);

    try {
      const inputData = {
        intent: context.intentResult!.primaryIntent,
        extractedInfo: context.intentResult!.extractedInfo,
        conversationId: context.conversationId,
        vendorId: context.vendorId,
        customerId: context.customerId,
        rawMessage: context.rawMessage // ADD THIS for product detection
      };
      
      const data = await fetchRelevantData(
        inputData.intent,
        inputData.extractedInfo,
        inputData.conversationId,
        inputData.vendorId,
        inputData.customerId,
        inputData.rawMessage // ADD THIS
      );

      // NEW: Update memory with intent and insights (Phase 1)
      try {
        // Fetch conversation history once (will be reused in later stages)
        const conversationHistory = await prisma.message.findMany({
          where: { conversationId: context.conversationId },
          orderBy: { timestamp: 'desc' },
          take: 20,
          select: {
            content: true,
            senderType: true,
            timestamp: true
          }
        });
        
        // Store in context for reuse
        (context as any).conversationHistory = conversationHistory;
        
        // Extract ongoing topics from intent
        const ongoingTopics = extractOngoingTopicsFromIntent(
          context.intentResult!.primaryIntent,
          context.intentResult!.extractedInfo,
          context.intentResult!.secondaryIntents
        );
        
        // Extract preferences from customer insights
        const customerPreferences = extractPreferencesFromInsights(data.insights);
        
        // Update memory - let it auto-extract key facts
        await updateConversationMemory(context.conversationId, context.vendorId, {
          conversationHistory: conversationHistory.reverse(),
          currentMessage: context.rawMessage, // Triggers auto-extraction
          ongoingTopics: ongoingTopics,
          customerPreferences: Object.keys(customerPreferences).length > 0 
            ? customerPreferences 
            : undefined,
          incrementTurn: false // Don't increment until Stage 8
        });
        
        // Invalidate cache and refresh memory
        await invalidateConversationCache(context.conversationId);
        context.memory = await retrieveConversationMemory({
          conversationId: context.conversationId,
          vendorId: context.vendorId,
          normalizedMessage: context.normalizedMessage?.cleaned || context.rawMessage
        });
        
        logger.debug({ 
          conversationId: context.conversationId,
          intent: context.intentResult!.primaryIntent,
          topicsExtracted: ongoingTopics.length
        }, 'Memory updated in Stage 2 (Phase 1)');
      } catch (error) {
        logger.warn({ 
          err: error, 
          conversationId: context.conversationId 
        }, 'Failed to update memory in Stage 2, will update in Stage 4');
        // Don't fail the stage if memory update fails
      }

      // Prepare database reads log
      const dbReads: any[] = [];
      if (data.products) {
        dbReads.push({
          table: 'Product',
          query: 'SELECT * WHERE vendorId = ? AND isActive = true',
          filters: { vendorId: context.vendorId },
          resultCount: Array.isArray(data.products) ? data.products.length : 0
        });
      }
      if (data.vendorConfig) {
        dbReads.push({
          table: 'Vendor',
          query: 'SELECT * WHERE id = ?',
          filters: { id: context.vendorId },
          resultCount: 1
        });
      }
      if (data.pendingOrder) {
        dbReads.push({
          table: 'Order',
          query: 'SELECT * WHERE conversationId = ? AND status IN (pending, confirmed)',
          filters: { conversationId: context.conversationId },
          resultCount: 1
        });
      }
      if (data.orderHistory) {
        dbReads.push({
          table: 'Order',
          query: 'SELECT * WHERE customerId = ? ORDER BY createdAt DESC',
          filters: { customerId: context.customerId },
          resultCount: Array.isArray(data.orderHistory) ? data.orderHistory.length : 0
        });
      }
      if (data.insights) {
        dbReads.push({
          table: 'CustomerInsights',
          query: 'SELECT * WHERE customerId = ? AND vendorId = ?',
          filters: { customerId: context.customerId, vendorId: context.vendorId },
          resultCount: 1
        });
      }

      stageLogger.logStage(
        stageName,
        '2',
        'fetchRelevantData',
        inputData,
        data,
        Date.now() - stageStart,
        {
          success: true,
          decision: {
            type: 'data_fetching',
            reason: `Fetched data based on intent: ${inputData.intent}`,
            outcome: {
              fetched: Object.keys(data),
              productCount: Array.isArray(data.products) ? data.products.length : 0,
              orderHistoryCount: Array.isArray(data.orderHistory) ? data.orderHistory.length : 0
            }
          },
          databaseReads: dbReads
        }
      );

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: 0,
        cost: 0
      });

      this.stagesExecuted.push(stageName);
      return data;
    } catch (error) {
      stageLogger.logStage(
        stageName,
        '2',
        'fetchRelevantData',
        {
          intent: context.intentResult?.primaryIntent,
          conversationId: context.conversationId,
          vendorId: context.vendorId,
          customerId: context.customerId
        },
        {},
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: true
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
      return {};
    }
  }

  /**
   * Stage 3: Simplified Prompt Construction
   */
  private async executeStage3(context: StageContext): Promise<string> {
    const stageStart = Date.now();
    const stageName = 'stage_3';
    const stageLogger = getMultiStageLogger(context);

    try {
      // ENHANCEMENT: Fetch full conversation history for maximum context retention (20 messages)
      const fullConversationHistory = await prisma.message.findMany({
        where: { conversationId: context.conversationId },
        orderBy: { timestamp: 'desc' },
        take: 20, // Full history for better context
        select: {
          senderType: true,
          content: true,
          timestamp: true
        }
      });

      // Fetch last messages for backward compatibility
      const lastMessages = fullConversationHistory.slice(0, 5);

      const inputData = {
        intent: context.intentResult!.primaryIntent,
        extractedInfo: context.intentResult!.extractedInfo,
        fetchedData: context.fetchedData || {},
        vendorConfig: context.fetchedData?.vendorConfig || {},
        memory: context.memory || {
          keyFacts: [],
          ongoingTopics: [],
          customerPreferences: {},
          conversationSummary: '',
          importantContext: [],
          turnNumber: 0,
          conversationStage: 'greeting'
        }
      };
      
      const prompt = buildFocusedPrompt(
        inputData.intent,
        inputData.extractedInfo,
        inputData.fetchedData,
        inputData.vendorConfig,
        inputData.memory,
        lastMessages.reverse(), // Pass customer messages for backward compatibility
        fullConversationHistory.reverse(), // ENHANCEMENT: Pass full conversation history
        context.intentResult?.secondaryIntents // ENHANCEMENT: Pass secondary intents for multiple intent handling
      );

      stageLogger.logStage(
        stageName,
        '3',
        'buildFocusedPrompt',
        inputData,
        { prompt },
        Date.now() - stageStart,
        {
          success: true,
          aiPrompt: prompt,
          decision: {
            type: 'prompt_construction',
            reason: `Built focused prompt for intent: ${inputData.intent}`,
            outcome: {
              promptLength: prompt.length,
              includesProducts: prompt.includes('AVAILABLE PRODUCTS'),
              includesOrderHistory: prompt.includes('Order History')
            }
          }
        }
      );

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: 0,
        cost: 0
      });

      this.stagesExecuted.push(stageName);
      return prompt;
    } catch (error) {
      const fallbackPrompt = `Respond to: ${context.rawMessage}`;
      
      stageLogger.logStage(
        stageName,
        '3',
        'buildFocusedPrompt',
        { intent: context.intentResult?.primaryIntent, rawMessage: context.rawMessage },
        { prompt: fallbackPrompt },
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: true,
          aiPrompt: fallbackPrompt
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
      return fallbackPrompt;
    }
  }

  /**
   * Stage 4: Primary AI Response Generation
   * CRITICAL: Uses optimized prompt instead of legacy generateStructuredResponse
   */
  private async executeStage4(context: StageContext, prompt: string): Promise<any> {
    const stageStart = Date.now();
    const stageName = 'stage_4';
    const stageLogger = getMultiStageLogger(context);

    try {
      const inputData = {
        prompt,
        normalizedMessage: context.normalizedMessage || { original: context.rawMessage, cleaned: context.rawMessage },
        memory: context.memory || {
          keyFacts: [],
          ongoingTopics: [],
          customerPreferences: {},
          conversationSummary: '',
          importantContext: [],
          turnNumber: 0,
          conversationStage: 'greeting'
        },
        conversationId: context.conversationId,
        vendorId: context.vendorId
      };
      
      // ENHANCEMENT: Pass intent and extractedInfo for conditional model selection
      const aiResponse = await this.withTimeout(
        generatePrimaryAIResponse(
          inputData.prompt,
          inputData.normalizedMessage,
          inputData.memory,
          inputData.conversationId,
          inputData.vendorId,
          context.intentResult?.primaryIntent,
          context.intentResult?.extractedInfo,
          context.intentResult?.secondaryIntents
        ),
        'stage_4'
      );

      // NEW: Validate clarification needs against memory
      if (aiResponse.needsClarification && context.memory) {
        const actuallyNeedsClarification = validateClarificationNeeds(
          aiResponse,
          context.memory,
          aiResponse.extractedData
        );
        
        if (!actuallyNeedsClarification) {
          // Override needsClarification if memory has the info
          aiResponse.needsClarification = false;
          logger.debug({ 
            conversationId: context.conversationId 
          }, 'Clarification not needed - information exists in memory');
        }
      }

      // NEW: Update memory with AI-extracted data (Phase 2)
      try {
        // Reuse conversation history from context (if available)
        const conversationHistory = (context as any).conversationHistory || await prisma.message.findMany({
          where: { conversationId: context.conversationId },
          orderBy: { timestamp: 'desc' },
          take: 20,
          select: {
            content: true,
            senderType: true,
            timestamp: true
          }
        });
        
        // Extract ongoing topics from AI response
        const ongoingTopics = extractOngoingTopicsFromResponse(aiResponse);
        
        // Extract preferences from AI-extracted data
        const customerPreferences = extractPreferencesFromExtractedData(aiResponse.extractedData);
        
        // Update memory with AI-extracted data
        await updateConversationMemory(context.conversationId, context.vendorId, {
          currentMessage: context.rawMessage,
          ongoingTopics: ongoingTopics,
          customerPreferences: Object.keys(customerPreferences).length > 0 
            ? customerPreferences 
            : undefined,
          incrementTurn: false // Don't increment until Stage 8
        });
        
        // Invalidate cache and refresh memory
        await invalidateConversationCache(context.conversationId);
        context.memory = await retrieveConversationMemory({
          conversationId: context.conversationId,
          vendorId: context.vendorId,
          normalizedMessage: context.normalizedMessage?.cleaned || context.rawMessage
        });
        
        logger.debug({ 
          conversationId: context.conversationId,
          aiExtractedData: Object.keys(aiResponse.extractedData || {})
        }, 'Memory updated in Stage 4 (Phase 2)');
      } catch (error) {
        logger.warn({ 
          err: error, 
          conversationId: context.conversationId 
        }, 'Failed to update memory in Stage 4, will update in Stage 8');
        // Don't fail the stage if memory update fails
      }

      stageLogger.logStage(
        stageName,
        '4',
        'generatePrimaryAIResponse',
        { ...inputData, prompt: prompt.substring(0, 500) + '...' }, // Truncate prompt for logging
        aiResponse,
        Date.now() - stageStart,
        {
          success: true,
          tokensUsed: aiResponse.tokensUsed || 0,
          cost: aiResponse.cost || 0,
          aiPrompt: prompt,
          aiResponse: aiResponse,
          decision: {
            type: 'ai_response_generation',
            reason: 'Generated AI response using focused prompt',
            outcome: {
              needsClarification: aiResponse.needsClarification,
              extractedDataKeys: Object.keys(aiResponse.extractedData || {}),
              responseLength: aiResponse.response?.length || 0
            }
          }
        }
      );

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: aiResponse.tokensUsed || 0,
        cost: aiResponse.cost || 0,
        promptTokens: aiResponse.promptTokens || 0,
        completionTokens: aiResponse.completionTokens || 0,
        model: aiResponse.model || 'gpt-4o-mini'
      });

      this.stagesExecuted.push(stageName);
      this.totalTokensUsed += aiResponse.tokensUsed || 0;
      this.totalCost += aiResponse.cost || 0;

      return aiResponse;
    } catch (error) {
      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });

      // Fallback to legacy only if new service fails
      logger.warn({ conversationId: context.conversationId }, 'Primary AI service failed, using legacy fallback');
      try {
        const response = await aiService.generateStructuredResponse(
          context.rawMessage,
          context.vendorId,
          context.conversationId
        );
        const fallbackResponse = {
          response: response.customerMessage,
          extractedData: {},
          needsClarification: false,
          tokensUsed: response.tokensUsed || 0,
          cost: (response.tokensUsed || 0) * 0.0005 / 1000
        };
        
        stageLogger.logStage(
          stageName,
          '4',
          'generatePrimaryAIResponse (legacy fallback)',
          { rawMessage: context.rawMessage, vendorId: context.vendorId },
          fallbackResponse,
          Date.now() - stageStart,
          {
            success: true,
            tokensUsed: fallbackResponse.tokensUsed,
            cost: fallbackResponse.cost,
            fallbackUsed: true,
            aiResponse: fallbackResponse
          }
        );
        
        return fallbackResponse;
      } catch (fallbackError) {
        logger.error(fallbackError as Error, 'Legacy fallback also failed');
        const finalFallback = {
          response: fallbackAIResponse(context.intentResult?.primaryIntent || 'other', context.vendorId),
          extractedData: {},
          needsClarification: true,
          tokensUsed: 0,
          cost: 0
        };
        
        stageLogger.logStage(
          stageName,
          '4',
          'generatePrimaryAIResponse (hard fallback)',
          { rawMessage: context.rawMessage },
          finalFallback,
          Date.now() - stageStart,
          {
            success: false,
            error: fallbackError as Error,
            fallbackUsed: true,
            aiResponse: finalFallback
          }
        );
        
        return finalFallback;
      }
    }
  }

  /**
   * Stage 4.5: Order Update Validation
   */
  private async executeStage4_5(context: StageContext, aiResponse: any): Promise<void> {
    const stageStart = Date.now();
    const stageName = 'stage_4.5';
    const stageLogger = getMultiStageLogger(context);

    try {
      const inputData = {
        extractedData: aiResponse.extractedData || {},
        currentOrder: context.fetchedData?.pendingOrder,
        products: context.fetchedData?.products || [],
        vendorId: context.vendorId
      };

      const result = await validateOrderUpdate(
        inputData.extractedData,
        inputData.currentOrder,
        inputData.products,
        inputData.vendorId
      );

      stageLogger.logStage(
        stageName,
        '4.5',
        'validateOrderUpdate',
        inputData,
        result,
        Date.now() - stageStart,
        {
          success: result.isValid,
          decision: {
            type: 'order_update_validation',
            reason: 'Validated order update for consistency and conflicts',
            outcome: {
              isValid: result.isValid,
              conflictsCount: result.conflicts?.length || 0,
              requiresConfirmation: result.requiresConfirmation,
              priceChange: result.priceChanges?.difference || 0
            }
          }
        }
      );

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: 0,
        cost: 0
      });

      this.stagesExecuted.push(stageName);
    } catch (error) {
      stageLogger.logStage(
        stageName,
        '4.5',
        'validateOrderUpdate',
        { extractedData: aiResponse.extractedData },
        {},
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: true
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
    }
  }

  /**
   * Stage 4.7: Proactive Assistance
   */
  private async executeStage4_7(context: StageContext): Promise<any> {
    const stageStart = Date.now();
    const stageName = 'stage_4.7';
    const stageLogger = getMultiStageLogger(context);

    try {
      const inputData = {
        insights: context.fetchedData?.insights,
        orderHistory: context.fetchedData?.orderHistory || [],
        conversationStage: context.memory?.conversationStage || 'greeting',
        intent: context.intentResult?.primaryIntent || 'other',
        vendorId: context.vendorId
      };

      const result = await this.withTimeout(
        generateProactiveAssistance(
          inputData.insights,
          inputData.orderHistory,
          {
            conversationStage: inputData.conversationStage,
            intent: inputData.intent
          },
          inputData.vendorId
        ),
        'stage_4_7'
      );

      stageLogger.logStage(
        stageName,
        '4.7',
        'generateProactiveAssistance',
        inputData,
        result,
        Date.now() - stageStart,
        {
          success: true,
          tokensUsed: result.tokensUsed || 0,
          cost: result.cost || 0,
          aiResponse: result,
          decision: {
            type: 'proactive_assistance',
            reason: 'Generated proactive assistance suggestions',
            outcome: {
              shouldInclude: result.shouldInclude,
              suggestionsCount: result.suggestions?.length || 0
            }
          }
        }
      );

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: result.tokensUsed || 0,
        cost: result.cost || 0
      });

      this.totalTokensUsed += result.tokensUsed || 0;
      this.totalCost += result.cost || 0;

      // Skip if no suggestions
      if (!result.shouldInclude) {
        this.stagesSkipped.push(stageName);
        stageLogger.logSkippedStage(stageName, 'No proactive suggestions to include');
      } else {
        this.stagesExecuted.push(stageName);
      }

      return result; // Always return so caller can use suggestions
    } catch (error) {
      stageLogger.logStage(
        stageName,
        '4.7',
        'generateProactiveAssistance',
        { vendorId: context.vendorId },
        {},
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: true
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.stagesSkipped.push(stageName);
      return null; // Caller handles null gracefully
    }
  }

  /**
   * Stage 5: Conditional Data Enrichment
   */
  private async executeStage5(context: StageContext, aiResponse: any): Promise<any> {
    const stageStart = Date.now();
    const stageName = 'stage_5';
    const stageLogger = getMultiStageLogger(context);

    try {
      const inputData = {
        aiResponse,
        conversationId: context.conversationId,
        vendorId: context.vendorId,
        customerId: context.customerId
      };

      const enrichment = await enrichWithAdditionalData(
        inputData.aiResponse,
        inputData.conversationId,
        inputData.vendorId,
        inputData.customerId
      );

      stageLogger.logStage(
        stageName,
        '5',
        'enrichWithAdditionalData',
        inputData,
        enrichment,
        Date.now() - stageStart,
        {
          success: true,
          decision: {
            type: 'data_enrichment',
            reason: 'Enriched data for clarification',
            outcome: {
              canProceed: enrichment.canProceed,
              missingFields: enrichment.missingFields || [],
              additionalContextKeys: Object.keys(enrichment.additionalContext || {})
            }
          },
          databaseReads: enrichment.additionalContext?.customerInsights ? [{
            table: 'CustomerInsights',
            query: 'SELECT * WHERE customerId = ? AND vendorId = ?',
            filters: { customerId: context.customerId, vendorId: context.vendorId },
            resultCount: 1
          }] : []
        }
      );

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: 0,
        cost: 0
      });

      this.stagesExecuted.push(stageName);
      return enrichment;
    } catch (error) {
      const fallbackEnrichment = { additionalContext: {}, canProceed: false, missingFields: [] };
      
      stageLogger.logStage(
        stageName,
        '5',
        'enrichWithAdditionalData',
        { conversationId: context.conversationId },
        fallbackEnrichment,
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: true
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
      return fallbackEnrichment;
    }
  }

  /**
   * Stage 6: Response Refinement
   */
  private async executeStage6(context: StageContext, initialResponse: any, enrichment: any): Promise<any> {
    const stageStart = Date.now();
    const stageName = 'stage_6';
    const stageLogger = getMultiStageLogger(context);

    try {
      const inputData = {
        initialResponse,
        enrichment: enrichment?.additionalContext || {},
        normalizedMessage: context.normalizedMessage?.cleaned || context.rawMessage,
        vendorId: context.vendorId
      };

      const refined = await this.withTimeout(
        refineResponse(
          inputData.initialResponse,
          inputData.enrichment,
          inputData.normalizedMessage,
          inputData.vendorId,
          context.intentResult?.secondaryIntents,
          context.intentPrioritization
        ),
        'stage_6'
      );

      stageLogger.logStage(
        stageName,
        '6',
        'refineResponse',
        inputData,
        refined,
        Date.now() - stageStart,
        {
          success: true,
          tokensUsed: refined.tokensUsed || 0,
          cost: refined.cost || 0,
          aiResponse: refined,
          decision: {
            type: 'response_refinement',
            reason: 'Refined response with additional context',
            outcome: {
              responseLength: refined.response?.length || 0,
              needsClarification: refined.needsClarification
            }
          }
        }
      );

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: refined.tokensUsed || 0,
        cost: refined.cost || 0,
        promptTokens: (refined as any).promptTokens,
        completionTokens: (refined as any).completionTokens,
        model: 'gpt-4o-mini' // Stage 6 uses gpt-4o-mini
      });

      this.stagesExecuted.push(stageName);
      this.totalTokensUsed += refined.tokensUsed || 0;
      this.totalCost += refined.cost || 0;
      return refined;
    } catch (error) {
      stageLogger.logStage(
        stageName,
        '6',
        'refineResponse',
        { initialResponse },
        initialResponse,
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: true
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
      return initialResponse;
    }
  }

  /**
   * Stage 7: Message Formatting (formatting only, no AI call)
   * 
   * OPTIMIZATION: Removed AI call to prevent Stage 7 from changing Stage 4's response meaning.
   * Now only applies formatting functions to preserve Stage 4's response exactly.
   */
  private async executeStage7(context: StageContext, responseData: any): Promise<string> {
    const stageStart = Date.now();
    const stageName = 'stage_7';
    const stageLogger = getMultiStageLogger(context);

    try {
      // Pass available products to formatting service (for potential future use)
      const availableProducts = context.fetchedData?.products || [];
      const responseDataWithProducts = {
        ...responseData,
        availableProducts
      };

      const inputData = {
        responseData: responseDataWithProducts,
        memory: context.memory || {
          keyFacts: [],
          ongoingTopics: [],
          customerPreferences: {},
          conversationSummary: '',
          importantContext: [],
          turnNumber: 0,
          conversationStage: 'greeting'
        },
        vendorConfig: context.fetchedData?.vendorConfig || {},
        conversationId: context.conversationId,
        vendorId: context.vendorId,
        isFirstMessage: context.isFirstMessage
      };

      const composeResult = await composeMessage(
        inputData.responseData,
        inputData.memory,
        inputData.vendorConfig,
        inputData.conversationId,
        inputData.vendorId,
        inputData.isFirstMessage
      );

      // Append Stage 4.7 proactive suggestions if available and appropriate
      let message = composeResult.message;
      const proactive = context.proactiveAssistance;
      if (proactive?.shouldInclude && proactive.suggestions?.length > 0) {
        const suggestionLines = proactive.suggestions
          .map((s: any) => s.naturalPhrasing)
          .filter(Boolean)
          .join('\n');
        if (suggestionLines) {
          message = `${message}\n\n${suggestionLines}`;
        }
      }

      stageLogger.logStage(
        stageName,
        '7',
        'composeMessage',
        inputData,
        { message, proactiveSuggestionsAppended: proactive?.shouldInclude ?? false },
        Date.now() - stageStart,
        {
          success: true,
          decision: {
            type: 'message_formatting',
            reason: 'Formatted final message from Stage 4 response',
            outcome: {
              messageLength: message.length,
              preservedStage4Response: true,
              proactiveSuggestionsAppended: proactive?.shouldInclude ?? false,
              suggestionsCount: proactive?.suggestions?.length ?? 0
            }
          }
        }
      );

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: 0, // No AI call
        cost: 0       // No AI call
        // No model field - formatting only, no AI call
      });

      this.stagesExecuted.push(stageName);
      // No tokens or cost to add (formatting only)
      return message;
    } catch (error) {
      const fallbackMessage = responseData.response || fallbackAIResponse(context.intentResult!.primaryIntent, context.vendorId);
      
      stageLogger.logStage(
        stageName,
        '7',
        'composeMessage',
        { responseData },
        { message: fallbackMessage },
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: true
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true,
        tokensUsed: 0,
        cost: 0
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
      return fallbackMessage;
    }
  }

  /**
   * Stage 7.5: Data Validation
   */
  private async executeStage7_5(context: StageContext, responseData: any): Promise<any> {
    const stageStart = Date.now();
    const stageName = 'stage_7.5';
    const stageLogger = getMultiStageLogger(context);

    try {
      const intent = context.intentResult?.primaryIntent;
      const extractedData = responseData.extractedData || {};
      
      let validationResult: any;
      
      // Intent-specific validation
      if (intent === 'confirm_order') {
        // Get pending order
        const pendingOrder = await prisma.order.findFirst({
          where: {
            conversationId: context.conversationId,
            vendorId: context.vendorId,
            status: 'pending'
          },
          orderBy: { createdAt: 'desc' }
        });
        
        if (!pendingOrder) {
          validationResult = {
            isValid: false,
            errors: [{
              field: 'order',
              error: 'No pending order found to confirm',
              severity: 'error'
            }],
            validatedData: null
          };
        } else {
          const supplementalConfirmationData = {
            customerName:
              extractedData?.customerInfo?.name ||
              extractedData?.customerName ||
              null,
            deliveryAddress:
              extractedData?.deliveryAddress ||
              null
          };

          // Validate order confirmation
          validationResult = await validateOrderConfirmation(
            pendingOrder,
            context.customerId,
            context.vendorId,
            supplementalConfirmationData
          );
        }
        
        // If validation fails, update response message
        if (!validationResult.isValid) {
          const errorMessages = formatValidationErrors(validationResult.errors);
          responseData.response = `I'd love to confirm your order! However, I need a few more details:\n\n${errorMessages}\n\nCould you please provide this information?`;
          responseData.needsClarification = true;
          
          // Store updated message in context for Stage 9
          context.validationFailedMessage = responseData.response;
        }
      } else if (intent === 'cancel_order') {
        // Get order to cancel (pending or confirmed)
        const orderToCancel = await prisma.order.findFirst({
          where: {
            conversationId: context.conversationId,
            vendorId: context.vendorId,
            customerId: context.customerId,
            status: { in: ['pending', 'confirmed'] }
          },
          orderBy: { createdAt: 'desc' }
        });
        
        // Validate order cancellation
        validationResult = await validateOrderCancellation(
          orderToCancel,
          context.customerId,
          context.vendorId
        );
        
        // If validation fails, update response message
        if (!validationResult.isValid) {
          const errorMessages = formatValidationErrors(validationResult.errors);
          responseData.response = `I'm sorry, but I cannot cancel your order:\n\n${errorMessages}\n\nPlease contact support if you need assistance.`;
          responseData.needsClarification = true;
          
          // Store updated message in context for Stage 9
          context.validationFailedMessage = responseData.response;
        }
      } else if (intent === 'repeat_order') {
        // Get previous order
        const previousOrder = await prisma.order.findFirst({
          where: {
            conversationId: context.conversationId,
            vendorId: context.vendorId,
            customerId: context.customerId,
            status: { not: 'cancelled' }
          },
          orderBy: { createdAt: 'desc' }
        });
        
        // Get products for validation
        const products = context.fetchedData?.products || [];
        
        // Validate repeat order
        validationResult = await validateRepeatOrder(
          previousOrder,
          products,
          context.vendorId
        );
        
        // If validation fails, update response message
        if (!validationResult.isValid) {
          const errorMessages = formatValidationErrors(validationResult.errors);
          responseData.response = `I'd love to repeat your previous order! However:\n\n${errorMessages}\n\nWould you like to place a new order instead?`;
          responseData.needsClarification = true;
          
          // Store updated message in context for Stage 9
          context.validationFailedMessage = responseData.response;
        }
      } else {
        // For other intents, use existing validation
        validationResult = await validateExtractedData(
          extractedData,
          context.vendorId,
          context.conversationId,
          intent // Pass intent for intent-specific validations
        );
      }
      
      const inputData = {
        extractedData: responseData.extractedData || {},
        vendorId: context.vendorId,
        conversationId: context.conversationId,
        intent
      };

      const validationFunctionName = 
        intent === 'confirm_order' ? 'validateOrderConfirmation' :
        intent === 'cancel_order' ? 'validateOrderCancellation' :
        intent === 'repeat_order' ? 'validateRepeatOrder' :
        'validateExtractedData';
      
      stageLogger.logStage(
        stageName,
        '7.5',
        validationFunctionName,
        inputData,
        validationResult,
        Date.now() - stageStart,
        {
          success: validationResult.isValid,
          decision: {
            type: 'data_validation',
            reason: 'Validated extracted data before database update',
            outcome: {
              isValid: validationResult.isValid,
              errorsCount: validationResult.errors?.length || 0,
              matchStats: validationResult.matchStats
            }
          },
          databaseReads: validationResult.matchStats ? [{
            table: 'Product',
            query: 'SELECT * WHERE vendorId = ? AND isActive = true',
            filters: { vendorId: context.vendorId },
            resultCount: Array.isArray(validationResult.matchStats) ? validationResult.matchStats.length : 0
          }] : []
        }
      );

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: 0,
        cost: 0
      });

      this.stagesExecuted.push(stageName);
      return validationResult;
    } catch (error) {
      const fallbackValidation = fallbackDataValidation(responseData.extractedData || {});
      
      const inputDataForError = {
        extractedData: responseData.extractedData || {},
        vendorId: context.vendorId,
        conversationId: context.conversationId
      };
      
      stageLogger.logStage(
        stageName,
        '7.5',
        'validateExtractedData',
        inputDataForError,
        fallbackValidation,
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: true
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
      return fallbackValidation;
    }
  }

  /**
   * Stage 8: Database Update
   */
  private async executeStage8(context: StageContext, responseData: any, validationResult: any): Promise<void> {
    const stageStart = Date.now();
    const stageName = 'stage_8';
    const stageLogger = getMultiStageLogger(context);

    try {
      const inputData = {
        responseData,
        validationResult,
        conversationId: context.conversationId,
        vendorId: context.vendorId,
        customerId: context.customerId
      };

      await extractAndSave(
        inputData.responseData,
        inputData.validationResult,
        inputData.conversationId,
        inputData.vendorId,
        inputData.customerId,
        context.intentResult?.primaryIntent,
        (context as any).conversationHistory,
        context.intentResult
      );

      // Notify vendor of new/confirmed order — fire-and-forget, does not block customer response
      const notifyIntent = context.intentResult?.primaryIntent;
      if (notifyIntent === 'order_new' || notifyIntent === 'confirm_order') {
        const latestOrder = await prisma.order.findFirst({
          where: {
            conversationId: context.conversationId,
            vendorId: context.vendorId,
            status: { in: ['pending', 'confirmed'] }
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true }
        });

        if (latestOrder) {
          whatsappTemplateService.notifyVendorNewOrder(context.vendorId, latestOrder.id)
            .catch(err => logger.warn({ err, vendorId: context.vendorId, orderId: latestOrder.id }, 'Vendor new order notification failed (non-blocking)'));
        }
      }

      // Log database writes (extractAndSave handles orders, customer insights, conversation memory)
      const dbWrites: any[] = [];
      if (validationResult.isValid && validationResult.validatedData) {
        if (validationResult.validatedData.orderItems) {
          dbWrites.push({
            table: 'Order',
            operation: 'create' as const,
            data: { orderItems: validationResult.validatedData.orderItems }
          });
        }
        if (validationResult.validatedData.customerInfo) {
          dbWrites.push({
            table: 'CustomerInsights',
            operation: 'update' as const,
            data: validationResult.validatedData.customerInfo
          });
        }
        dbWrites.push({
          table: 'ConversationMemory',
          operation: 'update' as const,
          data: { conversationId: context.conversationId }
        });
      }

      stageLogger.logStage(
        stageName,
        '8',
        'extractAndSave',
        inputData,
        { saved: true },
        Date.now() - stageStart,
        {
          success: true,
          decision: {
            type: 'database_update',
            reason: 'Saved extracted and validated data to database',
            outcome: {
              orderUpdated: !!validationResult.validatedData?.orderItems,
              customerInfoUpdated: !!validationResult.validatedData?.customerInfo,
              memoryUpdated: true
            }
          },
          databaseWrites: dbWrites
        }
      );

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: 0,
        cost: 0
      });

      this.stagesExecuted.push(stageName);
    } catch (error) {
      stageLogger.logStage(
        stageName,
        '8',
        'extractAndSave',
        { conversationId: context.conversationId },
        {},
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: false
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
    }
  }

  /**
   * Stage 8.5: Quality Assessment
   */
  private async executeStage8_5(context: StageContext, finalMessage: string, responseData: any): Promise<any> {
    const stageStart = Date.now();
    const stageName = 'stage_8.5';
    const stageLogger = getMultiStageLogger(context);

    try {
      const inputData = {
        finalMessage,
        intent: context.intentResult!.primaryIntent,
        extractedData: responseData.extractedData || {},
        memory: context.memory || {
          keyFacts: [],
          ongoingTopics: [],
          customerPreferences: {},
          conversationSummary: '',
          importantContext: [],
          turnNumber: 0,
          conversationStage: 'greeting'
        },
        conversationId: context.conversationId,
        vendorId: context.vendorId,
        messageId: context.messageId,
        stagesExecuted: this.stagesExecuted,
        totalTokensUsed: this.totalTokensUsed,
        totalCost: this.totalCost,
        totalDuration: this.totalDuration
      };

      const quality = await this.withTimeout(
        assessQuality(
          inputData.finalMessage,
          inputData.intent,
          inputData.extractedData,
          inputData.memory,
          inputData.conversationId,
          inputData.vendorId,
          inputData.messageId,
          inputData.stagesExecuted,
          inputData.totalTokensUsed,
          inputData.totalCost,
          inputData.totalDuration
        ),
        'stage_8_5'
      );

      stageLogger.logStage(
        stageName,
        '8.5',
        'assessQuality',
        inputData,
        quality,
        Date.now() - stageStart,
        {
          success: true,
          decision: {
            type: 'quality_assessment',
            reason: 'Assessed quality of final response',
            outcome: {
              overallScore: quality.overallScore,
              naturalnessScore: quality.naturalnessScore,
              informationCompleteness: quality.informationCompleteness,
              conversationContinuity: quality.conversationContinuity,
              issues: quality.issues || []
            }
          }
        }
      );

      const costCalc = quality.cost !== undefined ? quality.cost : 0;
      const tokensCalc = quality.tokensUsed !== undefined ? quality.tokensUsed : 0;

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: tokensCalc,
        cost: costCalc,
        promptTokens: (quality as any).promptTokens,
        completionTokens: (quality as any).completionTokens,
        model: 'gpt-4o-mini'
      });

      this.stagesExecuted.push(stageName);
      this.totalTokensUsed += tokensCalc;
      this.totalCost += costCalc;
      return quality;
    } catch (error) {
      const fallbackQuality = fallbackQualityAssessment();
      
      stageLogger.logStage(
        stageName,
        '8.5',
        'assessQuality',
        { finalMessage, messageId: context.messageId },
        fallbackQuality,
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: true
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
      return fallbackQuality;
    }
  }

  /**
   * Stage 9: Response Queuing
   */
  private async executeStage9(context: StageContext, finalMessage: string): Promise<void> {
    const stageStart = Date.now();
    const stageName = 'stage_9';
    const stageLogger = getMultiStageLogger(context);

    try {
      // Use validation-failed message if available
      const messageToQueue = context.validationFailedMessage || finalMessage;
      
      // Aggregate cost data from all stages
      const stageCostEntries = Array.from(this.stageCosts.values())
        .filter(s => s.model)
        .map(s => ({
          model: s.model!,
          promptTokens: s.promptTokens || 0,
          completionTokens: s.completionTokens || 0,
          totalTokens: s.tokens,
          costUsd: s.cost
        }));
      const modelBreakdown = stageCostEntries.length > 0
        ? aggregateCostBreakdown(stageCostEntries)
        : undefined;
      const totals = modelBreakdown?.['_totals'];

      // Determine primary model from stage 4
      const stage4Cost = this.stageCosts.get('stage_4');
      const unifiedCost = this.stageCosts.get('stage_unified');
      const aiPrimaryModel = stage4Cost?.model || unifiedCost?.model || null;

      // Check if any stage used estimated costs
      const aiCostEstimated = stageCostEntries.some(s => s.promptTokens === 0 && s.completionTokens === 0 && s.totalTokens > 0);

      const inputData = {
        finalMessage: messageToQueue,
        conversationId: context.conversationId,
        vendorId: context.vendorId,
        customerId: context.customerId,
        metadata: {
          intent: context.intentResult!.primaryIntent,
          tokensUsed: this.totalTokensUsed,
          stagesExecuted: this.stagesExecuted,
          costUsd: this.totalCost,
          promptTokens: totals?.promptTokens || 0,
          completionTokens: totals?.completionTokens || 0,
          primaryModel: aiPrimaryModel,
          modelBreakdown: modelBreakdown || null,
          costEstimated: aiCostEstimated
        }
      };

      if (context.sandbox) {
        // Sandbox: capture the final message for the caller but skip the two
        // downstream side effects (assistant Message row + SQS publish).
        context.sandboxFinalMessage = inputData.finalMessage;
      } else {
        await queueResponse(
          inputData.finalMessage,
          inputData.conversationId,
          inputData.vendorId,
          inputData.customerId,
          inputData.metadata
        );
      }

      stageLogger.logStage(
        stageName,
        '9',
        'queueResponse',
        inputData,
        { queued: !context.sandbox, sandbox: !!context.sandbox },
        Date.now() - stageStart,
        {
          success: true,
          decision: {
            type: 'response_queuing',
            reason: 'Queued final response for delivery',
            outcome: {
              messageQueued: true,
              messageLength: finalMessage.length
            }
          }
        }
      );

      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: 0,
        cost: 0
      });

      this.stagesExecuted.push(stageName);
    } catch (error) {
      stageLogger.logStage(
        stageName,
        '9',
        'queueResponse',
        { finalMessage, conversationId: context.conversationId },
        {},
        Date.now() - stageStart,
        {
          success: false,
          error: error as Error,
          fallbackUsed: false
        }
      );

      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: false
      });

      this.errors.push({ stage: stageName, error: (error as Error).message });
      throw error; // Don't fallback here - this is critical
    }
  }

  /**
   * Stage 9.5: Generate Message Summary (async, non-blocking)
   * Generates a self-contained summary for the customer message to improve
   * intent classification in future messages.
   */
  private async executeStage9_5(context: StageContext, finalMessage: string): Promise<void> {
    // Sandbox: skip the summary write entirely. The inbound message is
    // synthetic and writing a summary onto it would pollute future intent
    // classification.
    if (context.sandbox) return;
    // This runs async - doesn't block response
    setImmediate(async () => {
      const stageStart = Date.now();
      const stageName = 'stage_9.5';
      const stageLogger = getMultiStageLogger(context);

      try {
        // Get current customer message
        const customerMessage = await prisma.message.findUnique({
          where: { id: context.messageId },
          select: { content: true, senderType: true }
        });
        
        if (!customerMessage || customerMessage.senderType !== 'customer') {
          return; // Only summarize customer messages
        }
        
        // Generate summary with customer insights
        const { generateMessageSummary } = await import('./messageSummaryService.js');
        const summary = await generateMessageSummary(
          context.messageId,
          context.conversationId,
          context.customerId,
          context.vendorId,
          customerMessage,
          finalMessage,  // Last assistant message
          {
            conversationStage: context.memory?.conversationStage || 'greeting',
            pendingOrder: context.fetchedData?.pendingOrder,
            memory: context.memory
          }
        );
        
        // Store summary on the customer message
        if (summary.summary) {
          await prisma.message.update({
            where: { id: context.messageId },
            data: {
              messageSummary: summary.summary,
              expectedNextAction: summary.expectedNext,
              summaryMetadata: summary.metadata
            }
          });
          
          logger.debug({ 
            messageId: context.messageId,
            summaryLength: summary.summary.length,
            expectedNext: summary.expectedNext
          }, 'Message summary generated');
        }
        
        // Log stage execution
        const cost = summary.metadata?.tokensUsed 
          ? calculateCostFromUsage(
              {
                prompt_tokens: summary.metadata.promptTokens || 0,
                completion_tokens: summary.metadata.completionTokens || 0,
                total_tokens: summary.metadata.tokensUsed
              },
              'gpt-4o-mini'
            ).cost
          : 0;
        
        await this.logStageExecution(stageName, context, {
          success: true,
          duration: Date.now() - stageStart,
          tokensUsed: summary.metadata?.tokensUsed || 0,
          cost: cost,
          model: 'gpt-4o-mini',
          promptTokens: summary.metadata?.promptTokens,
          completionTokens: summary.metadata?.completionTokens
        });
        
        this.stagesExecuted.push(stageName);
        this.totalTokensUsed += summary.metadata?.tokensUsed || 0;
        this.totalCost += cost;
        
      } catch (error) {
        logger.warn({ err: error, messageId: context.messageId }, 
          'Failed to generate message summary - non-critical');
        
        // Log failure but don't throw (non-critical)
        await this.logStageExecution(stageName, context, {
          success: false,
          duration: Date.now() - stageStart,
          errorType: (error as Error).constructor.name,
          errorMessage: (error as Error).message,
          fallbackUsed: false
        });
        
        this.errors.push({ stage: stageName, error: (error as Error).message });
      }
    });
  }

  /**
   * Log stage execution to database
   */
  private async logStageExecution(
    stageName: string,
    context: StageContext,
    details: {
      success: boolean;
      duration: number;
      tokensUsed?: number;
      cost?: number;
      errorType?: string;
      errorMessage?: string;
      fallbackUsed?: boolean;
      model?: string;
      promptTokens?: number;
      completionTokens?: number;
    }
  ): Promise<void> {
    try {
      // Calculate cost per 1K tokens for analysis
      const costPer1K = details.tokensUsed && details.tokensUsed > 0
        ? (details.cost || 0) / (details.tokensUsed / 1000)
        : 0;

      // Track per-stage costs
      if (details.tokensUsed && details.cost !== undefined) {
        this.stageCosts.set(stageName, {
          tokens: details.tokensUsed,
          cost: details.cost,
          model: details.model,
          promptTokens: details.promptTokens,
          completionTokens: details.completionTokens
        });
      }

      // Log to database using Prisma (now that schema is updated)
      await prisma.stageExecutionLog.create({
        data: {
          id: crypto.randomUUID(),
          conversationId: context.conversationId,
          vendorId: context.vendorId,
          messageId: context.messageId,
          stageName,
          stageType: this.getStageType(stageName),
          success: details.success,
          duration: details.duration,
          tokensUsed: details.tokensUsed || 0,
          cost: details.cost || 0,
          model: details.model || null,
          promptTokens: details.promptTokens || 0,
          completionTokens: details.completionTokens || 0,
          errorType: details.errorType || null,
          errorMessage: details.errorMessage || null,
          fallbackUsed: details.fallbackUsed || false
        }
      });

      // Enhanced logging with detailed cost breakdown
      logger.info({
        stageName,
        conversationId: context.conversationId,
        vendorId: context.vendorId,
        success: details.success,
        duration: details.duration,
        tokens: {
          total: details.tokensUsed || 0,
          prompt: details.promptTokens || 0,
          completion: details.completionTokens || 0
        },
        cost: {
          total: details.cost || 0,
          per1KTokens: costPer1K.toFixed(6),
          model: details.model || 'unknown'
        },
        percentageOfTotal: this.totalCost > 0 
          ? ((details.cost || 0) / this.totalCost * 100).toFixed(2) + '%'
          : '0%'
      }, `📊 Stage ${stageName} cost breakdown`);
    } catch (error) {
      logger.warn({ error, stageName }, 'Failed to log stage execution');
    }
  }

  private getStageType(stageName: string): string {
    if (stageName.includes('normalization') || stageName === 'stage_0') return 'normalization';
    if (stageName.includes('intent') || stageName === 'stage_1' || stageName === 'stage_1.5' || stageName === 'stage_1.7') return 'intent';
    if (stageName.includes('ai') || stageName === 'stage_4' || stageName === 'stage_7') return 'ai';
    if (stageName.includes('validation') || stageName === 'stage_4.5' || stageName === 'stage_7.5') return 'validation';
    return 'processing';
  }

  /**
   * Log execution summary
   */
  private async logExecutionSummary(context: StageContext): Promise<void> {
    // Budget monitoring: Alert if cost exceeds $0.0022 per message
    const MAX_COST_PER_MESSAGE = 0.0022;
    const budgetExceeded = this.totalCost > MAX_COST_PER_MESSAGE;
    const budgetPercentage = (this.totalCost / MAX_COST_PER_MESSAGE) * 100;
    
    // Build per-stage cost breakdown
    const stageBreakdown = Array.from(this.stageCosts.entries()).map(([stage, data]) => ({
      stage,
      tokens: data.tokens,
      cost: data.cost,
      model: data.model || 'unknown',
      promptTokens: data.promptTokens || 0,
      completionTokens: data.completionTokens || 0,
      percentage: this.totalCost > 0 ? (data.cost / this.totalCost * 100).toFixed(2) + '%' : '0%'
    })).sort((a, b) => b.cost - a.cost); // Sort by cost descending

    const logData = {
      conversationId: context.conversationId,
      vendorId: context.vendorId,
      messageId: context.messageId,
      stagesExecuted: this.stagesExecuted.length,
      stagesSkipped: this.stagesSkipped.length,
      totalTokensUsed: this.totalTokensUsed,
      totalCost: this.totalCost,
      totalDuration: this.totalDuration,
      errors: this.errors.length,
      costPer1KTokens: this.totalTokensUsed > 0 
        ? (this.totalCost / (this.totalTokensUsed / 1000)).toFixed(6)
        : '0',
      stageBreakdown: stageBreakdown,
      topExpensiveStages: stageBreakdown.slice(0, 5), // Top 5 most expensive stages
      budgetStatus: {
        maxBudget: MAX_COST_PER_MESSAGE,
        actualCost: this.totalCost,
        budgetExceeded: budgetExceeded,
        budgetPercentage: budgetPercentage.toFixed(1) + '%',
        remainingBudget: Math.max(0, MAX_COST_PER_MESSAGE - this.totalCost)
      }
    };

    // Log warning if budget exceeded
    if (budgetExceeded) {
      logger.warn(logData, `⚠️ Budget exceeded: $${this.totalCost.toFixed(6)} exceeds $${MAX_COST_PER_MESSAGE} limit (${budgetPercentage.toFixed(1)}%)`);
    } else {
      logger.info(logData, '✅ Multi-stage execution completed');
    }
  }

  // ---------------------------------------------------------------------------
  // Unified Pipeline — Stages 0 + 1 + 1.5 + 1.7 + 2 + 3 + 4 + 6 → 1 AI call
  // ---------------------------------------------------------------------------

  /**
   * Data-fetch portion of Stage 2, run BEFORE the unified AI call.
   * Uses 'greeting' as the intent so fetchRelevantData returns the full context
   * (products + orders + insights + vendor config).  The memory update that normally
   * happens inside executeStage2 is deferred until after the unified call returns
   * the real intent.
   */
  private async executeStage2PreUnified(context: StageContext): Promise<any> {
    const stageStart = Date.now();
    const stageLogger = getMultiStageLogger(context);

    try {
      // 'greeting' fetches everything: products, orderHistory, insights, vendorConfig
      const data = await fetchRelevantData(
        'greeting',
        {},
        context.conversationId,
        context.vendorId,
        context.customerId,
        context.rawMessage
      );

      // Fetch and attach conversation history to memory (needed by unified call for context)
      const conversationHistory = await prisma.message.findMany({
        where: { conversationId: context.conversationId },
        orderBy: { timestamp: 'desc' },
        take: 15,
        select: { content: true, senderType: true, timestamp: true }
      });
      if (context.memory) {
        context.memory.conversationHistory = conversationHistory.reverse();
      }

      stageLogger.logStage(
        'stage_2', '2', 'fetchRelevantData (pre-unified)',
        { intent: 'greeting (safe-default)', vendorId: context.vendorId },
        { productsCount: data.products?.length || 0, hasPendingOrder: !!data.pendingOrder },
        Date.now() - stageStart,
        { success: true }
      );
      await this.logStageExecution('stage_2', context, {
        success: true, duration: Date.now() - stageStart, tokensUsed: 0, cost: 0
      });
      this.stagesExecuted.push('stage_2');
      return data;
    } catch (error) {
      logger.warn({ err: error, conversationId: context.conversationId }, 'Pre-unified data fetch failed — continuing with empty context');
      this.stagesSkipped.push('stage_2');
      return {};
    }
  }

  /**
   * Execute the unified AI pipeline.
   * Runs Stage 2 (data fetch), then one OpenAI call replacing Stages 0, 1, 1.5, 1.7, 3, 4, 6.
   * Populates context.normalizedMessage, context.intentResult, context.correctionResult,
   * context.aiResponse, and context.refinedResponse.
   */
  private async executeUnifiedPipeline(context: StageContext, startTime: number): Promise<void> {
    const stageLogger = getMultiStageLogger(context);

    // 1. Fetch all context data (Stage 2 — before AI call)
    const fetchedData = await this.executeStage2PreUnified(context);
    context.fetchedData = fetchedData;

    // 2. Single unified AI call
    const unifiedStart = Date.now();
    const result = await executeUnifiedAI(
      context.rawMessage,
      context.memory,
      context.fetchedData,
      context.vendorId,
      context.conversationId
    );

    // 3. Populate context fields that downstream stages expect

    // Stage 0 equivalent
    context.normalizedMessage = {
      original:               context.rawMessage,
      cleaned:                result.normalizedMessage,
      language:               result.language,
      emojisInterpreted:      [],
      typosCorrected:         true,
      abbreviationsExpanded:  true,
      hasEmojis:              /\p{Emoji}/u.test(context.rawMessage),
      informalPatterns:       []
    };

    // Stage 1 equivalent
    context.intentResult = {
      primaryIntent:    result.primaryIntent,
      secondaryIntents: result.secondaryIntents,
      confidence:       result.confidence,
      extractedInfo:    result.extractedInfo,
      needsMoreContext: result.needsMoreContext,
      reasoning:        result.reasoning,
      tokensUsed:       result.tokensUsed,
      cost:             result.cost
    };

    // Stage 1.7 equivalent — apply product correction if detected
    if (result.isCorrection) {
      context.correctionResult = {
        isCorrection:   true,
        correctedField: result.correctedField,
        correctedValue: result.correctedValue
      };
      if (result.correctedField === 'product' && result.correctedValue &&
          context.intentResult.primaryIntent !== 'product_inquiry') {
        const originalIntent = context.intentResult.primaryIntent;
        context.intentResult.primaryIntent = 'product_inquiry';
        context.intentResult.confidence    = 0.8;
        context.intentResult.extractedInfo.products = [result.correctedValue];
        logger.info(
          { conversationId: context.conversationId, originalIntent, correctedProduct: result.correctedValue },
          'Unified: product correction → adjusted intent to product_inquiry'
        );
      }
    }

    // Stage 4 equivalent
    context.aiResponse = {
      response: result.response,
      extractedData: {
        orderItems:       result.orderItems,
        deliveryAddress:  result.deliveryAddress  || undefined,
        specialRequests:  result.specialRequests  || undefined,
        customerInfo:     result.customerName ? { name: result.customerName } : undefined
      },
      needsClarification: result.needsClarification,
      conversationFlow: {
        nextStage:         result.conversationStage,
        naturalTransition: ''
      },
      tokensUsed:       result.tokensUsed,
      cost:             result.cost,
      promptTokens:     result.promptTokens,
      completionTokens: result.completionTokens,
      model:            result.model
    };

    // Stage 6 already handled by unified call — refined response = AI response
    context.refinedResponse = context.aiResponse;

    // 4. Update token/cost totals
    this.totalTokensUsed += result.tokensUsed;
    this.totalCost       += result.cost;

    // 5. Mark collapsed stages
    this.stagesExecuted.push('stage_0', 'stage_1', 'stage_3', 'stage_4');
    this.stagesSkipped.push('stage_1.5', 'stage_1.7', 'stage_6');
    // 1.5 skipped: unified handles multi-intent natively via secondaryIntents
    // 1.7 skipped: unified detects corrections natively via isCorrection field
    // 6   skipped: unified handles refinement natively (one pass response)
    if (result.isCorrection) {
      // Promote stage_1.7 from skipped to executed
      const idx = this.stagesSkipped.indexOf('stage_1.7');
      if (idx !== -1) this.stagesSkipped.splice(idx, 1);
      this.stagesExecuted.push('stage_1.7');
    }

    // 6. Log the unified call as a single stage
    stageLogger.logStage(
      'stage_unified', 'U', 'executeUnifiedAI',
      { rawMessage: context.rawMessage, vendorId: context.vendorId },
      {
        intent:             result.primaryIntent,
        confidence:         result.confidence,
        isCorrection:       result.isCorrection,
        needsClarification: result.needsClarification,
        orderItemsCount:    result.orderItems.length
      },
      Date.now() - unifiedStart,
      {
        success: true,
        tokensUsed: result.tokensUsed,
        cost:       result.cost,
        decision: {
          type:   'unified_processing',
          reason: 'Single AI call replacing Stages 0+1+1.5+1.7+3+4+6',
          outcome: { intent: result.primaryIntent, confidence: result.confidence }
        }
      }
    );
    await this.logStageExecution('stage_unified', context, {
      success: true, duration: Date.now() - unifiedStart,
      tokensUsed: result.tokensUsed, cost: result.cost, model: result.model,
      promptTokens: result.promptTokens, completionTokens: result.completionTokens
    });

    // 7. Post-call memory update (now we have the real intent)
    try {
      const ongoingTopics = extractOngoingTopicsFromIntent(
        result.primaryIntent,
        result.extractedInfo,
        result.secondaryIntents
      );
      await updateConversationMemory(context.conversationId, context.vendorId, {
        currentMessage: context.rawMessage,
        ongoingTopics,
        incrementTurn:  false,
        // Persist the detected language so future turns can mirror it even when the
        // customer switches scripts mid-conversation.
        customerPreferences: { language: result.language }
      });
      await invalidateConversationCache(context.conversationId);
      context.memory = await retrieveConversationMemory({
        conversationId:    context.conversationId,
        vendorId:          context.vendorId,
        normalizedMessage: result.normalizedMessage
      });
    } catch (error) {
      logger.warn({ err: error, conversationId: context.conversationId }, 'Unified pipeline: post-call memory update failed silently');
    }
  }

  // ---------------------------------------------------------------------------
  // Fast Path — pattern-based shortcut for simple messages
  // ---------------------------------------------------------------------------

  /**
   * Determine if the raw message qualifies for a fast-path response.
   * Fast paths skip all AI calls and return in ~200-400 ms.
   *
   * Rules:
   *  - Never fast-path when a human handoff confirmation is pending
   *    (the "yes/no" must reach the handoff logic below).
   *  - Never fast-path when there is a pending order
   *    (a short "hi" during checkout might be a confused confirmation).
   *  - Only fast-path for clearly-greeting messages (short + pattern match).
   */
  private checkFastPath(
    rawMessage: string,
    memory: any
  ): { intent: string; response: string } | null {
    // Safety guards: never bypass when context-sensitive state is active
    if (memory?.handoffConfirmationPending) return null;
    // Don't fast-path mid-conversation — customer may need context-aware response
    const stage = memory?.conversationStage;
    if (stage === 'order_confirmation' || stage === 'information_gathering') return null;

    const msg = rawMessage.trim();

    // Greeting — always route through the unified pipeline so the response uses
    // the vendor's configured aiGreeting, personality, product catalog, and tone.
    // A generic "Hi! Welcome!" ignores all vendor configuration and gives a poor
    // first impression. The cost of one AI call for greetings is well worth it.

    return null;
  }

  /**
   * Execute a fast-path response — no AI calls, minimal latency.
   * Queues the response immediately, then fires memory update and Stage 9.5 async.
   */
  private async handleFastPath(
    context: StageContext,
    fastPath: { intent: string; response: string },
    startTime: number
  ): Promise<MultiStageResponse> {
    const stageLogger = getMultiStageLogger(context);

    logger.info(
      { conversationId: context.conversationId, intent: fastPath.intent, messageLength: context.rawMessage.length },
      'Fast path taken — all AI stages skipped'
    );

    // Stage 9 reads context.intentResult!.primaryIntent — set a synthetic one so it doesn't throw
    context.intentResult = {
      primaryIntent: fastPath.intent,
      confidence: 1.0,
      reasoning: 'Fast path: pattern-based classification, no AI call required',
      extractedInfo: {
        hasDeliveryInfo: false,
        hasSpecialRequests: false,
        mentionsOrder: false,
        urgency: 'low' as const
      },
      secondaryIntents: [],
      needsMoreContext: false
    };

    // All AI and DB-write stages are skipped
    this.stagesSkipped.push(
      'stage_0', 'stage_1', 'stage_1.5', 'stage_1.7',
      'stage_2', 'stage_3', 'stage_4', 'stage_4.5', 'stage_4.7',
      'stage_5', 'stage_6', 'stage_7', 'stage_7.5', 'stage_8', 'stage_8.5'
    );

    // Fire-and-forget: increment turn counter and record the message in memory
    updateConversationMemory(context.conversationId, context.vendorId, {
      currentMessage: context.rawMessage,
      ongoingTopics: [fastPath.intent],
      incrementTurn: true
    }).catch(err =>
      logger.warn({ err, conversationId: context.conversationId }, 'Fast path: memory update failed silently')
    );

    // Queue the response to SQS (Stage 9)
    await this.executeStage9(context, fastPath.response);

    // Fire-and-forget: generate message summary for future intent classification
    this.executeStage9_5(context, fastPath.response);

    this.totalDuration = Date.now() - startTime;
    await this.logExecutionSummary(context);

    stageLogger.logFinalResult(
      fastPath.response,
      fastPath.intent,
      {},
      this.stagesExecuted,
      this.stagesSkipped
    );
    stageLogger.save();
    cleanupLogger(context.messageId);

    return {
      finalMessage: fastPath.response,
      intent: fastPath.intent,
      extractedData: {},
      stagesExecuted: this.stagesExecuted,
      stagesSkipped: this.stagesSkipped,
      totalTokensUsed: 0,
      totalCost: 0,
      qualityScore: undefined
    };
  }

  // ---------------------------------------------------------------------------

  /**
   * Fallback execution when multi-stage fails
   */
  private async executeFallback(context: StageContext): Promise<MultiStageResponse> {
    logger.warn({ conversationId: context.conversationId }, '⚠️ Using fallback execution');

    try {
      const response = await aiService.generateStructuredResponse(
        context.rawMessage,
        context.vendorId,
        context.conversationId
      );

      return {
        finalMessage: response.customerMessage,
        intent: 'other',
        extractedData: {},
        stagesExecuted: ['fallback'],
        stagesSkipped: [],
        totalTokensUsed: response.tokensUsed || 0,
        totalCost: (response.tokensUsed || 0) * 0.0005 / 1000,
        qualityScore: 0,
        tokensUsed: response.tokensUsed || 0,
        orderUpdateEvent: response.orderUpdateEvent,
        customerUpdateEvent: response.customerUpdateEvent
      };
    } catch (error) {
      logger.error(error as Error, 'Fallback execution also failed');
      throw error;
    }
  }
}

