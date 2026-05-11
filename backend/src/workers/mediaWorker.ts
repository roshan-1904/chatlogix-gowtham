import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fetch from 'node-fetch';
import imageSize from 'image-size';
import OpenAI, { toFile } from 'openai';
import { receiveMessages, deleteMessage, publishToQueue } from '../queue/sqsClient.js';
import { env, numericEnv } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { logger, StepLogger, createOperationId } from '../logger.js';
import { emitMetric, emitDuration } from '../observability/metrics.js';

interface MediaFetchJob {
  type: 'MediaFetchJob';
  messageId: string;
  whatsappMediaId: string;
  mimeType?: string;
  vendorId: string;
  phoneNumberId?: string;
  customerPhone: string;
  messageType: string;
  whatsappMessageId?: string;
  // Set by the worker when re-enqueuing after a transient failure. Lets the
  // next attempt pick the right backoff slot. 0 = first try.
  attemptIndex?: number;
}

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
const WHISPER_MODEL = 'whisper-1';
// Fallback text used when an image arrives with no caption. Sent directly to
// the response queue (bypassing AI) per design — see commit "Scope B" and
// the AskUserQuestion answers on docs/DEPLOYMENT.md cleanup.
const IMAGE_NO_CAPTION_REPLY =
  "I see you sent a photo. Could you tell me what you'd like help with?";

const WA_GRAPH_BASE = 'https://graph.facebook.com/v18.0';

// Per-attempt backoff in seconds. SQS DelaySeconds caps at 900 (15 min), so
// the design's 30-min last-attempt slot is clamped to 15 min — documented in
// the rollout runbook as a deviation.
const RETRY_BACKOFF_SECONDS: ReadonlyArray<number> = [1, 5, 30, 300, 900];

function backoffForAttempt(attemptIndex: number): number {
  if (attemptIndex < 0) return RETRY_BACKOFF_SECONDS[0];
  if (attemptIndex >= RETRY_BACKOFF_SECONDS.length) {
    return RETRY_BACKOFF_SECONDS[RETRY_BACKOFF_SECONDS.length - 1];
  }
  return RETRY_BACKOFF_SECONDS[attemptIndex];
}

let s3Client: S3Client | null = null;
function getS3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.WA_MEDIA_S3_REGION || env.AWS_REGION,
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
  return s3Client;
}

function extensionForMime(mime?: string): string {
  if (!mime) return 'bin';
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt'
  };
  if (map[mime]) return map[mime];
  const fromMime = mime.split('/')[1];
  return (fromMime || 'bin').split(';')[0].trim();
}

function buildS3Key(
  vendorId: string,
  customerId: string,
  messageId: string,
  mimeType?: string
): string {
  const yyyymm = new Date().toISOString().slice(0, 7); // YYYY-MM
  const ext = extensionForMime(mimeType);
  return `vendor/${vendorId}/${customerId}/${yyyymm}/${messageId}.${ext}`;
}

async function fetchWhatsAppMediaUrl(mediaId: string): Promise<{
  url: string;
  mimeType?: string;
  fileSize?: number;
  sha256?: string;
}> {
  if (!env.WHATSAPP_ACCESS_TOKEN) {
    throw new Error('WHATSAPP_ACCESS_TOKEN not configured');
  }
  const res = await fetch(`${WA_GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` }
  });
  if (!res.ok) {
    throw new Error(`WhatsApp media metadata fetch failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    url?: string;
    mime_type?: string;
    file_size?: number;
    sha256?: string;
  };
  if (!json.url) throw new Error('WhatsApp media metadata missing url');
  return {
    url: json.url,
    mimeType: json.mime_type,
    fileSize: json.file_size,
    sha256: json.sha256
  };
}

async function downloadMediaBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` }
  });
  if (!res.ok) {
    throw new Error(`WhatsApp media download failed: ${res.status}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function uploadToS3(
  bucket: string,
  key: string,
  body: Buffer,
  contentType?: string
): Promise<void> {
  await getS3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength
    })
  );
}

function probeImageDimensions(
  bytes: Buffer,
  mimeType: string | undefined,
  stepLogger: StepLogger
): { width?: number; height?: number } {
  if (!mimeType || !mimeType.startsWith('image/')) return {};
  try {
    const dim = imageSize(bytes);
    if (typeof dim.width === 'number' && typeof dim.height === 'number') {
      return { width: dim.width, height: dim.height };
    }
    return {};
  } catch (err) {
    stepLogger.warn('image-size probe failed', {
      err: err instanceof Error ? err.message : String(err)
    });
    return {};
  }
}

async function transcribeAudio(
  bytes: Buffer,
  mimeType: string | undefined,
  stepLogger: StepLogger
): Promise<string> {
  if (!openai) {
    throw new Error('OPENAI_API_KEY not configured; cannot transcribe audio');
  }
  const ext = extensionForMime(mimeType ?? 'audio/ogg');
  const file = await toFile(bytes, `audio.${ext}`, { type: mimeType ?? 'audio/ogg' });
  const start = Date.now();
  const res = await openai.audio.transcriptions.create({
    file,
    model: WHISPER_MODEL
  });
  const transcript = (res.text ?? '').trim();
  stepLogger.step('Whisper transcription complete', {
    durationMs: Date.now() - start,
    transcriptLength: transcript.length
  });
  emitDuration('media.whisper.duration_ms', Date.now() - start, {
    dimensions: { messageType: 'audio' }
  });
  return transcript;
}

async function sendTemplatedReply(
  job: MediaFetchJob,
  text: string,
  stepLogger: StepLogger
): Promise<void> {
  if (!env.RESPONSE_QUEUE_URL) {
    stepLogger.warn('RESPONSE_QUEUE_URL not set; cannot send templated reply');
    return;
  }
  // Look up conversation/customer ids so the response worker has full context
  // and the persisted assistant message links to the right conversation.
  const customerMessage = await prisma.message.findUnique({
    where: { id: job.messageId },
    select: {
      conversationId: true,
      conversation: { select: { vendorId: true, customerId: true } }
    }
  });
  if (!customerMessage) {
    stepLogger.warn('Cannot send templated reply: message row missing');
    return;
  }
  try {
    await prisma.message.create({
      data: {
        conversationId: customerMessage.conversationId,
        senderType: 'assistant',
        content: text,
        type: 'text'
      }
    });
  } catch (err) {
    stepLogger.warn('Failed to persist templated assistant message; sending anyway', {
      err: err instanceof Error ? err.message : String(err)
    });
  }
  await publishToQueue(env.RESPONSE_QUEUE_URL, {
    to: job.customerPhone,
    text,
    conversationId: customerMessage.conversationId,
    vendorId: customerMessage.conversation.vendorId,
    customerId: customerMessage.conversation.customerId,
    metadata: {
      intent: 'templated_no_caption_image',
      tokensUsed: 0,
      stagesExecuted: ['media_worker_templated']
    }
  });
}

async function handoffAfterFetch(
  job: MediaFetchJob,
  bytes: Buffer,
  effectiveMime: string | undefined,
  caption: string | null,
  stepLogger: StepLogger
): Promise<void> {
  if (job.messageType === 'audio') {
    if (!env.AUDIO_QUEUE_URL) {
      stepLogger.warn('AUDIO_QUEUE_URL not configured; audio stays in S3 only');
      return;
    }
    const transcript = await transcribeAudio(bytes, effectiveMime, stepLogger);
    if (!transcript) {
      stepLogger.warn('Whisper returned empty transcript; sending templated reply');
      await sendTemplatedReply(
        job,
        "I couldn't make out the voice note. Could you type your question instead?",
        stepLogger
      );
      return;
    }
    await prisma.message.update({
      where: { id: job.messageId },
      data: { content: transcript }
    });
    await publishToQueue(env.AUDIO_QUEUE_URL, {
      type: 'TextMessage',
      messageId: job.messageId,
      vendorId: job.vendorId,
      customerPhone: job.customerPhone,
      content: transcript,
      phoneNumberId: job.phoneNumberId,
      whatsappMessageId: job.whatsappMessageId,
      sourceMessageType: 'audio'
    });
    stepLogger.step('Audio handed off to AUDIO_QUEUE_URL', {
      transcriptLength: transcript.length
    });
    return;
  }

  if (job.messageType === 'image') {
    const captionText = (caption ?? '').trim();
    if (!captionText) {
      stepLogger.step('Image has no caption; sending templated reply');
      await sendTemplatedReply(job, IMAGE_NO_CAPTION_REPLY, stepLogger);
      return;
    }
    if (!env.IMAGE_QUEUE_URL) {
      stepLogger.warn('IMAGE_QUEUE_URL not configured; image caption discarded');
      return;
    }
    await publishToQueue(env.IMAGE_QUEUE_URL, {
      type: 'TextMessage',
      messageId: job.messageId,
      vendorId: job.vendorId,
      customerPhone: job.customerPhone,
      content: captionText,
      phoneNumberId: job.phoneNumberId,
      whatsappMessageId: job.whatsappMessageId,
      sourceMessageType: 'image'
    });
    stepLogger.step('Image handed off to IMAGE_QUEUE_URL', {
      captionLength: captionText.length
    });
  }
  // Other media types (video/document/sticker): no AI handoff today.
}

type ProcessJobOutcome = 'success' | 'terminal' | 'noop' | { retryAfterSeconds: number };

async function processJob(job: MediaFetchJob, stepLogger: StepLogger): Promise<ProcessJobOutcome> {
  const start = Date.now();
  emitMetric('media.fetch.attempt', 1, {
    dimensions: { vendorId: job.vendorId, messageType: job.messageType }
  });

  const message = await prisma.message.findUnique({
    where: { id: job.messageId },
    select: {
      id: true,
      conversation: { select: { vendorId: true, customerId: true } }
    }
  });
  if (!message) {
    stepLogger.warn('Message not found, dropping media job', { messageId: job.messageId });
    return 'noop';
  }

  const media = await prisma.messageMedia.findUnique({ where: { messageId: job.messageId } });
  if (!media) {
    stepLogger.warn('MessageMedia row missing, dropping media job', { messageId: job.messageId });
    return 'noop';
  }
  if (media.fetchState === 'ready' || media.fetchState === 'expired') {
    stepLogger.step('Media already terminal, skipping', { state: media.fetchState });
    return 'noop';
  }

  const bucket = env.WA_MEDIA_S3_BUCKET;
  if (!bucket) {
    throw new Error('WA_MEDIA_S3_BUCKET not configured');
  }

  await prisma.messageMedia.update({
    where: { id: media.id },
    data: { fetchAttempts: { increment: 1 } }
  });

  try {
    stepLogger.step('Fetching media metadata from WhatsApp');
    const meta = await fetchWhatsAppMediaUrl(job.whatsappMediaId);

    stepLogger.step('Downloading media bytes');
    const bytes = await downloadMediaBytes(meta.url);

    const key = buildS3Key(
      message.conversation.vendorId,
      message.conversation.customerId,
      message.id,
      meta.mimeType ?? job.mimeType
    );
    stepLogger.step('Uploading to S3', { bucket, key });
    await uploadToS3(bucket, key, bytes, meta.mimeType ?? job.mimeType);

    const effectiveMime = meta.mimeType ?? job.mimeType ?? media.mimeType ?? undefined;
    const { width, height } = probeImageDimensions(bytes, effectiveMime, stepLogger);

    await prisma.messageMedia.update({
      where: { id: media.id },
      data: {
        s3Bucket: bucket,
        s3Key: key,
        mimeType: effectiveMime ?? null,
        fileSizeBytes: meta.fileSize ?? bytes.byteLength,
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
        fetchState: 'ready',
        fetchedAt: new Date(),
        lastFetchError: null
      }
    });

    emitMetric('media.fetch.success', 1, {
      dimensions: { vendorId: job.vendorId, messageType: job.messageType }
    });
    emitDuration('media.fetch.duration_ms', Date.now() - start, {
      dimensions: { vendorId: job.vendorId, messageType: job.messageType }
    });

    // Hand off to the appropriate AI queue. Failures here are logged but do
    // not flip the fetch outcome to retry — S3 upload already succeeded and
    // we don't want a Whisper hiccup to redownload the audio from WhatsApp.
    try {
      await handoffAfterFetch(job, bytes, effectiveMime, media.caption, stepLogger);
    } catch (handoffErr) {
      stepLogger.warn('Post-fetch handoff failed; media remains in S3', {
        err: handoffErr instanceof Error ? handoffErr.message : String(handoffErr)
      });
      emitMetric('media.handoff.failure', 1, {
        dimensions: { vendorId: job.vendorId, messageType: job.messageType }
      });
    }

    return 'success';
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    const refreshed = await prisma.messageMedia.findUnique({ where: { id: media.id } });
    const attempts = refreshed?.fetchAttempts ?? media.fetchAttempts + 1;

    if (attempts >= numericEnv.mediaFetchMaxAttempts) {
      await prisma.messageMedia.update({
        where: { id: media.id },
        data: { fetchState: 'failed', lastFetchError: errMessage }
      });
      emitMetric('media.fetch.terminal_failure', 1, {
        dimensions: { vendorId: job.vendorId, messageType: job.messageType }
      });
      stepLogger.error(err as Error, { step: 'media_fetch_terminal' });
      return 'terminal';
    }

    await prisma.messageMedia.update({
      where: { id: media.id },
      data: { lastFetchError: errMessage }
    });
    // attempts is the count of attempts already made (post-increment). The
    // next attempt's index in RETRY_BACKOFF_SECONDS is therefore `attempts`.
    const retryAfterSeconds = backoffForAttempt(attempts);
    stepLogger.warn('Media fetch failed, scheduling retry', {
      step: 'media_fetch_retry',
      attempts,
      retryAfterSeconds,
      err: errMessage
    });
    return { retryAfterSeconds };
  }
}

async function loop() {
  if (!env.MEDIA_FETCH_QUEUE_URL) {
    logger.error('MEDIA_FETCH_QUEUE_URL not configured; media worker exiting');
    process.exit(1);
  }

  while (true) {
    const messages = await receiveMessages(env.MEDIA_FETCH_QUEUE_URL, 10);
    if (messages.length === 0) continue;

    for (const m of messages) {
      if (!m.Body || !m.ReceiptHandle) continue;
      const operationId = createOperationId('media_worker');
      let job: MediaFetchJob | null = null;
      try {
        job = JSON.parse(m.Body) as MediaFetchJob;
      } catch (err) {
        logger.warn({ err, messageId: m.MessageId }, 'Failed to parse media job body');
        // Delete malformed messages; retrying won't help.
        try {
          await deleteMessage(env.MEDIA_FETCH_QUEUE_URL, m.ReceiptHandle);
        } catch {}
        continue;
      }

      const stepLogger = new StepLogger(operationId, 'Media Worker', {
        messageId: job.messageId,
        whatsappMediaId: job.whatsappMediaId,
        vendorId: job.vendorId
      });

      try {
        const outcome = await processJob(job, stepLogger);
        if (typeof outcome === 'object' && 'retryAfterSeconds' in outcome) {
          const nextAttemptIndex = (job.attemptIndex ?? 0) + 1;
          const retryJob: MediaFetchJob = { ...job, attemptIndex: nextAttemptIndex };
          try {
            await publishToQueue(env.MEDIA_FETCH_QUEUE_URL, retryJob, {
              delaySeconds: outcome.retryAfterSeconds
            });
            stepLogger.step('Re-enqueued media job with backoff', {
              delaySeconds: outcome.retryAfterSeconds,
              attemptIndex: nextAttemptIndex
            });
          } catch (enqueueErr) {
            // If re-enqueue fails, fall back to the visibility-timeout path:
            // skip the delete so SQS redelivers the original message.
            stepLogger.error(enqueueErr as Error, {
              step: 'media_retry_enqueue_failed'
            });
            continue;
          }
        }
        // Always delete the in-flight message after we've decided what to do —
        // success, terminal failure, no-op, or a queued retry copy.
        await deleteMessage(env.MEDIA_FETCH_QUEUE_URL, m.ReceiptHandle);
        stepLogger.success({ messageId: job.messageId, outcome });
      } catch (err) {
        // Unexpected error outside processJob's own retry envelope. Leave the
        // SQS message visible so it gets retried via visibility timeout.
        stepLogger.warn('Media job crashed, leaving message visible for retry', {
          err: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }
}

loop().catch((err) => {
  logger.error({ err }, 'Media worker crashed');
  process.exit(1);
});
