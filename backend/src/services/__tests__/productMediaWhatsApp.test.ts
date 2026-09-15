import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSignedUrl = vi.fn();
const s3Send = vi.fn();
const uploadWhatsAppMedia = vi.fn();
const readProductMediaObject = vi.fn();

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrl(...args)
}));
vi.mock('../../utils/waMediaS3.js', () => ({
  getWaMediaS3Client: () => ({ send: s3Send })
}));
vi.mock('../whatsappClient.js', () => ({
  uploadWhatsAppMedia: (...args: unknown[]) => uploadWhatsAppMedia(...args)
}));
vi.mock('../productMediaStorage.js', () => ({
  readProductMediaObject: (...args: unknown[]) => readProductMediaObject(...args)
}));

import {
  presignProductMediaOutboundGetUrl,
  uploadProductMediaForWhatsAppSend,
  PRODUCT_MEDIA_OUTBOUND_PRESIGN_SECONDS
} from '../productMediaWhatsApp.js';

beforeEach(() => {
  vi.clearAllMocks();
  getSignedUrl.mockResolvedValue('https://signed.example/object');
  readProductMediaObject.mockResolvedValue({ bytes: Buffer.from('jpeg'), contentType: 'image/jpeg' });
  uploadWhatsAppMedia.mockResolvedValue({ mediaId: 'graph-media-99' });
});

describe('presignProductMediaOutboundGetUrl', () => {
  it('presigns GET with at least 5 minute expiry', async () => {
    const url = await presignProductMediaOutboundGetUrl('chatlogix-wa-media', 'vendor/v1/catalog/p1/a.jpg');

    expect(url).toBe('https://signed.example/object');
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: { Bucket: 'chatlogix-wa-media', Key: 'vendor/v1/catalog/p1/a.jpg' }
      }),
      { expiresIn: PRODUCT_MEDIA_OUTBOUND_PRESIGN_SECONDS }
    );
  });

  it('never uses expiry shorter than the minimum', async () => {
    await presignProductMediaOutboundGetUrl('b', 'k', 60);
    expect(getSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      expiresIn: PRODUCT_MEDIA_OUTBOUND_PRESIGN_SECONDS
    });
  });
});

describe('uploadProductMediaForWhatsAppSend', () => {
  it('reads S3 bytes and uploads to Graph', async () => {
    const id = await uploadProductMediaForWhatsAppSend(
      {
        id: 'pm-1',
        s3Bucket: 'chatlogix-wa-media',
        s3Key: 'vendor/v1/catalog/p1/abc-cake.jpg',
        mimeType: 'image/jpeg'
      },
      'phone-99'
    );

    expect(id).toBe('graph-media-99');
    expect(uploadWhatsAppMedia).toHaveBeenCalledWith(
      'phone-99',
      'image/jpeg',
      expect.any(Buffer),
      'abc-cake.jpg'
    );
  });
});
