import { SQSClient, CreateQueueCommand, GetQueueUrlCommand } from '@aws-sdk/client-sqs';
import { env } from '../src/config/env.js';
async function ensureQueue(name) {
    const client = new SQSClient({
        region: env.AWS_REGION,
        endpoint: env.AWS_SQS_ENDPOINT || undefined,
        credentials: env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY ? {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            sessionToken: env.AWS_SESSION_TOKEN
        } : undefined
    });
    try {
        console.log(`Checking if queue '${name}' exists...`);
        const existing = await client.send(new GetQueueUrlCommand({ QueueName: name }));
        console.log(`✅ Queue '${name}' already exists: ${existing.QueueUrl}`);
        return existing.QueueUrl;
    }
    catch {
        console.log(`Creating new Standard queue '${name}'...`);
        const created = await client.send(new CreateQueueCommand({
            QueueName: name,
            Attributes: {
                // Standard queue configuration
                MessageRetentionPeriod: '1209600', // 14 days
                VisibilityTimeoutSeconds: '30',
                ReceiveMessageWaitTimeSeconds: '20' // Long polling
            }
        }));
        console.log(`✅ Created Standard queue '${name}': ${created.QueueUrl}`);
        return created.QueueUrl;
    }
}
async function main() {
    console.log('🚀 Initializing SQS Standard Queues for ChatLogix...\n');
    const inQ = await ensureQueue('incoming-queue');
    const outQ = await ensureQueue('response-queue');
    console.log('\n📋 Queue URLs for your .env file:');
    console.log(`INCOMING_QUEUE_URL=${inQ}`);
    console.log(`RESPONSE_QUEUE_URL=${outQ}`);
    console.log(`INCOMING_TEXT_QUEUE_URL=${inQ}`);
    console.log('\n✅ Queue setup complete! Copy the URLs above to your .env file.');
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
