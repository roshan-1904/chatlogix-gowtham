import { logger } from '../logger.js';

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

class CostMonitor {
  private static instance: CostMonitor;
  private dailyUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0
  };

  // GPT-3.5-turbo pricing (as of 2024)
  private readonly PRICING = {
    prompt: 0.0005 / 1000, // $0.0005 per 1K prompt tokens
    completion: 0.0015 / 1000 // $0.0015 per 1K completion tokens
  };

  static getInstance(): CostMonitor {
    if (!CostMonitor.instance) {
      CostMonitor.instance = new CostMonitor();
    }
    return CostMonitor.instance;
  }

  logUsage(usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) {
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || (promptTokens + completionTokens);
    
    const cost = (promptTokens * this.PRICING.prompt) + (completionTokens * this.PRICING.completion);
    
    this.dailyUsage.promptTokens += promptTokens;
    this.dailyUsage.completionTokens += completionTokens;
    this.dailyUsage.totalTokens += totalTokens;
    this.dailyUsage.cost += cost;

    logger.info({
      promptTokens,
      completionTokens,
      totalTokens,
      cost: cost.toFixed(6),
      dailyTotal: this.dailyUsage.cost.toFixed(4),
      dailyTokens: this.dailyUsage.totalTokens
    }, '💰 OpenAI API Usage');

    // Warn if approaching daily budget limits
    if (this.dailyUsage.cost > 1.0) { // $1.00
      logger.warn({
        dailyCost: this.dailyUsage.cost.toFixed(4),
        dailyTokens: this.dailyUsage.totalTokens
      }, '⚠️ Daily OpenAI usage approaching limit');
    }
  }

  getDailyUsage(): TokenUsage {
    return { ...this.dailyUsage };
  }

  resetDailyUsage() {
    this.dailyUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0
    };
    logger.info('🔄 Daily OpenAI usage reset');
  }
}

export const costMonitor = CostMonitor.getInstance();
