import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
import { LambdaClient, UpdateEventSourceMappingCommand, GetEventSourceMappingCommand } from '@aws-sdk/client-lambda';

const region = process.env.AWS_REGION || 'ap-south-1';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const credentials = accessKeyId ? { accessKeyId, secretAccessKey } : undefined;
const lambda = new LambdaClient({ region, credentials });

const UUID = '7214e644-7d26-4191-ab59-7c25f9534e11';
const desired = process.argv[2]; // 'disable' or 'enable'

if (!['disable', 'enable'].includes(desired)) {
  console.error('Usage: node _tmp_toggle_mapping.mjs <disable|enable>');
  process.exit(1);
}

await lambda.send(new UpdateEventSourceMappingCommand({
  UUID,
  Enabled: desired === 'enable'
}));

for (let i = 0; i < 30; i++) {
  const res = await lambda.send(new GetEventSourceMappingCommand({ UUID }));
  console.log(`[poll ${i}] State =`, res.State);
  if ((desired === 'disable' && res.State === 'Disabled') || (desired === 'enable' && res.State === 'Enabled')) {
    console.log('Reached target state.');
    process.exit(0);
  }
  await new Promise(r => setTimeout(r, 2000));
}
console.error('Timed out waiting for target state.');
process.exit(1);
