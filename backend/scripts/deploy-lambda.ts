#!/usr/bin/env node

import { LambdaDeploymentManager, DeploymentConfig } from '../src/lambdas/utils/lambdaDeploymentManager.js';
import { LambdaConfigurationService } from '../src/lambdas/services/lambdaConfigurationService.js';
import { logger } from '../src/logger.js';
import { env } from '../src/config/env.js';

/**
 * CLI script for deploying Lambda functions
 * Usage: npm run deploy:lambda [options]
 */

interface CLIOptions {
  environment?: string;
  region?: string;
  functions?: string[];
  s3Bucket?: string;
  createRole?: boolean;
  updateCode?: boolean;
  updateConfig?: boolean;
  list?: boolean;
  details?: string;
  help?: boolean;
}

function parseArguments(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--environment':
      case '-e':
        options.environment = args[++i];
        break;
      case '--region':
      case '-r':
        options.region = args[++i];
        break;
      case '--functions':
      case '-f':
        options.functions = args[++i].split(',');
        break;
      case '--s3-bucket':
      case '-b':
        options.s3Bucket = args[++i];
        break;
      case '--create-role':
        options.createRole = true;
        break;
      case '--no-create-role':
        options.createRole = false;
        break;
      case '--update-code':
        options.updateCode = true;
        break;
      case '--no-update-code':
        options.updateCode = false;
        break;
      case '--update-config':
        options.updateConfig = true;
        break;
      case '--no-update-config':
        options.updateConfig = false;
        break;
      case '--list':
      case '-l':
        options.list = true;
        break;
      case '--details':
      case '-d':
        options.details = args[++i];
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Lambda Deployment CLI

Usage: npm run deploy:lambda [options]

Options:
  -e, --environment <env>     Deployment environment (default: production)
  -r, --region <region>      AWS region (default: us-east-1)
  -f, --functions <list>     Comma-separated list of function names to deploy
  -b, --s3-bucket <bucket>   S3 bucket for deployment packages
  --create-role              Create IAM role if it doesn't exist (default: true)
  --no-create-role           Don't create IAM role
  --update-code              Update function code (default: true)
  --no-update-code           Don't update function code
  --update-config            Update function configuration (default: true)
  --no-update-config         Don't update function configuration
  -l, --list                 List all deployed Lambda functions
  -d, --details <name>       Get details of a specific function
  -h, --help                 Show this help message

Examples:
  npm run deploy:lambda                                    # Deploy all functions
  npm run deploy:lambda -f "response-processor,webhook"   # Deploy specific functions
  npm run deploy:lambda -e staging -r us-west-2           # Deploy to staging in us-west-2
  npm run deploy:lambda --list                             # List all functions
  npm run deploy:lambda --details chatlogix-response-processor  # Get function details

Environment Variables:
  AWS_ACCESS_KEY_ID          AWS access key
  AWS_SECRET_ACCESS_KEY       AWS secret key
  AWS_REGION                  AWS region
  DATABASE_URL                Database connection string
  OPENAI_API_KEY              OpenAI API key
  WHATSAPP_ACCESS_TOKEN       WhatsApp access token
  WHATSAPP_PHONE_NUMBER_ID    WhatsApp phone number ID
  WHATSAPP_WEBHOOK_VERIFY_TOKEN  WhatsApp webhook verify token
  RESPONSE_QUEUE_URL          SQS response queue URL
  TEXT_QUEUE_URL              SQS text queue URL
  AUDIO_QUEUE_URL             SQS audio queue URL
  IMAGE_QUEUE_URL             SQS image queue URL
`);
}

async function main() {
  try {
    const options = parseArguments();

    if (options.help) {
      printHelp();
      return;
    }

    // Initialize deployment manager
    const deploymentManager = new LambdaDeploymentManager();

    // Handle list command
    if (options.list) {
      console.log('📋 Listing Lambda functions...');
      const functions = await deploymentManager.listFunctions();
      
      if (functions.length === 0) {
        console.log('No Lambda functions found.');
        return;
      }

      console.log(`\nFound ${functions.length} Lambda function(s):\n`);
      functions.forEach(func => {
        console.log(`📦 ${func.FunctionName}`);
        console.log(`   Runtime: ${func.Runtime}`);
        console.log(`   Handler: ${func.Handler}`);
        console.log(`   Memory: ${func.MemorySize} MB`);
        console.log(`   Timeout: ${func.Timeout} seconds`);
        console.log(`   Last Modified: ${new Date(func.LastModified).toLocaleString()}`);
        console.log(`   State: ${func.State}`);
        console.log('');
      });
      return;
    }

    // Handle details command
    if (options.details) {
      console.log(`🔍 Getting details for function: ${options.details}`);
      const details = await deploymentManager.getFunctionDetails(options.details);
      
      console.log('\n📋 Function Details:');
      console.log(JSON.stringify(details, null, 2));
      return;
    }

    // Create deployment configuration
    const config: DeploymentConfig = {
      environment: options.environment || env.NODE_ENV || 'production',
      region: options.region || env.AWS_REGION || 'us-east-1',
      s3Bucket: options.s3Bucket || LambdaConfigurationService.getDeploymentBucketName(
        options.region || env.AWS_REGION || 'us-east-1',
        options.environment || env.NODE_ENV || 'production'
      ),
      functions: options.functions || [],
      createRole: options.createRole !== false,
      updateCode: options.updateCode !== false,
      updateConfig: options.updateConfig !== false
    };

    // Validate configuration
    const validation = LambdaDeploymentManager.validateDeploymentConfig(config);
    if (!validation.valid) {
      console.error('❌ Configuration validation failed:');
      validation.errors.forEach(error => console.error(`   - ${error}`));
      process.exit(1);
    }

    // Show configuration
    console.log('🚀 Lambda Deployment Configuration:');
    console.log(`   Environment: ${config.environment}`);
    console.log(`   Region: ${config.region}`);
    console.log(`   S3 Bucket: ${config.s3Bucket}`);
    console.log(`   Functions: ${config.functions.length === 0 ? 'All' : config.functions.join(', ')}`);
    console.log(`   Create Role: ${config.createRole}`);
    console.log(`   Update Code: ${config.updateCode}`);
    console.log(`   Update Config: ${config.updateConfig}`);
    console.log('');

    // Show available functions
    const availableFunctions = LambdaConfigurationService.getFunctionDefinitions();
    console.log('📋 Available Functions:');
    availableFunctions.forEach(func => {
      const willDeploy = config.functions.length === 0 || config.functions.includes(func.name);
      console.log(`   ${willDeploy ? '✅' : '⏭️'} ${func.name} - ${func.description}`);
    });
    console.log('');

    // Deploy functions
    console.log('🚀 Starting deployment...');
    await deploymentManager.deployAll(config);
    
    console.log('✅ Deployment completed successfully!');
    
    // Show deployed functions
    console.log('\n📋 Deployed Functions:');
    const deployedFunctions = await deploymentManager.listFunctions();
    deployedFunctions.forEach(func => {
      console.log(`   ✅ ${func.FunctionName} (${func.State})`);
    });

  } catch (error) {
    console.error('❌ Deployment failed:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
