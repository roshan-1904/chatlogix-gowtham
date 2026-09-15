import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendWhatsAppText = vi.fn();
const sendWhatsAppImage = vi.fn();
const sendWhatsAppVideo = vi.fn();
const presignProductMediaOutboundGetUrl = vi.fn();
const messageFindUnique = vi.fn();
const messageUpdate = vi.fn();
const productMediaFindUnique = vi.fn();

vi.mock('../../services/whatsappClient.js', () => ({
  sendWhatsAppText: (...args: unknown[]) => sendWhatsAppText(...args),
  sendWhatsAppTemplate: vi.fn(),
  sendWhatsAppImage: (...args: unknown[]) => sendWhatsAppImage(...args),
  sendWhatsAppVideo: (...args: unknown[]) => sendWhatsAppVideo(...args)
}));
vi.mock('../../services/productMediaWhatsApp.js', () => ({
  presignProductMediaOutboundGetUrl: (...args: unknown[]) => presignProductMediaOutboundGetUrl(...args)
}));
vi.mock('../../services/asyncDatabaseService.js', () => ({ AsyncDatabaseService: vi.fn() }));
vi.mock('../../services/customerInsightsService.js', () => ({
  CustomerInsightsService: vi.fn().mockImplementation(() => ({ updateInsights: vi.fn() }))
}));
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    message: {
      findUnique: (...args: unknown[]) => messageFindUnique(...args),
      update: (...args: unknown[]) => messageUpdate(...args)
    },
    productMedia: {
      findUnique: (...args: unknown[]) => productMediaFindUnique(...args)
    },
    notificationHistory: { update: vi.fn() }
  }
}));
vi.mock('../../conversation/metrics.js', () => ({ logCount: vi.fn() }));
vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  StepLogger: class {
    step() {}
    warn() {}
    success() {}
    error() {}
  },
  createOperationId: () => 'op-1',
  logWhatsAppOperation: vi.fn(),
  logConversation: vi.fn(),
  logErrorWithContext: vi.fn(),
  logDatabaseFailure: vi.fn(),
  logWhatsAppFailure: vi.fn()
}));

import { processResponseMessage } from '../responseProcessor.js';

const baseProductMedia = {
  id: 'pm-1',
  vendorId: 'vendor-1',
  productId: 'prod-1',
  kind: 'image' as const,
  s3Bucket: 'chatlogix-wa-media',
  s3Key: 'vendor/vendor-1/catalog/prod-1/uuid-cake.jpg',
  mimeType: 'image/jpeg',
  fileSizeBytes: 1000,
  isActive: true
};

beforeEach(() => {
  vi.clearAllMocks();
  sendWhatsAppText.mockResolvedValue({ messageId: 'wamid.text' });
  messageUpdate.mockResolvedValue({});
  presignProductMediaOutboundGetUrl.mockResolvedValue('https://s3.example/presigned');
  messageFindUnique.mockResolvedValue({ status: 'pending' });
  productMediaFindUnique.mockResolvedValue(baseProductMedia);
  sendWhatsAppImage.mockResolvedValue({ messageId: 'wamid.img' });
  sendWhatsAppVideo.mockResolvedValue({ messageId: 'wamid.vid' });
});

describe('processResponseMessage product media attachments', () => {
  it('sends text then image with presigned link and marks attachment sent', async () => {
    await processResponseMessage({
      type: 'text',
      to: '919000000000',
      text: 'Here is the photo',
      messageId: 'out-text',
      phoneNumberId: 'phone-1',
      vendorId: 'vendor-1',
      attachments: [
        {
          messageId: 'out-img',
          productMediaId: 'pm-1',
          kind: 'image',
          caption: 'Front view'
        }
      ]
    });

    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(presignProductMediaOutboundGetUrl).toHaveBeenCalledWith(
      'chatlogix-wa-media',
      'vendor/vendor-1/catalog/prod-1/uuid-cake.jpg'
    );
    expect(sendWhatsAppImage).toHaveBeenCalledWith({
      to: '919000000000',
      link: 'https://s3.example/presigned',
      phoneNumberId: 'phone-1',
      caption: 'Front view'
    });
    expect(sendWhatsAppVideo).not.toHaveBeenCalled();

    const sentAttachmentUpdate = messageUpdate.mock.calls.find(
      (call) => (call[0] as { where: { id: string } }).where.id === 'out-img'
    );
    expect(sentAttachmentUpdate).toEqual([
      {
        where: { id: 'out-img' },
        data: { status: 'sent', whatsappMessageId: 'wamid.img' }
      }
    ]);
  });

  it('skips attachment when Message.status is already sent', async () => {
    messageFindUnique.mockResolvedValue({ status: 'sent' });

    await processResponseMessage({
      type: 'text',
      to: '919000000000',
      text: 'Again',
      phoneNumberId: 'phone-1',
      attachments: [{ messageId: 'out-img', productMediaId: 'pm-1', kind: 'image' }]
    });

    expect(sendWhatsAppImage).not.toHaveBeenCalled();
    expect(productMediaFindUnique).not.toHaveBeenCalled();
  });

  it('sends video attachments with sendWhatsAppVideo', async () => {
    productMediaFindUnique.mockResolvedValue({
      ...baseProductMedia,
      kind: 'video',
      mimeType: 'video/mp4'
    });

    await processResponseMessage({
      type: 'text',
      to: '919000000000',
      text: 'Video',
      phoneNumberId: 'phone-1',
      attachments: [{ messageId: 'out-vid', productMediaId: 'pm-1', kind: 'video' }]
    });

    expect(sendWhatsAppVideo).toHaveBeenCalledWith({
      to: '919000000000',
      link: 'https://s3.example/presigned',
      phoneNumberId: 'phone-1',
      caption: undefined
    });
  });

  it('throws after partial attachment failure so SQS can retry unsent rows', async () => {
    sendWhatsAppImage
      .mockResolvedValueOnce({ messageId: 'wamid.img1' })
      .mockRejectedValueOnce(new Error('Graph 500'));

    messageFindUnique
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'pending' });

    productMediaFindUnique
      .mockResolvedValueOnce({ ...baseProductMedia, id: 'pm-1' })
      .mockResolvedValueOnce({ ...baseProductMedia, id: 'pm-2', s3Key: 'vendor/vendor-1/catalog/prod-1/b.jpg' });

    await expect(
      processResponseMessage({
        type: 'text',
        to: '919000000000',
        text: 'Two photos',
        phoneNumberId: 'phone-1',
        attachments: [
          { messageId: 'out-1', productMediaId: 'pm-1', kind: 'image' },
          { messageId: 'out-2', productMediaId: 'pm-2', kind: 'image' }
        ]
      })
    ).rejects.toThrow(/partial failure/);

    expect(sendWhatsAppImage).toHaveBeenCalledTimes(2);
    expect(messageUpdate).toHaveBeenCalledWith({
      where: { id: 'out-2' },
      data: { status: 'failed', failureReason: 'Graph 500' }
    });
  });
});
