import {
  CloudWatchClient,
  PutMetricDataCommand,
  type StandardUnit
} from '@aws-sdk/client-cloudwatch';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

/**
 * Thin CloudWatch metrics wrapper used by the WhatsApp Conversation Parity
 * pipeline. Always logs the metric as a structured Pino line so dev/observability
 * keeps working when CloudWatch is disabled. When `CLOUDWATCH_METRICS_ENABLED=true`,
 * also forwards to CloudWatch (best-effort, never throws).
 */

const ENABLED = (env.CLOUDWATCH_METRICS_ENABLED ?? 'false').toLowerCase() === 'true';
const NAMESPACE = env.CLOUDWATCH_NAMESPACE ?? 'ChatLogix/ConversationParity';
const REGION = env.CLOUDWATCH_REGION || env.AWS_REGION;

let client: CloudWatchClient | null = null;
function getClient(): CloudWatchClient {
  if (!client) {
    client = new CloudWatchClient({
      region: REGION,
      ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
              ...(env.AWS_SESSION_TOKEN ? { sessionToken: env.AWS_SESSION_TOKEN } : {})
            }
          }
        : {})
    });
  }
  return client;
}

export interface MetricOptions {
  unit?: StandardUnit;
  dimensions?: Record<string, string | number | undefined | null>;
}

function dimensionsToArray(d?: MetricOptions['dimensions']) {
  if (!d) return [];
  return Object.entries(d)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([Name, Value]) => ({ Name, Value: String(Value) }));
}

export function emitMetric(name: string, value = 1, opts: MetricOptions = {}): void {
  // Always log first — this is the dev-loop signal.
  logger.info(
    {
      metric: name,
      value,
      unit: opts.unit ?? 'Count',
      dimensions: opts.dimensions ?? {}
    },
    `metric:${name}`
  );

  if (!ENABLED) return;

  const command = new PutMetricDataCommand({
    Namespace: NAMESPACE,
    MetricData: [
      {
        MetricName: name,
        Value: value,
        Unit: opts.unit ?? 'Count',
        Timestamp: new Date(),
        Dimensions: dimensionsToArray(opts.dimensions)
      }
    ]
  });

  getClient()
    .send(command)
    .catch((err: unknown) => {
      logger.warn({ err, metric: name }, 'cloudwatch_metric_publish_failed');
    });
}

export function emitDuration(name: string, milliseconds: number, opts: MetricOptions = {}): void {
  emitMetric(name, milliseconds, { ...opts, unit: opts.unit ?? 'Milliseconds' });
}
