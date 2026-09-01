import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

export const sqsClient = new SQSClient({
  region: env.AWS_REGION,
  endpoint: env.AWS_SQS_ENDPOINT || undefined,
  credentials: env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    sessionToken: env.AWS_SESSION_TOKEN
  } : undefined
});

export async function publishToQueue(
  queueUrl: string,
  payload: unknown,
  opts?: { delaySeconds?: number }
): Promise<void> {
  const messageBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  // SQS caps DelaySeconds at 900 (15 min). Clamp here so callers can pass higher values
  // without the API rejecting the send.
  const delaySeconds =
    opts?.delaySeconds !== undefined
      ? Math.max(0, Math.min(900, Math.floor(opts.delaySeconds)))
      : undefined;
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: messageBody,
      ...(delaySeconds !== undefined ? { DelaySeconds: delaySeconds } : {})
    })
  );
}

// `visibilityTimeout` defaults to the prior hardcoded 30s so every existing
// caller is unaffected. The new conversation-processor local worker (Step 10)
// passes a longer value — a burst-merge+lock-retry+LLM sequence can approach
// 15-30s at p99, and 30s was already tight before that (see
// docs/CONVERSATION_PROCESSOR_IMPLEMENTATION_PLAN.md Step 8).
export async function receiveMessages(queueUrl: string, maxMessages = 10, visibilityTimeout = 30) {
  const res = await sqsClient.send(new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: maxMessages,
    WaitTimeSeconds: 20,
    VisibilityTimeout: visibilityTimeout
  }));
  return res.Messages ?? [];
}

export async function deleteMessage(queueUrl: string, receiptHandle: string) {
  await sqsClient.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }));
}

export async function getApproxQueueSize(queueUrl: string): Promise<number> {
  try {
    const res = await sqsClient.send(new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages']
    }));
    const num = res.Attributes?.ApproximateNumberOfMessages;
    return num ? Number(num) : 0;
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch queue size');
    return 0;
  }
}


