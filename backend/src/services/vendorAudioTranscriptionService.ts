import OpenAI, { toFile } from 'openai';
import { env } from '../config/env.js';
import { calculateCost } from '../utils/costCalculator.js';
import {
  TRANSCRIBE_MODEL,
  VOICE_NOTE_TRANSCRIBE_PROMPT,
  pickUsableWebTranscript,
  isTranscriptTooThinForWebRecording
} from './audioTranscription.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

/** Vendor catalog / FAQ voice in the portal (not WhatsApp customer notes). */
const VENDOR_CATALOG_VOICE_PROMPT =
  `${VOICE_NOTE_TRANSCRIBE_PROMPT} Vendor describing a product or FAQ for their shop catalog.`;

export async function transcribeVendorAudioBuffer(
  bytes: Buffer,
  mimeType: string
): Promise<{ transcript: string; costUsd: number }> {
  if (!openai) {
    throw new Error('Voice input is not available right now. Please type your message.');
  }

  if (bytes.byteLength < 500) {
    throw new Error('Recording was too short. Hold the mic a little longer and try again.');
  }

  const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'ogg';
  const contentType = mimeType || 'audio/webm';
  const file = await toFile(bytes, `voice.${ext}`, { type: contentType });
  const first = await openai.audio.transcriptions.create({
    file,
    model: TRANSCRIBE_MODEL,
    prompt: VENDOR_CATALOG_VOICE_PROMPT
  });
  let transcript = (first.text ?? '').trim();

  if (!transcript || isTranscriptTooThinForWebRecording(transcript, bytes.byteLength)) {
    const retryFile = await toFile(bytes, `voice-retry.${ext}`, { type: contentType });
    const retry = await openai.audio.transcriptions.create({
      file: retryFile,
      model: TRANSCRIBE_MODEL,
      prompt: VENDOR_CATALOG_VOICE_PROMPT
    });
    transcript = pickUsableWebTranscript(transcript, retry.text ?? '', bytes.byteLength);
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
