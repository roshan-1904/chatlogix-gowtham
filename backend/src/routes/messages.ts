import express from 'express';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '../db/prisma.js';
import {
  asyncHandlerWithContext,
  createValidationError,
  CustomError,
  ErrorType,
  ErrorSeverity
} from '../middleware/errorHandler.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { mediaResponseContentType, readS3ObjectBody } from '../utils/s3Body.js';
import { getWaMediaS3Client } from '../utils/waMediaS3.js';
import { enrichedInclude, shapeMessage } from './conversations.js';
import { ensureMessageContentEn, needsEnglish } from '../utils/vendorEnglish.js';

export const messagesRouter = express.Router();

// GET /api/messages/:id/media - Stream the message media from S3.
//
// This is fetched from the vendor dashboard via `fetch()` + a Bearer token
// (an <img>/<video>/<audio> element can't attach that header, so the client
// turns the response into a blob: URL - see useAuthenticatedMedia.ts on the
// frontend). Streaming the bytes here, rather than 302-redirecting to a
// presigned S3 URL, keeps that fetch same-origin so it isn't at the mercy of
// the media bucket's CORS configuration.
messagesRouter.get(
  '/:id/media',
  asyncHandlerWithContext(async (req: any, res: any) => {
    const messageId = req.params.id;
    const user = req.user;

    if (!user) {
      throw new CustomError(
        'Authentication required',
        401,
        ErrorType.AUTHENTICATION,
        ErrorSeverity.MEDIUM
      );
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversation: { select: { vendorId: true } },
        media: true
      }
    });

    if (!message) {
      throw createValidationError('Message not found', 'id', messageId);
    }

    if (
      !user.roles.includes('admin') &&
      user.vendorId !== message.conversation.vendorId
    ) {
      throw new CustomError(
        'You are not authorized to access this media',
        403,
        ErrorType.AUTHORIZATION,
        ErrorSeverity.MEDIUM,
        true,
        { messageId, vendorId: message.conversation.vendorId }
      );
    }

    const media = message.media;
    if (!media || media.fetchState !== 'ready' || !media.s3Key) {
      // UI should fall back to placeholder; do not expose internal media state
      res.status(404).end();
      return;
    }

    const bucket = media.s3Bucket || env.WA_MEDIA_S3_BUCKET;
    if (!bucket) {
      throw new CustomError(
        'Media bucket not configured',
        503,
        ErrorType.SYSTEM,
        ErrorSeverity.HIGH
      );
    }

    let bytes: Buffer;
    let s3ContentType: string | undefined;
    try {
      const s3Response = await getWaMediaS3Client().send(
        new GetObjectCommand({ Bucket: bucket, Key: media.s3Key })
      );
      s3ContentType = s3Response.ContentType;
      bytes = await readS3ObjectBody(s3Response.Body);
    } catch (err: any) {
      logger.error(
        {
          err,
          messageId,
          bucket,
          s3Key: media.s3Key
        },
        'wa_media_fetch_failed'
      );
      throw new CustomError(
        'Failed to fetch media',
        503,
        ErrorType.SYSTEM,
        ErrorSeverity.HIGH
      );
    }

    // Helmet defaults CORP to same-origin, which blocks the vendor dashboard
    // from reading image/audio bodies when it is hosted on another origin
    // (local Vite → production API). cors() alone is not enough for media.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader(
      'Content-Type',
      mediaResponseContentType(media.mimeType, s3ContentType)
    );
    res.setHeader('Content-Length', String(bytes.byteLength));
    if (media.filename) {
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${media.filename.replace(/"/g, '')}"`
      );
    }

    res.end(bytes);
  }, ErrorType.AUTHORIZATION, ErrorSeverity.MEDIUM)
);

// GET /api/messages/:id - Single message, including current media state.
// Lets the vendor dashboard refresh a message it already has in memory
// (e.g. media that was still fetching when the conversation was first
// loaded) without re-fetching the whole conversation.
messagesRouter.get(
  '/:id',
  asyncHandlerWithContext(async (req: any, res: any) => {
    const messageId = req.params.id;
    const user = req.user;

    if (!user) {
      throw new CustomError(
        'Authentication required',
        401,
        ErrorType.AUTHENTICATION,
        ErrorSeverity.MEDIUM
      );
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        ...enrichedInclude(false),
        conversation: { select: { vendorId: true } }
      }
    });

    if (!message) {
      throw createValidationError('Message not found', 'id', messageId);
    }

    if (
      !user.roles.includes('admin') &&
      user.vendorId !== (message as any).conversation.vendorId
    ) {
      throw new CustomError(
        'You are not authorized to access this message',
        403,
        ErrorType.AUTHORIZATION,
        ErrorSeverity.MEDIUM,
        true,
        { messageId, vendorId: (message as any).conversation.vendorId }
      );
    }

    if (!message.contentEn?.trim() && needsEnglish(message.content)) {
      const contentEn = await ensureMessageContentEn(message.id, message.content);
      if (contentEn) {
        (message as { contentEn?: string | null }).contentEn = contentEn;
      }
    }

    const { conversation: _c, ...shaped } = shapeMessage(message);
    res.json(shaped);
  }, ErrorType.AUTHORIZATION, ErrorSeverity.MEDIUM)
);
