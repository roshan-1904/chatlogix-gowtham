import {
  SQSClient,
  CreateQueueCommand,
  GetQueueUrlCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand
} from '@aws-sdk/client-sqs';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';

const localEnvPath = path.resolve(process.cwd(), '.env');
const rootEnvPath = path.resolve(process.cwd(), '..', '.env');
const backendEnvPath = path.resolve(process.cwd(), 'backend', '.env');
if (existsSync(localEnvPath)) {
  loadEnv({ path: localEnvPath });
} else if (existsSync(rootEnvPath)) {
  loadEnv({ path: rootEnvPath });
} else if (existsSync(backendEnvPath)) {
  loadEnv({ path: backendEnvPath });
} else {
  loadEnv();
}

const awsRegion = process.env.AWS_REGION || 'ap-south-1';
const awsSqsEndpoint = process.env.AWS_SQS_ENDPOINT || undefined;
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const awsSessionToken = process.env.AWS_SESSION_TOKEN;

interface QueueSpec {
  name: string;
  envVar: string;
  // DLQ name to attach via RedrivePolicy. Skipped if undefined.
  dlq?: string;
}

// Mirror of the AWS prod queues without the chatlogix-*-prod suffix so the
// same script works against LocalStack. Prod equivalents are listed in
// docs/DEPLOYMENT.md.
const DLQS: ReadonlyArray<string> = [
  'text-dlq',
  'response-dlq',
  'audio-dlq',
  'image-dlq'
];

const MAIN_QUEUES: ReadonlyArray<QueueSpec> = [
  { name: 'text-queue',        envVar: 'TEXT_QUEUE_URL',        dlq: 'text-dlq' },
  { name: 'response-queue',    envVar: 'RESPONSE_QUEUE_URL',    dlq: 'response-dlq' },
  { name: 'audio-queue',       envVar: 'AUDIO_QUEUE_URL',       dlq: 'audio-dlq' },
  { name: 'image-queue',       envVar: 'IMAGE_QUEUE_URL',       dlq: 'image-dlq' },
  // media-fetch-queue handles its own retries via attemptIndex + DelaySeconds,
  // so no DLQ — terminal failures are tracked in messageMedia.fetchState.
  { name: 'media-fetch-queue', envVar: 'MEDIA_FETCH_QUEUE_URL' }
];

function makeClient(): SQSClient {
  return new SQSClient({
    region: awsRegion,
    endpoint: awsSqsEndpoint,
    credentials: awsAccessKeyId && awsSecretAccessKey ? {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
      sessionToken: awsSessionToken
    } : undefined
  });
}

async function getQueueArn(client: SQSClient, queueUrl: string): Promise<string> {
  const res = await client.send(new GetQueueAttributesCommand({
    QueueUrl: queueUrl,
    AttributeNames: ['QueueArn']
  }));
  const arn = res.Attributes?.QueueArn;
  if (!arn) throw new Error(`Could not resolve ARN for queue ${queueUrl}`);
  return arn;
}

async function ensureQueue(
  client: SQSClient,
  name: string,
  attributes: Record<string, string> = {}
): Promise<string> {
  try {
    const existing = await client.send(new GetQueueUrlCommand({ QueueName: name }));
    console.log(`✓ Queue '${name}' already exists: ${existing.QueueUrl}`);
    return existing.QueueUrl!;
  } catch {
    const created = await client.send(new CreateQueueCommand({
      QueueName: name,
      Attributes: {
        MessageRetentionPeriod: '1209600',         // 14 days
        VisibilityTimeoutSeconds: '30',
        ReceiveMessageWaitTimeSeconds: '20',       // long polling
        ...attributes
      }
    }));
    console.log(`+ Created queue '${name}': ${created.QueueUrl}`);
    return created.QueueUrl!;
  }
}

async function attachDlq(
  client: SQSClient,
  mainUrl: string,
  dlqUrl: string,
  maxReceives = 3
): Promise<void> {
  const dlqArn = await getQueueArn(client, dlqUrl);
  await client.send(new SetQueueAttributesCommand({
    QueueUrl: mainUrl,
    Attributes: {
      RedrivePolicy: JSON.stringify({
        deadLetterTargetArn: dlqArn,
        maxReceiveCount: String(maxReceives)
      })
    }
  }));
}

async function main(): Promise<void> {
  console.log(`\nInitializing SQS queues against ${awsSqsEndpoint || 'AWS ' + awsRegion}\n`);
  const client = makeClient();

  // 1. DLQs first so main queues can reference them
  const dlqUrls = new Map<string, string>();
  for (const dlq of DLQS) {
    dlqUrls.set(dlq, await ensureQueue(client, dlq));
  }

  // 2. Main queues, attaching DLQ where specified
  const mainUrls = new Map<string, string>();
  for (const spec of MAIN_QUEUES) {
    const url = await ensureQueue(client, spec.name);
    mainUrls.set(spec.envVar, url);
    if (spec.dlq) {
      const dlqUrl = dlqUrls.get(spec.dlq);
      if (!dlqUrl) {
        console.warn(`  ! DLQ ${spec.dlq} missing for ${spec.name}; skipping redrive policy`);
        continue;
      }
      await attachDlq(client, url, dlqUrl);
      console.log(`  → ${spec.name} redrive: ${spec.dlq} (maxReceives=3)`);
    }
  }

  console.log('\n--- Copy these into your .env ---');
  for (const [envVar, url] of mainUrls) {
    console.log(`${envVar}=${url}`);
  }
  console.log('--- end ---\n');
  console.log('Queue setup complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
