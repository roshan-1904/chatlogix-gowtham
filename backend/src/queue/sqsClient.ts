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

export async function receiveMessages(queueUrl: string, maxMessages = 10) {
  const res = await sqsClient.send(new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: maxMessages,
    WaitTimeSeconds: 20,
    VisibilityTimeout: 30
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


