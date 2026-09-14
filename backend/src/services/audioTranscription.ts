/**
 * Voice-note ASR helpers used by mediaFetchProcessor.
 *
 * Production used whisper-1 with no language, prompt, or length check.
 * Tamil/Tanglish WhatsApp Opus notes came back as short garbage (the
 * 9790690170 "alopecia" incident: 18s of birthday-brownie speech stored as
 * ~10 garbled Tamil words). gpt-4o-transcribe recovered the same clip.
 */

export const TRANSCRIBE_MODEL = 'gpt-4o-transcribe';

export const UNCLEAR_VOICE_REPLY =
  "I couldn't make out the voice note. Could you type your question instead?";

/** Hint for a retry pass — glossary-style, not a system prompt. */
export const VOICE_NOTE_TRANSCRIBE_PROMPT =
  'WhatsApp voice note. Tamil, Hindi, English, or mixed (Tanglish/Hinglish). Often a food or product order.';

/**
 * WhatsApp voice notes are Opus, typically ~16–20 kbps.
 * 16 kbps slightly overestimates duration, which makes the thinness gate
 * a bit stricter — the direction we want for catching truncated ASR.
 */
const WHATSAPP_OPUS_BITRATE = 16_000;

/** Browser MediaRecorder (webm/opus) — typically tens–128 kbps, not WhatsApp Opus. */
const WEB_RECORDING_BITRATE = 64_000;

/** Do not apply the letters-per-second check below this; "ok"/"yes" is plausible. */
const THIN_CHECK_MIN_DURATION_SEC = 6;

/** Real speech is well above this; the alopecia clip was ~2.8 letters/sec. */
const MIN_LETTERS_PER_SEC = 4;

const LETTER = /\p{L}/u;

export function estimateOpusDurationSec(fileSizeBytes: number): number {
  if (fileSizeBytes <= 0) return 0;
  return (fileSizeBytes * 8) / WHATSAPP_OPUS_BITRATE;
}

export function estimateWebRecordingDurationSec(fileSizeBytes: number): number {
  if (fileSizeBytes <= 0) return 0;
  return (fileSizeBytes * 8) / WEB_RECORDING_BITRATE;
}

function isTranscriptTooThinWithBitrate(
  transcript: string,
  audioBytes: number,
  bitrate: number
): boolean {
  const trimmed = transcript.trim();
  if (!trimmed) return true;
  const durationSec = (audioBytes * 8) / bitrate;
  if (durationSec < THIN_CHECK_MIN_DURATION_SEC) return false;
  return letterCount(trimmed) < durationSec * MIN_LETTERS_PER_SEC;
}

export function letterCount(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (LETTER.test(ch)) n += 1;
  }
  return n;
}

/**
 * True when the transcript is empty or implausibly short for the audio size.
 * Short notes (under ~6s) skip the density check so a spoken "ok" still goes through.
 */
export function isTranscriptTooThin(transcript: string, audioBytes: number): boolean {
  return isTranscriptTooThinWithBitrate(transcript, audioBytes, WHATSAPP_OPUS_BITRATE);
}

/** Thinness gate for vendor-portal MediaRecorder uploads (webm), not WhatsApp Opus. */
export function isTranscriptTooThinForWebRecording(transcript: string, audioBytes: number): boolean {
  return isTranscriptTooThinWithBitrate(transcript, audioBytes, WEB_RECORDING_BITRATE);
}

/**
 * First-pass transcript if usable; otherwise the retry if usable; otherwise ''.
 * Empty means the caller should send UNCLEAR_VOICE_REPLY and not enqueue AI.
 */
export function pickUsableTranscript(
  first: string,
  retry: string | null,
  audioBytes: number
): string {
  const firstTrimmed = first.trim();
  if (!isTranscriptTooThin(firstTrimmed, audioBytes)) return firstTrimmed;
  const retryTrimmed = (retry ?? '').trim();
  if (retryTrimmed && !isTranscriptTooThin(retryTrimmed, audioBytes)) return retryTrimmed;
  return '';
}

export function pickUsableWebTranscript(
  first: string,
  retry: string | null,
  audioBytes: number
): string {
  const firstTrimmed = first.trim();
  if (!isTranscriptTooThinForWebRecording(firstTrimmed, audioBytes)) return firstTrimmed;
  const retryTrimmed = (retry ?? '').trim();
  if (retryTrimmed && !isTranscriptTooThinForWebRecording(retryTrimmed, audioBytes)) {
    return retryTrimmed;
  }
  // Prefer any non-empty retry/first over hard failure — web ASR is usually usable even if short.
  if (retryTrimmed.length >= 2) return retryTrimmed;
  if (firstTrimmed.length >= 2) return firstTrimmed;
  return '';
}
