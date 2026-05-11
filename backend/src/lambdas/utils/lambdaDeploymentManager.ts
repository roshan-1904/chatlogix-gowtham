import { LambdaDeploymentService, DeploymentOptions } from '../services/lambdaDeploymentService.js';
import { LambdaConfigurationService, LambdaFunctionDefinition } from '../services/lambdaConfigurationService.js';
import { logger } from '../../logger.js';
import { env } from '../../config/env.js';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export interface DeploymentConfig {
  environment: string;
  region: string;
  s3Bucket: string;
  functions: string[];
  createRole: boolean;
  updateCode: boolean;
  updateConfig: boolean;
}

export class LambdaDeploymentManager {
  private deploymentService: LambdaDeploymentService;
  private configService: LambdaConfigurationService;

  constructor() {
    this.deploymentService = new LambdaDeploymentService();
    this.configService = new LambdaConfigurationService();
  }

  /**
   * Deploy all configured Lambda functions
   */
  async deployAll(config: DeploymentConfig): Promise<void> {
    logger.info({ config }, 'Starting deployment of all Lambda functions');

    const functionDefinitions = LambdaConfigurationService.getFunctionDefinitions();
    const functionsToDeploy = config.functions.length > 0 
      ? functionDefinitions.filter((func: any) => config.functions.includes(func.name))
      : functionDefinitions;

    logger.info({ 
      totalFunctions: functionsToDeploy.length,
      functionNames: functionsToDeploy.map((f: any) => f.name)
    }, 'Functions to deploy');

    const deploymentPromises = functionsToDeploy.map((funcDef: any) => 
      this.deployFunction(funcDef, config)
    );

    const results = await Promise.allSettled(deploymentPromises);
    
    const successful = results.filter((r: any) => r.status === 'fulfilled').length;
    const failed = results.filter((r: any) => r.status === 'rejected').length;

    logger.info({ 
      successful, 
      failed, 
      total: functionsToDeploy.length 
    }, 'Deployment completed');

    // Log failed deployments
    results.forEach((result: any, index: number) => {
      if (result.status === 'rejected') {
        logger.error({ 
          error: result.reason, 
          functionName: functionsToDeploy[index].name 
        }, 'Function deployment failed');
      }
    });

    if (failed > 0) {
      throw new Error(`${failed} out of ${functionsToDeploy.length} function deployments failed`);
    }
  }

  /**
   * Deploy a single Lambda function
   */
  async deployFunction(funcDef: LambdaFunctionDefinition, config: DeploymentConfig): Promise<void> {
    logger.info({ functionName: funcDef.name }, 'Deploying Lambda function');

    try {
      // Validate configuration
      const validation = LambdaConfigurationService.validateConfiguration(funcDef);
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
      }

      // Create deployment package
      const sourceDir = join(process.cwd(), funcDef.sourcePath.replace('src/', 'src/'));
      const outputDir = join(process.cwd(), 'dist', 'lambdas', 'packages');
      const zipFileName = `${funcDef.name}-${Date.now()}.zip`;
      const zipFilePath = join(outputDir, zipFileName);

      // Ensure output directory exists
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      logger.info({ sourceDir, zipFilePath }, 'Creating deployment package');
      await this.deploymentService.createDeploymentPackage(sourceDir, zipFilePath);

      // Prepare deployment options
      // Filter out undefined values from environment
      const environment: Record<string, string> = {};
      Object.keys(funcDef.environment).forEach(key => {
        const value = funcDef.environment[key];
        if (value !== undefined) {
          environment[key] = value;
        }
      });

      const deploymentOptions: DeploymentOptions = {
        s3Bucket: config.s3Bucket,
        s3Key: `functions/${funcDef.name}/${zipFileName}`,
        zipFilePath,
        functionConfig: {
          functionName: funcDef.name,
          handler: funcDef.handler,
          runtime: funcDef.runtime,
          timeout: funcDef.timeout,
          memorySize: funcDef.memorySize,
          environment,
          description: funcDef.description
        },
        createRole: config.createRole,
        updateCode: config.updateCode,
        updateConfig: config.updateConfig
      };

      // Deploy function
      await this.deploymentService.deployFunction(deploymentOptions);

      logger.info({ functionName: funcDef.name }, 'Lambda function deployed successfully');

    } catch (error) {
      logger.error({ error, functionName: funcDef.name }, 'Failed to deploy Lambda function');
      throw error;
    }
  }

  /**
   * List all deployed Lambda functions
   */
  async listFunctions(): Promise<any[]> {
    try {
      const functions = await this.deploymentService.listFunctions();
      logger.info({ count: functions.length }, 'Retrieved Lambda functions');
      return functions;
    } catch (error) {
      logger.error({ error }, 'Failed to list Lambda functions');
      throw error;
    }
  }

  /**
   * Get details of a specific Lambda function
   */
  async getFunctionDetails(functionName: string): Promise<any> {
    try {
      const details = await this.deploymentService.getFunction(functionName);
      logger.info({ functionName }, 'Retrieved Lambda function details');
      return details;
    } catch (error) {
      logger.error({ error, functionName }, 'Failed to get Lambda function details');
      throw error;
    }
  }

  /**
   * Create deployment configuration from environment
   */
  static createDeploymentConfig(): DeploymentConfig {
    const environment = env.NODE_ENV || 'production';
    const region = env.AWS_REGION || 'us-east-1';
    const s3Bucket = LambdaConfigurationService.getDeploymentBucketName(region, environment);

    return {
      environment,
      region,
      s3Bucket,
      functions: [], // Empty array means deploy all functions
      createRole: true,
      updateCode: true,
      updateConfig: true
    };
  }

  /**
   * Validate deployment configuration
   */
  static validateDeploymentConfig(config: DeploymentConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.environment) {
      errors.push('Environment is required');
    }

    if (!config.region) {
      errors.push('AWS region is required');
    }

    if (!config.s3Bucket) {
      errors.push('S3 bucket name is required');
    }

    if (!env.AWS_ACCESS_KEY_ID) {
      errors.push('AWS_ACCESS_KEY_ID environment variable is required');
    }

    if (!env.AWS_SECRET_ACCESS_KEY) {
      errors.push('AWS_SECRET_ACCESS_KEY environment variable is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
