import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
import { LambdaClient, GetFunctionCommand } from '@aws-sdk/client-lambda';

const region = process.env.AWS_REGION || 'ap-south-1';
const credentials = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };
const lambda = new LambdaClient({ region, credentials });

const res = await lambda.send(new GetFunctionCommand({ FunctionName: 'chatlogix-webhook-handler' }));
const cfg = res.Configuration;
console.log('Handler:', cfg.Handler);
console.log('LastModified:', cfg.LastModified);
console.log('Environment keys:', cfg.Environment ? Object.keys(cfg.Environment.Variables || {}) : 'none');
console.log('Has WHATSAPP_VERIFY_TOKEN:', !!(cfg.Environment?.Variables?.WHATSAPP_VERIFY_TOKEN));
console.log('Has WHATSAPP_WEBHOOK_VERIFY_TOKEN:', !!(cfg.Environment?.Variables?.WHATSAPP_WEBHOOK_VERIFY_TOKEN));
