import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';

const region = process.env.AWS_REGION || 'ap-south-1';
const credentials = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };
const logs = new CloudWatchLogsClient({ region, credentials });

const since = Date.now() - 3 * 60 * 1000; // last 3 minutes

try {
  const res = await logs.send(new FilterLogEventsCommand({
    logGroupName: '/aws/lambda/chatlogix-webhook-handler',
    startTime: since
  }));
  console.log(`Found ${res.events?.length || 0} events in the last 3 minutes:`);
  for (const e of res.events || []) {
    console.log(new Date(e.timestamp).toISOString(), '-', e.message.slice(0, 200));
  }
} catch (err) {
  console.error('ERROR:', err.name, err.message);
}
