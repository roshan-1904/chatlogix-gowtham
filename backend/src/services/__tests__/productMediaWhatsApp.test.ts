import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSignedUrl = vi.fn();
const s3Send = vi.fn();

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrl(...args)
}));
vi.mock('../../utils/waMediaS3.js', () => ({
  getWaMediaS3Client: () => ({ send: s3Send })
}));

import {
  presignProductMediaOutboundGetUrl,
  PRODUCT_MEDIA_OUTBOUND_PRESIGN_SECONDS
} from '../productMediaWhatsApp.js';

beforeEach(() => {
  vi.clearAllMocks();
  getSignedUrl.mockResolvedValue('https://signed.example/object');
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
