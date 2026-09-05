import { describe, it, expect } from 'vitest';
import {
  estimateOpusDurationSec,
  isTranscriptTooThin,
  letterCount,
  pickUsableTranscript,
  TRANSCRIBE_MODEL
} from '../audioTranscription.js';

/** Production whisper-1 output for message 383b345e (18s Ibell voice note). */
const ALOPECIA_GARBAGE = 'பையனுக்கு லோமனைாோணு வருது நங்கே இருவுதி ஆறாம் தெரி';

/** gpt-4o-transcribe of the same ogg. */
const BIRTHDAY_BROWNIE =
  'மாம், பையனுக்கு birthday வருதுங்க 26தேதி. Brownie cake ஒரு 2 kg, அது birthday cake மாறி பண்ணணும். அப்புறம், குட்டி குட்டி பீஸா வந்து கட் பண்ணி ஒரு 2 box வேணுங்க. அம்மௌண்ட் எல்லாம் ஒருத்தம் பாக்கி சொல்றீங்களா?';

/** Bytes of vendor/.../383b345e-32a4-4827-9b5c-21067a4e5b34.ogg */
const INCIDENT_AUDIO_BYTES = 42658;

describe('audioTranscription', () => {
  it('uses gpt-4o-transcribe, not whisper-1', () => {
    expect(TRANSCRIBE_MODEL).toBe('gpt-4o-transcribe');
  });

  it('estimates the incident clip around 18–22s at WhatsApp Opus bitrate', () => {
    const sec = estimateOpusDurationSec(INCIDENT_AUDIO_BYTES);
    expect(sec).toBeGreaterThan(16);
    expect(sec).toBeLessThan(24);
  });

  it('flags the production whisper-1 garbage as too thin for that clip', () => {
    expect(isTranscriptTooThin(ALOPECIA_GARBAGE, INCIDENT_AUDIO_BYTES)).toBe(true);
    expect(letterCount(ALOPECIA_GARBAGE)).toBeLessThan(80);
  });

  it('accepts the gpt-4o-transcribe reading of the same clip', () => {
    expect(isTranscriptTooThin(BIRTHDAY_BROWNIE, INCIDENT_AUDIO_BYTES)).toBe(false);
  });

  it('does not flag a short spoken ok on a 2s note', () => {
    const twoSecBytes = Math.round((2 * 16000) / 8);
    expect(isTranscriptTooThin('ok', twoSecBytes)).toBe(false);
    expect(isTranscriptTooThin('சரி', twoSecBytes)).toBe(false);
  });

  it('treats empty as unusable even on a short note', () => {
    expect(isTranscriptTooThin('', 3000)).toBe(true);
    expect(isTranscriptTooThin('   ', 3000)).toBe(true);
  });

  it('picks the retry when the first pass is the alopecia garbage', () => {
    expect(pickUsableTranscript(ALOPECIA_GARBAGE, BIRTHDAY_BROWNIE, INCIDENT_AUDIO_BYTES)).toBe(
      BIRTHDAY_BROWNIE
    );
  });

  it('returns empty when both passes are unusable so the caller sends the typed-reply template', () => {
    expect(pickUsableTranscript(ALOPECIA_GARBAGE, 'ஐஹஹஹஹஹ', INCIDENT_AUDIO_BYTES)).toBe('');
    expect(pickUsableTranscript(ALOPECIA_GARBAGE, null, INCIDENT_AUDIO_BYTES)).toBe('');
  });
});
