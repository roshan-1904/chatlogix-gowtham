import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });

import {
  LambdaClient,
  GetFunctionConfigurationCommand,
  UpdateFunctionConfigurationCommand,
  ListEventSourceMappingsCommand,
  UpdateEventSourceMappingCommand,
  GetEventSourceMappingCommand
} from '@aws-sdk/client-lambda';

const region = process.env.AWS_REGION || 'ap-south-1';
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
};
const lambda = new LambdaClient({ region, credentials });

async function waitUpdated(functionName) {
  // Simple poll so subsequent config calls on the same function don't 409.
  for (let i = 0; i < 15; i++) {
    const cfg = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: functionName }));
    if (cfg.LastUpdateStatus !== 'InProgress') return cfg;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Timed out waiting for ${functionName} update to settle`);
}

console.log('=== 1. chatlogix-webhook-handler: add WHATSAPP_WEBHOOK_VERIFY_TOKEN ===');
{
  const fn = 'chatlogix-webhook-handler';
  const cfg = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fn }));
  const vars = { ...(cfg.Environment?.Variables || {}) };
  if (!vars.WHATSAPP_VERIFY_TOKEN) {
    throw new Error('WHATSAPP_VERIFY_TOKEN not found on webhook-handler; aborting');
  }
  vars.WHATSAPP_WEBHOOK_VERIFY_TOKEN = vars.WHATSAPP_VERIFY_TOKEN;
  await lambda.send(new UpdateFunctionConfigurationCommand({
    FunctionName: fn,
    Environment: { Variables: vars }
  }));
  console.log('  Added WHATSAPP_WEBHOOK_VERIFY_TOKEN (copied from WHATSAPP_VERIFY_TOKEN).');
  await waitUpdated(fn);
}

console.log('\n=== 2. chatlogix-incoming-response-generator: swap handler to conversationProcessor ===');
{
  const fn = 'chatlogix-incoming-response-generator';
  const before = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fn }));
  console.log('  Before Handler:', before.Handler);
  await lambda.send(new UpdateFunctionConfigurationCommand({
    FunctionName: fn,
    Handler: 'dist/lambdas/handlers/conversationProcessor.handler'
  }));
  await waitUpdated(fn);
  const after = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fn }));
  console.log('  After Handler:', after.Handler);
}

console.log('\n=== 3. chatlogix-incoming-response-generator: fix SQS triggers ===');
{
  const fn = 'chatlogix-incoming-response-generator';
  const esm = await lambda.send(new ListEventSourceMappingsCommand({ FunctionName: fn }));
  for (const m of esm.EventSourceMappings || []) {
    const isText = m.EventSourceArn.endsWith(':chatlogix-text-queue-prod');
    const isAudioOrImage = m.EventSourceArn.endsWith(':chatlogix-audio-queue-prod') || m.EventSourceArn.endsWith(':chatlogix-image-queue-prod');

    if (isText) {
      console.log(`  Text queue mapping ${m.UUID}: enabling, batch size 1, ReportBatchItemFailures`);
      await lambda.send(new UpdateEventSourceMappingCommand({
        UUID: m.UUID,
        Enabled: true,
        BatchSize: 1,
        FunctionResponseTypes: ['ReportBatchItemFailures']
      }));
    } else if (isAudioOrImage) {
      console.log(`  Disabling audio/image mapping ${m.UUID} (${m.EventSourceArn}) — text-only per Q5`);
      await lambda.send(new UpdateEventSourceMappingCommand({
        UUID: m.UUID,
        Enabled: false
      }));
    } else {
      console.log(`  Leaving unrelated mapping alone: ${m.EventSourceArn}`);
    }
  }
}

console.log('\n=== 4. chatlogix-order-recovery: fix handler + stale env vars ===');
{
  const fn = 'chatlogix-order-recovery';
  const cfg = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fn }));
  console.log('  Before Handler:', cfg.Handler);
  const vars = { ...(cfg.Environment?.Variables || {}) };
  if (vars.RESPONSE_QUEUE_URL) vars.RESPONSE_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/987272474004/chatlogix-response-queue-prod';
  if (vars.INCOMING_QUEUE_URL) vars.INCOMING_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/987272474004/chatlogix-text-queue-prod';
  await lambda.send(new UpdateFunctionConfigurationCommand({
    FunctionName: fn,
    Handler: 'dist/lambdas/handlers/orderRecovery.handler',
    Environment: { Variables: vars }
  }));
  await waitUpdated(fn);
  const after = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fn }));
  console.log('  After Handler:', after.Handler, '(code for this file is not deployed yet — needs next CI deploy)');
}

console.log('\n=== 5. chatlogix-whatsapp-response-dispatcher: fix stale env vars ===');
{
  const fn = 'chatlogix-whatsapp-response-dispatcher';
  const cfg = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fn }));
  const vars = { ...(cfg.Environment?.Variables || {}) };
  console.log('  Before RESPONSE_QUEUE_URL:', vars.RESPONSE_QUEUE_URL);
  console.log('  Before INCOMING_QUEUE_URL:', vars.INCOMING_QUEUE_URL);
  if (vars.RESPONSE_QUEUE_URL) vars.RESPONSE_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/987272474004/chatlogix-response-queue-prod';
  if (vars.INCOMING_QUEUE_URL) vars.INCOMING_QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/987272474004/chatlogix-text-queue-prod';
  await lambda.send(new UpdateFunctionConfigurationCommand({
    FunctionName: fn,
    Environment: { Variables: vars }
  }));
  console.log('  Updated.');
}

console.log('\n=== VERIFY: final state ===');
for (const fn of ['chatlogix-webhook-handler', 'chatlogix-incoming-response-generator', 'chatlogix-whatsapp-response-dispatcher', 'chatlogix-order-recovery']) {
  const cfg = await waitUpdated(fn);
  console.log(`--- ${fn} ---`);
  console.log('  Handler:', cfg.Handler, ' LastUpdateStatus:', cfg.LastUpdateStatus);
  const esm = await lambda.send(new ListEventSourceMappingsCommand({ FunctionName: fn }));
  for (const m of esm.EventSourceMappings || []) {
    console.log('  Trigger:', m.EventSourceArn, 'State:', m.State, 'BatchSize:', m.BatchSize, 'FunctionResponseTypes:', m.FunctionResponseTypes);
  }
}
