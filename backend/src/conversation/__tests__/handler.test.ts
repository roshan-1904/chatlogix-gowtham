import { describe, it, expect, vi, beforeEach } from 'vitest';

const processMessageMock = vi.fn();
vi.mock('../pipeline.js', () => ({
  processMessage: (...args: unknown[]) => processMessageMock(...args)
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { handler } from '../handler.js';

function record(overrides: Partial<{ messageId: string; body: string }> = {}) {
  return {
    messageId: 'sqs-msg-1',
    body: JSON.stringify({
      type: 'TextMessage',
      vendorId: 'vendor-1',
      customerPhone: '+911234567890',
      content: '2 brownies',
      phoneNumberId: 'waba-1',
      whatsappMessageId: 'wamid.1'
    }),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('conversationProcessor handler', () => {
  it('processes a TextMessage record and reports no failures on success', async () => {
    processMessageMock.mockResolvedValue(undefined);

    const result = await handler({ Records: [record()] } as any, {} as any, {} as any);

    expect(processMessageMock).toHaveBeenCalledWith({
      vendorId: 'vendor-1',
      phoneNumberId: 'waba-1',
      customerPhone: '+911234567890',
      content: '2 brownies',
      whatsappMessageId: 'wamid.1'
    });
    expect(result).toEqual({ batchItemFailures: [] });
  });

  it('forwards sourceMessageType=audio onto processMessage', async () => {
    processMessageMock.mockResolvedValue(undefined);

    await handler(
      {
        Records: [
          record({
            body: JSON.stringify({
              type: 'TextMessage',
              vendorId: 'vendor-1',
              customerPhone: '+911234567890',
              content: 'பையனுக்கு birthday',
              phoneNumberId: 'waba-1',
              whatsappMessageId: 'wamid.1',
              sourceMessageType: 'audio'
            })
          })
        ]
      } as any,
      {} as any,
      {} as any
    );

    expect(processMessageMock).toHaveBeenCalledWith({
      vendorId: 'vendor-1',
      phoneNumberId: 'waba-1',
      customerPhone: '+911234567890',
      content: 'பையனுக்கு birthday',
      whatsappMessageId: 'wamid.1',
      sourceMessageType: 'audio'
    });
  });

  it('reports the failing record via ReportBatchItemFailures instead of failing the whole batch', async () => {
    processMessageMock.mockRejectedValue(new Error('OpenAI 500'));

    const result: any = await handler({ Records: [record({ messageId: 'sqs-msg-2' })] } as any, {} as any, {} as any);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'sqs-msg-2' }]);
  });

  it('processes each record independently — one failure does not mark a successful sibling as failed', async () => {
    processMessageMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'));

    const result: any = await handler(
      {
        Records: [record({ messageId: 'ok-1' }), record({ messageId: 'bad-1' })]
      } as any,
      {} as any,
      {} as any
    );

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'bad-1' }]);
  });

  it('ignores non-TextMessage records without calling processMessage or failing the batch', async () => {
    const result: any = await handler(
      { Records: [record({ body: JSON.stringify({ type: 'AudioMessage' }) })] } as any,
      {} as any,
      {} as any
    );

    expect(processMessageMock).not.toHaveBeenCalled();
    expect(result.batchItemFailures).toEqual([]);
  });

  it('reports a failure for a record with unparseable JSON rather than throwing out of the handler', async () => {
    const result: any = await handler({ Records: [record({ body: 'not json' })] } as any, {} as any, {} as any);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'sqs-msg-1' }]);
  });
});
