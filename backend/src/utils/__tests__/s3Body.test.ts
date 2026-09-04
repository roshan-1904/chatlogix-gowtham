import { describe, expect, it } from 'vitest';
import { mediaResponseContentType, readS3ObjectBody } from '../s3Body.js';

describe('readS3ObjectBody', () => {
  it('reads bytes via transformToByteArray (AWS SDK v3 mixin)', async () => {
    const body = {
      transformToByteArray: async () => new Uint8Array([1, 2, 3])
    };
    const buf = await readS3ObjectBody(body);
    expect(buf.equals(Buffer.from([1, 2, 3]))).toBe(true);
  });

  it('throws when the body is missing', async () => {
    await expect(readS3ObjectBody(undefined)).rejects.toThrow('S3 object body was empty');
  });

  it('throws when the body has no mixin helper', async () => {
    await expect(readS3ObjectBody({})).rejects.toThrow('S3 object body is not readable');
  });
});

describe('mediaResponseContentType', () => {
  it('adds an Opus codec hint for WhatsApp voice notes', () => {
    expect(mediaResponseContentType('audio/ogg')).toBe('audio/ogg; codecs=opus');
  });

  it('keeps image types unchanged', () => {
    expect(mediaResponseContentType('image/jpeg', 'binary/octet-stream')).toBe('image/jpeg');
  });
});
