import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  ResourceAlreadyExistsException
} from '@aws-sdk/client-cloudwatch-logs';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

const LOG_GROUP = (env.TURN_AUDIT_LOG_GROUP ?? '').trim();
const REGION = env.TURN_AUDIT_LOG_REGION || env.CLOUDWATCH_REGION || env.AWS_REGION || 'ap-south-1';

let client: CloudWatchLogsClient | null = null;
const streamTokens = new Map<string, string | undefined>();
let logGroupEnsured = false;

function getClient(): CloudWatchLogsClient {
  if (!client) {
    client = new CloudWatchLogsClient({ region: REGION });
  }
  return client;
}

export function isTurnAuditLogGroupConfigured(): boolean {
  return LOG_GROUP.length > 0;
}

function streamNameFor(vendorId: string | undefined): string {
  const vendor = (vendorId || 'unknown_vendor').replace(/[^\w-]/g, '_');
  const day = new Date().toISOString().slice(0, 10);
  return `${vendor}/${day}`;
}

async function ensureLogGroup(): Promise<void> {
  if (logGroupEnsured || !LOG_GROUP) return;
  try {
    await getClient().send(new CreateLogGroupCommand({ logGroupName: LOG_GROUP }));
  } catch (err) {
    if (!(err instanceof ResourceAlreadyExistsException)) {
      throw err;
    }
  }
  logGroupEnsured = true;
}

async function ensureLogStream(streamName: string): Promise<void> {
  try {
    await getClient().send(
      new CreateLogStreamCommand({
        logGroupName: LOG_GROUP,
        logStreamName: streamName
      })
    );
    streamTokens.set(streamName, undefined);
  } catch (err) {
    if (!(err instanceof ResourceAlreadyExistsException)) {
      throw err;
    }
  }
}

function extractExpectedSequenceToken(message: string): string | undefined {
  const match = message.match(/sequenceToken is: (\S+)/);
  return match?.[1];
}

/**
 * Best-effort write of one turn-audit JSON line to the dedicated log group.
 * Never throws — failures are warned once per batch style via logger.
 */
export async function publishTurnAuditToCloudWatch(
  envelope: Record<string, unknown>
): Promise<void> {
  if (!LOG_GROUP) return;

  const streamName = streamNameFor(
    typeof envelope.vendorId === 'string' ? envelope.vendorId : undefined
  );
  const message = JSON.stringify(envelope);

  try {
    await ensureLogGroup();
    await ensureLogStream(streamName);

    const put = async (sequenceToken?: string) => {
      const response = await getClient().send(
        new PutLogEventsCommand({
          logGroupName: LOG_GROUP,
          logStreamName: streamName,
          sequenceToken,
          logEvents: [
            {
              timestamp: Date.now(),
              message
            }
          ]
        })
      );
      streamTokens.set(streamName, response.nextSequenceToken);
    };

    let token = streamTokens.get(streamName);
    try {
      await put(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('InvalidSequenceTokenException') || msg.includes('Data already accepted')) {
        const expected = extractExpectedSequenceToken(msg);
        await put(expected);
        return;
      }
      throw err;
    }
  } catch (err) {
    logger.warn(
      { err, logGroup: LOG_GROUP, streamName, checkpoint: envelope.checkpoint },
      'turn_audit_cloudwatch_publish_failed'
    );
  }
}
