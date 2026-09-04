import { describe, expect, it } from 'vitest';
import { dualLanguageDisplay, splitEmojiAndText, standaloneEmojiCount } from '../messageText';

describe('splitEmojiAndText', () => {
  it('keeps plain text as a single part', () => {
    expect(splitEmojiAndText('hello there')).toEqual([{ type: 'text', value: 'hello there' }]);
  });

  it('splits mixed copy around an emoji', () => {
    expect(splitEmojiAndText('Hi 👋 there')).toEqual([
      { type: 'text', value: 'Hi ' },
      { type: 'emoji', value: '👋' },
      { type: 'text', value: ' there' },
    ]);
  });

  it('keeps ZWJ sequences as one emoji', () => {
    const parts = splitEmojiAndText('👨‍👩‍👧');
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('emoji');
  });
});

describe('standaloneEmojiCount', () => {
  it('counts emoji-only messages', () => {
    expect(standaloneEmojiCount('😂')).toBe(1);
    expect(standaloneEmojiCount('😂😂😂')).toBe(3);
    expect(standaloneEmojiCount(' 🎉 ')).toBe(1);
  });

  it('returns 0 when there is other text', () => {
    expect(standaloneEmojiCount('ok 👍')).toBe(0);
    expect(standaloneEmojiCount('hello')).toBe(0);
  });
});

describe('dualLanguageDisplay (MessageText dual vs single line)', () => {
  it('returns dual when contentEn differs from the original', () => {
    expect(dualLanguageDisplay('நான் ராஜி', 'I am Raji')).toEqual({
      dual: true,
      english: 'I am Raji',
      original: 'நான் ராஜி',
    });
  });

  it('returns a single original line when contentEn matches', () => {
    expect(dualLanguageDisplay('hello', 'hello')).toEqual({ dual: false, text: 'hello' });
  });

  it('returns a single original line when contentEn is missing or blank', () => {
    expect(dualLanguageDisplay('hello', null)).toEqual({ dual: false, text: 'hello' });
    expect(dualLanguageDisplay('hello', undefined)).toEqual({ dual: false, text: 'hello' });
    expect(dualLanguageDisplay('hello', '   ')).toEqual({ dual: false, text: 'hello' });
  });
});
