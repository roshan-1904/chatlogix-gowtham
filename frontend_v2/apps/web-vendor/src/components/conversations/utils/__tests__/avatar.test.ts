import { describe, expect, it } from 'vitest';
import { getBubbleVariant, isAiSender } from '../../bubbles/shared/bubbleChrome';
import { getInitials } from '../avatar';

describe('bubbleChrome', () => {
  it('treats customers as incoming and everyone else as outgoing', () => {
    expect(getBubbleVariant('customer')).toBe('incoming');
    expect(getBubbleVariant('vendor')).toBe('outgoing');
    expect(getBubbleVariant('ai')).toBe('outgoing');
  });

  it('identifies AI senders', () => {
    expect(isAiSender('ai')).toBe(true);
    expect(isAiSender('vendor')).toBe(false);
  });
});

describe('avatar initials', () => {
  it('uses the first two letters of a single token', () => {
    expect(getInitials('Priya')).toBe('PR');
  });

  it('uses the first letter of the first two words', () => {
    expect(getInitials('Ibell Store')).toBe('IS');
  });
});
