import OpenAI, { toFile } from 'openai';
import { env } from '../config/env.js';
import { calculateCost } from '../utils/costCalculator.js';
import {
  TRANSCRIBE_MODEL,
  VOICE_NOTE_TRANSCRIBE_PROMPT,
  pickUsableTranscript,
  isTranscriptTooThin
} from './audioTranscription.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export async function transcribeVendorAudioBuffer(
  bytes: Buffer,
  mimeType: string
): Promise<{ transcript: string; costUsd: number }> {
  if (!openai) {
    throw new Error('Voice input is not available right now. Please type your message.');
  }

  const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'ogg';
  const file = await toFile(bytes, `voice.${ext}`, { type: mimeType || 'audio/ogg' });
  const first = await openai.audio.transcriptions.create({
    file,
    model: TRANSCRIBE_MODEL
  });
  let transcript = (first.text ?? '').trim();

  if (isTranscriptTooThin(transcript, bytes.byteLength)) {
    const retryFile = await toFile(bytes, `voice-retry.${ext}`, { type: mimeType || 'audio/ogg' });
    const retry = await openai.audio.transcriptions.create({
      file: retryFile,
      model: TRANSCRIBE_MODEL,
      prompt: VOICE_NOTE_TRANSCRIBE_PROMPT
    });
    transcript = pickUsableTranscript(transcript, retry.text ?? '', bytes.byteLength);
  }

  if (!transcript) {
    throw new Error("We couldn't make out the voice note. Please type your message instead.");
  }

  const transcribeCost = calculateCost(
    TRANSCRIBE_MODEL,
    undefined,
    undefined,
    Math.max(transcript.length * 4, 120)
  );
  return { transcript, costUsd: transcribeCost.costUsd };
}
