import { LambdaClient, CreateFunctionCommand, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand, GetFunctionCommand, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { IAMClient, CreateRoleCommand, AttachRolePolicyCommand, GetRoleCommand } from '@aws-sdk/client-iam';
import { logger } from '../../logger.js';
import { env } from '../../config/env.js';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

export interface LambdaFunctionConfig {
  functionName: string;
  handler: string;
  runtime: string;
  roleArn?: string;
  timeout?: number;
  memorySize?: number;
  environment?: Record<string, string>;
  description?: string;
}

export interface DeploymentOptions {
  s3Bucket: string;
  s3Key: string;
  zipFilePath: string;
  functionConfig: LambdaFunctionConfig;
  createRole?: boolean;
  updateCode?: boolean;
  updateConfig?: boolean;
}

export class LambdaDeploymentService {
  private lambdaClient: LambdaClient;
  private s3Client: S3Client;
  private iamClient: IAMClient;

  constructor() {
    this.lambdaClient = new LambdaClient({
      region: env.AWS_REGION,
      credentials: env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY ? {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        sessionToken: env.AWS_SESSION_TOKEN
      } : undefined
    });

    this.s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY ? {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        sessionToken: env.AWS_SESSION_TOKEN
      } : undefined
    });

    this.iamClient = new IAMClient({
      region: env.AWS_REGION,
      credentials: env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY ? {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        sessionToken: env.AWS_SESSION_TOKEN
      } : undefined
    });
  }

  /**
   * Deploy a Lambda function with full configuration
   */
  async deployFunction(options: DeploymentOptions): Promise<void> {
    const { functionConfig, s3Bucket, s3Key, zipFilePath, createRole = true, updateCode = true, updateConfig = true } = options;

    try {
      logger.info({ functionName: functionConfig.functionName }, 'Starting Lambda deployment');

      // Step 1: Create or get IAM role
      const roleArn = await this.ensureExecutionRole(functionConfig.functionName, createRole);

      // Step 2: Upload deployment package to S3
      if (updateCode) {
        await this.uploadDeploymentPackage(s3Bucket, s3Key, zipFilePath);
      }

      // Step 3: Check if function exists
      const functionExists = await this.functionExists(functionConfig.functionName);

      if (functionExists) {
        // Update existing function
        logger.info({ functionName: functionConfig.functionName }, 'Updating existing Lambda function');
        
        if (updateCode) {
          await this.updateFunctionCode(functionConfig.functionName, s3Bucket, s3Key);
        }
        
        if (updateConfig) {
          await this.updateFunctionConfiguration(functionConfig, roleArn);
        }
      } else {
        // Create new function
        logger.info({ functionName: functionConfig.functionName }, 'Creating new Lambda function');
        await this.createFunction(functionConfig, s3Bucket, s3Key, roleArn);
      }

      logger.info({ functionName: functionConfig.functionName }, 'Lambda deployment completed successfully');
    } catch (error) {
      logger.error({ error, functionName: functionConfig.functionName }, 'Lambda deployment failed');
      throw error;
    }
  }

  /**
   * Create a deployment package (ZIP file) for Lambda
   */
  async createDeploymentPackage(sourceDir: string, outputPath: string): Promise<void> {
    try {
      logger.info({ sourceDir, outputPath }, 'Creating Lambda deployment package');

      // Ensure output directory exists
      const outputDir = join(outputPath, '..');
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Create ZIP file using PowerShell (Windows) or zip command (Linux/Mac)
      const isWindows = process.platform === 'win32';
      const zipCommand = isWindows 
        ? `powershell Compress-Archive -Path "${sourceDir}\\*" -DestinationPath "${outputPath}" -Force`
        : `zip -r "${outputPath}" "${sourceDir}"`;

      execSync(zipCommand, { stdio: 'inherit' });
      
      logger.info({ outputPath }, 'Deployment package created successfully');
    } catch (error) {
      logger.error({ error, sourceDir, outputPath }, 'Failed to create deployment package');
      throw error;
    }
  }

  /**
   * Ensure execution role exists for Lambda function
   */
  private async ensureExecutionRole(functionName: string, createRole: boolean): Promise<string> {
    const roleName = `${functionName}-execution-role`;
    
    try {
      // Try to get existing role
      const getRoleCommand = new GetRoleCommand({ RoleName: roleName });
      const role = await this.iamClient.send(getRoleCommand);
      logger.info({ roleName }, 'Using existing IAM role');
      if (!role.Role?.Arn) {
        throw new Error(`Role ARN not found for ${roleName}`);
      }
      return role.Role.Arn;
    } catch (error: any) {
      if (error.name === 'NoSuchEntity') {
        if (createRole) {
          logger.info({ roleName }, 'Creating new IAM role for Lambda');
          return await this.createExecutionRole(roleName);
        } else {
          throw new Error(`IAM role ${roleName} does not exist and createRole is false`);
        }
      }
      throw error;
    }
  }

  /**
   * Create IAM execution role for Lambda
   */
  private async createExecutionRole(roleName: string): Promise<string> {
    const trustPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            Service: 'lambda.amazonaws.com'
          },
          Action: 'sts:AssumeRole'
        }
      ]
    };

    const createRoleCommand = new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
      Description: `Execution role for ${roleName}`
    });

    const role = await this.iamClient.send(createRoleCommand);

    // Attach basic execution policy
    const attachPolicyCommand = new AttachRolePolicyCommand({
      RoleName: roleName,
      PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
    });

    await this.iamClient.send(attachPolicyCommand);

    const roleArn = role.Role?.Arn;
    if (!roleArn) {
      throw new Error(`Role ARN not returned after creation for ${roleName}`);
    }
    logger.info({ roleName, roleArn }, 'IAM role created successfully');
    return roleArn;
  }

  /**
   * Upload deployment package to S3
   */
  private async uploadDeploymentPackage(bucket: string, key: string, zipFilePath: string): Promise<void> {
    try {
      const fs = await import('fs');
      const zipBuffer = fs.readFileSync(zipFilePath);

      const putObjectCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: zipBuffer,
        ContentType: 'application/zip'
      });

      await this.s3Client.send(putObjectCommand);
      logger.info({ bucket, key }, 'Deployment package uploaded to S3');
    } catch (error) {
      logger.error({ error, bucket, key }, 'Failed to upload deployment package to S3');
      throw error;
    }
  }

  /**
   * Check if Lambda function exists
   */
  private async functionExists(functionName: string): Promise<boolean> {
    try {
      const getFunctionCommand = new GetFunctionCommand({ FunctionName: functionName });
      await this.lambdaClient.send(getFunctionCommand);
      return true;
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Create new Lambda function
   */
  private async createFunction(config: LambdaFunctionConfig, s3Bucket: string, s3Key: string, roleArn: string): Promise<void> {
    const createFunctionCommand = new CreateFunctionCommand({
      FunctionName: config.functionName,
      Runtime: config.runtime as any,
      Role: roleArn,
      Handler: config.handler,
      Code: {
        S3Bucket: s3Bucket,
        S3Key: s3Key
      },
      Description: config.description || `Lambda function for ${config.functionName}`,
      Timeout: config.timeout || 30,
      MemorySize: config.memorySize || 128,
      Environment: config.environment ? {
        Variables: config.environment
      } : undefined
    });

    await this.lambdaClient.send(createFunctionCommand);
    logger.info({ functionName: config.functionName }, 'Lambda function created');
  }

  /**
   * Update Lambda function code
   */
  private async updateFunctionCode(functionName: string, s3Bucket: string, s3Key: string): Promise<void> {
    const updateCodeCommand = new UpdateFunctionCodeCommand({
      FunctionName: functionName,
      S3Bucket: s3Bucket,
      S3Key: s3Key
    });

    await this.lambdaClient.send(updateCodeCommand);
    logger.info({ functionName }, 'Lambda function code updated');
  }

  /**
   * Update Lambda function configuration
   */
  private async updateFunctionConfiguration(config: LambdaFunctionConfig, roleArn: string): Promise<void> {
    const updateConfigCommand = new UpdateFunctionConfigurationCommand({
      FunctionName: config.functionName,
      Runtime: config.runtime as any,
      Role: roleArn,
      Handler: config.handler,
      Description: config.description || `Lambda function for ${config.functionName}`,
      Timeout: config.timeout || 30,
      MemorySize: config.memorySize || 128,
      Environment: config.environment ? {
        Variables: config.environment
      } : undefined
    });

    await this.lambdaClient.send(updateConfigCommand);
    logger.info({ functionName: config.functionName }, 'Lambda function configuration updated');
  }

  /**
   * List all Lambda functions
   */
  async listFunctions(): Promise<any[]> {
    try {
      const listFunctionsCommand = new ListFunctionsCommand({});
      const response = await this.lambdaClient.send(listFunctionsCommand);
      return response.Functions || [];
    } catch (error) {
      logger.error({ error }, 'Failed to list Lambda functions');
      throw error;
    }
  }

  /**
   * Get function details
   */
  async getFunction(functionName: string): Promise<any> {
    try {
      const getFunctionCommand = new GetFunctionCommand({ FunctionName: functionName });
      const response = await this.lambdaClient.send(getFunctionCommand);
      return response;
    } catch (error) {
      logger.error({ error, functionName }, 'Failed to get Lambda function details');
      throw error;
    }
  }
}
