import { describe, expect, it } from 'vitest';
import type { Message } from '../../types';
import { groupMessagesByDateAndSender } from '../messageGrouping';

function msg(overrides: Partial<Message> & Pick<Message, 'id' | 'type'>): Message {
  return {
    content: '',
    timestamp: '2026-09-04T10:00:00.000Z',
    senderType: 'customer',
    ...overrides,
  };
}

describe('groupMessagesByDateAndSender', () => {
  it('keeps type and media so image/audio bubbles can render', () => {
    const image = msg({
      id: 'img-1',
      type: 'image',
      media: {
        state: 'ready',
        mediaUrl: '/api/messages/img-1/media',
        mimeType: 'image/jpeg',
      },
    });
    const audio = msg({
      id: 'aud-1',
      type: 'audio',
      content: 'transcript',
      timestamp: '2026-09-04T10:00:30.000Z',
      media: {
        state: 'ready',
        mediaUrl: '/api/messages/aud-1/media',
        mimeType: 'audio/ogg',
      },
    });

    const grouped = groupMessagesByDateAndSender([image, audio]);
    const flattened = grouped.flatMap((d) => d.groups.flatMap((g) => g.messages));

    expect(flattened).toHaveLength(2);
    expect(flattened[0].type).toBe('image');
    expect(flattened[0].media?.mediaUrl).toBe('/api/messages/img-1/media');
    expect(flattened[1].type).toBe('audio');
    expect(flattened[1].media?.state).toBe('ready');
  });
});
