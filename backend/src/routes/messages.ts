import express from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
import { enrichedInclude, shapeMessage } from './conversations.js';

export const messagesRouter = express.Router();

const PRESIGNED_GET_EXPIRY_SECONDS = 15 * 60;

let s3Client: S3Client | null = null;

function getMediaS3Client(): S3Client {
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

// GET /api/messages/:id/media - Redirect to a fresh pre-signed S3 URL for the message media
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

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: media.s3Key,
      ...(media.mimeType ? { ResponseContentType: media.mimeType } : {}),
      ...(media.filename
        ? { ResponseContentDisposition: `inline; filename="${media.filename.replace(/"/g, '')}"` }
        : {})
    });

    let signedUrl: string;
    try {
      signedUrl = await getSignedUrl(getMediaS3Client(), command, {
        expiresIn: PRESIGNED_GET_EXPIRY_SECONDS
      });
    } catch (err: any) {
      logger.error(
        {
          err,
          messageId,
          bucket,
          s3Key: media.s3Key
        },
        'wa_media_presign_get_failed'
      );
      throw new CustomError(
        'Failed to generate media URL',
        503,
        ErrorType.SYSTEM,
        ErrorSeverity.HIGH
      );
    }

    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, signedUrl);
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

    const { conversation: _c, ...shaped } = shapeMessage(message);
    res.json(shaped);
  }, ErrorType.AUTHORIZATION, ErrorSeverity.MEDIUM)
);
