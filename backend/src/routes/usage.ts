import express from 'express';
import { costMonitor } from '../utils/costMonitor.js';
import { logger } from '../logger.js';
import { requireRole } from '../middleware/authorize.js';

export const usageRouter = express.Router();

usageRouter.use(requireRole('admin'));

// GET /api/usage - Get current OpenAI usage
usageRouter.get('/', (req, res) => {
  try {
    const usage = costMonitor.getDailyUsage();
    
    res.json({
      success: true,
      data: {
        dailyUsage: usage,
        budget: {
          limit: 120, // $120 from your OpenAI account
          used: usage.cost,
          remaining: 120 - usage.cost,
          percentage: (usage.cost / 120) * 100
        },
        recommendations: getRecommendations(usage.cost)
      }
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching usage data');
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage data'
    });
  }
});

// POST /api/usage/reset - Reset daily usage (for testing)
usageRouter.post('/reset', (req, res) => {
  try {
    costMonitor.resetDailyUsage();
    res.json({
      success: true,
      message: 'Daily usage reset successfully'
    });
  } catch (error) {
    logger.error({ error }, 'Error resetting usage data');
    res.status(500).json({
      success: false,
      error: 'Failed to reset usage data'
    });
  }
});

function getRecommendations(cost: number): string[] {
  const recommendations: string[] = [];
  
  if (cost > 10) {
    recommendations.push('Consider using fallback responses more frequently');
  }
  
  if (cost > 50) {
    recommendations.push('Review system prompts to reduce token usage');
  }
  
  if (cost > 100) {
    recommendations.push('Consider implementing request queuing to reduce API calls');
  }
  
  if (cost > 110) {
    recommendations.push('URGENT: Approaching budget limit - consider pausing AI features');
  }
  
  return recommendations;
}
