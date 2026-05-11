import { logger } from '../../logger.js';
import { env } from '../../config/env.js';

export interface LambdaEnvironment {
  NODE_ENV: string;
  DATABASE_URL: string;
  AWS_REGION: string;
  AWS_SQS_ENDPOINT?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SESSION_TOKEN?: string;
  OPENAI_API_KEY: string;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: string;
  RESPONSE_QUEUE_URL: string;
  TEXT_QUEUE_URL: string;
  AUDIO_QUEUE_URL?: string;
  IMAGE_QUEUE_URL?: string;
  MEDIA_FETCH_QUEUE_URL?: string;
  // Deprecated alias for TEXT_QUEUE_URL. Workers read via getTextQueueUrl().
  INCOMING_QUEUE_URL?: string;
  ENABLE_MULTI_STAGE_AI?: string;
  MULTI_STAGE_AI_ROLLOUT_PERCENTAGE?: string;
  LOG_LEVEL: string;
  [key: string]: string | undefined;
}

export interface LambdaFunctionDefinition {
  name: string;
  handler: string;
  runtime: string;
  timeout: number;
  memorySize: number;
  description: string;
  environment: LambdaEnvironment;
  sourcePath: string;
  dependencies: string[];
}

export class LambdaConfigurationService {
  private static readonly DEFAULT_RUNTIME = 'nodejs18.x';
  private static readonly DEFAULT_TIMEOUT = 30;
  private static readonly DEFAULT_MEMORY = 256;

  /**
   * Get base environment variables for all Lambda functions
   */
  static getBaseEnvironment(): LambdaEnvironment {
    return {
      NODE_ENV: env.NODE_ENV || 'production',
      DATABASE_URL: env.DATABASE_URL,
      AWS_REGION: env.AWS_REGION,
      AWS_SQS_ENDPOINT: env.AWS_SQS_ENDPOINT,
      AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
      AWS_SESSION_TOKEN: env.AWS_SESSION_TOKEN,
      OPENAI_API_KEY: env.OPENAI_API_KEY || '',
      WHATSAPP_ACCESS_TOKEN: env.WHATSAPP_ACCESS_TOKEN || '',
      WHATSAPP_PHONE_NUMBER_ID: env.WHATSAPP_PHONE_NUMBER_ID || '',
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || env.WHATSAPP_VERIFY_TOKEN || '',
      RESPONSE_QUEUE_URL: env.RESPONSE_QUEUE_URL,
      TEXT_QUEUE_URL: env.TEXT_QUEUE_URL || env.INCOMING_QUEUE_URL || '',
      AUDIO_QUEUE_URL: env.AUDIO_QUEUE_URL,
      IMAGE_QUEUE_URL: env.IMAGE_QUEUE_URL,
      MEDIA_FETCH_QUEUE_URL: env.MEDIA_FETCH_QUEUE_URL,
      INCOMING_QUEUE_URL: env.INCOMING_QUEUE_URL,
      ENABLE_MULTI_STAGE_AI: env.ENABLE_MULTI_STAGE_AI,
      MULTI_STAGE_AI_ROLLOUT_PERCENTAGE: env.MULTI_STAGE_AI_ROLLOUT_PERCENTAGE,
      LOG_LEVEL: env.LOG_LEVEL || 'info'
    };
  }

  /**
   * Get predefined Lambda function configurations
   */
  static getFunctionDefinitions(): LambdaFunctionDefinition[] {
    const baseEnv = this.getBaseEnvironment();

    return [
      {
        name: 'chatlogix-response-processor',
        handler: 'dist/lambdas/handlers/responseProcessor.handler',
        runtime: this.DEFAULT_RUNTIME,
        timeout: 60,
        memorySize: 512,
        description: 'Processes response messages from SQS queue and sends WhatsApp messages',
        environment: baseEnv,
        sourcePath: 'src/lambdas/handlers/responseProcessor.ts',
        dependencies: ['@aws-sdk/client-sqs', '@aws-sdk/client-lambda']
      },
      {
        name: 'chatlogix-webhook-handler',
        handler: 'dist/lambdas/handlers/webhookHandler.handler',
        runtime: this.DEFAULT_RUNTIME,
        timeout: 30,
        memorySize: 256,
        description: 'Handles WhatsApp webhook events and routes messages to appropriate queues',
        environment: baseEnv,
        sourcePath: 'src/lambdas/handlers/webhookHandler.ts',
        dependencies: ['@aws-sdk/client-sqs']
      },
      {
        name: 'chatlogix-multi-stage-processor',
        handler: 'dist/lambdas/handlers/multiStageProcessor.handler',
        runtime: this.DEFAULT_RUNTIME,
        timeout: 300,
        memorySize: 2048,
        description: 'Processes incoming messages through multi-stage AI pipeline with feature flag support',
        environment: baseEnv,
        sourcePath: 'src/lambdas/handlers/multiStageProcessor.ts',
        dependencies: ['@aws-sdk/client-sqs', 'openai', '@prisma/client']
      }
    ];
  }

  /**
   * Get configuration for a specific function
   */
  static getFunctionDefinition(functionName: string): LambdaFunctionDefinition | undefined {
    return this.getFunctionDefinitions().find(func => func.name === functionName);
  }

  /**
   * Validate Lambda function configuration
   */
  static validateConfiguration(config: LambdaFunctionDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.name) {
      errors.push('Function name is required');
    }

    if (!config.handler) {
      errors.push('Handler is required');
    }

    if (!config.runtime) {
      errors.push('Runtime is required');
    }

    if (config.timeout && (config.timeout < 1 || config.timeout > 900)) {
      errors.push('Timeout must be between 1 and 900 seconds');
    }

    if (config.memorySize && (config.memorySize < 128 || config.memorySize > 10240)) {
      errors.push('Memory size must be between 128 and 10240 MB');
    }

    if (!config.environment.DATABASE_URL) {
      errors.push('DATABASE_URL environment variable is required');
    }

    if (!config.environment.OPENAI_API_KEY) {
      errors.push('OPENAI_API_KEY environment variable is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate deployment configuration for all functions
   */
  static generateDeploymentConfig(): any {
    const functions = this.getFunctionDefinitions();
    
    return {
      functions: functions.map(func => ({
        name: func.name,
        handler: func.handler,
        runtime: func.runtime,
        timeout: func.timeout,
        memorySize: func.memorySize,
        description: func.description,
        environment: func.environment,
        sourcePath: func.sourcePath,
        dependencies: func.dependencies
      })),
      deployment: {
        s3Bucket: `${env.AWS_REGION}-chatlogix-lambda-deployments`,
        region: env.AWS_REGION,
        createRole: true,
        updateCode: true,
        updateConfig: true
      }
    };
  }

  /**
   * Get Lambda function naming convention
   */
  static getFunctionName(service: string, environment: string = 'prod'): string {
    return `chatlogix-${service}-${environment}`;
  }

  /**
   * Get S3 bucket name for deployments
   */
  static getDeploymentBucketName(region: string, environment: string = 'prod'): string {
    return `${region}-chatlogix-lambda-deployments-${environment}`;
  }
}
