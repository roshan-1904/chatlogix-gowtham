import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SQSEvent, SQSRecord } from 'aws-lambda';

const processResponseMessageMock = vi.fn();

vi.mock('../../../workers/responseProcessor.js', () => ({
  processResponseMessage: (...args: unknown[]) => processResponseMessageMock(...args)
}));

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  StepLogger: class {
    step() {}
    warn() {}
    success() {}
    error() {}
  },
  createOperationId: (prefix: string) => `${prefix}_test`
}));

import { handler } from '../responseProcessor.js';

function makeRecord(messageId: string, body: unknown): SQSRecord {
  return {
    messageId,
    receiptHandle: 'rh-' + messageId,
    body: JSON.stringify(body),
    attributes: {} as any,
    messageAttributes: {},
    md5OfBody: '',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:ap-south-1:000:test',
    awsRegion: 'ap-south-1'
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('responseProcessor Lambda handler — ReportBatchItemFailures', () => {
  it('reports only the failed records in a mixed success/failure batch (regression: previously swallowed failures and let SQS delete the whole batch)', async () => {
    processResponseMessageMock
      .mockResolvedValueOnce(undefined) // record-1 succeeds
      .mockRejectedValueOnce(new Error('WhatsApp send failed: 500')) // record-2 fails
      .mockResolvedValueOnce(undefined); // record-3 succeeds

    const event: SQSEvent = {
      Records: [
        makeRecord('record-1', { to: '919000000001', text: 'hi' }),
        makeRecord('record-2', { to: '919000000002', text: 'hi' }),
        makeRecord('record-3', { to: '919000000003', text: 'hi' })
      ]
    };

    const result = await handler(event, {} as any, {} as any);

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'record-2' }] });
  });

  it('reports no failures when every record succeeds', async () => {
    processResponseMessageMock.mockResolvedValue(undefined);

    const event: SQSEvent = {
      Records: [makeRecord('record-1', { to: '919000000001', text: 'hi' })]
    };

    const result = await handler(event, {} as any, {} as any);

    expect(result).toEqual({ batchItemFailures: [] });
  });

  it('reports a record with no body as a failure rather than silently dropping it', async () => {
    const event: SQSEvent = {
      Records: [{ ...makeRecord('record-1', {}), body: '' }]
    };

    const result = await handler(event, {} as any, {} as any);

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'record-1' }] });
    expect(processResponseMessageMock).not.toHaveBeenCalled();
  });

  it('reports every record as failed when they all fail', async () => {
    processResponseMessageMock.mockRejectedValue(new Error('WhatsApp credentials not configured'));

    const event: SQSEvent = {
      Records: [makeRecord('record-1', { to: '919000000001', text: 'hi' }), makeRecord('record-2', { to: '919000000002', text: 'hi' })]
    };

    const result = await handler(event, {} as any, {} as any);

    expect(result).toEqual({
      batchItemFailures: expect.arrayContaining([{ itemIdentifier: 'record-1' }, { itemIdentifier: 'record-2' }])
    });
    expect((result as any).batchItemFailures).toHaveLength(2);
  });
});
