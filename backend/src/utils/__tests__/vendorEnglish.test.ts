import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createMock, findUniqueMock, updateManyMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  findUniqueMock: vi.fn(),
  updateManyMock: vi.fn()
}));

vi.mock('../../config/env.js', () => ({
  env: { OPENAI_API_KEY: 'test-key' }
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: createMock } }
  }))
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    message: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      updateMany: (...args: unknown[]) => updateManyMock(...args)
    }
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import {
  needsEnglish,
  toVendorEnglish,
  ensureMessageContentEn,
  VENDOR_ENGLISH_MODEL
} from '../vendorEnglish.js';

const TAMIL = 'வணக்கம், என் ஆர்டர் எங்கே?';
const HINDI = 'मेरा ऑर्डर कहाँ है?';
const HINGLISH = 'mera order kahan hai bhai';
const TANGLISH = 'enna venum bro confirm pannunga';

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueMock.mockResolvedValue({ contentEn: null });
  updateManyMock.mockResolvedValue({ count: 1 });
  createMock.mockResolvedValue({
    choices: [{ message: { content: 'Hello, where is my order?' } }]
  });
});

describe('needsEnglish', () => {
  it('is true for Tamil and Devanagari script', () => {
    expect(needsEnglish(TAMIL)).toBe(true);
    expect(needsEnglish(HINDI)).toBe(true);
    expect(needsEnglish('Hi ராஜி')).toBe(true);
  });

  it('is false for Latin-script English, Hinglish, and Tanglish', () => {
    expect(needsEnglish('Where is my order?')).toBe(false);
    expect(needsEnglish(HINGLISH)).toBe(false);
    expect(needsEnglish(TANGLISH)).toBe(false);
  });

  it('skips empty and placeholder bodies', () => {
    expect(needsEnglish('')).toBe(false);
    expect(needsEnglish('   ')).toBe(false);
    expect(needsEnglish('📍 11.0168, 76.9558')).toBe(false);
    expect(needsEnglish('📍 Location')).toBe(false);
    expect(needsEnglish('👤 Contact card')).toBe(false);
    expect(needsEnglish('🟦 Sticker')).toBe(false);
  });
});

describe('toVendorEnglish', () => {
  it('does not call the model for empty, placeholder, or Latin-script text', async () => {
    expect(await toVendorEnglish('')).toBe('');
    expect(await toVendorEnglish('📍 Location')).toBe('📍 Location');
    expect(await toVendorEnglish('👤 Contact card')).toBe('👤 Contact card');
    expect(await toVendorEnglish(HINGLISH)).toBe(HINGLISH);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('calls gpt-4.1-mini to translate and transliterate names/places', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: 'Raji, Savanampatti, 641035, Coimbatore' } }]
    });

    const result = await toVendorEnglish('ராஜி, சவணம்பட்டி, 641035, கோயம்புத்தூர்');

    expect(result).toBe('Raji, Savanampatti, 641035, Coimbatore');
    expect(createMock).toHaveBeenCalledTimes(1);
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe(VENDOR_ENGLISH_MODEL);
    expect(call.model).toBe('gpt-4.1-mini');
    expect(call.temperature).toBe(0);
    expect(call.max_completion_tokens).toBe(800);
    expect(call.messages[0].role).toBe('system');
    expect(call.messages[0].content).toContain('Transliterate personal names and place names');
    expect(call.messages[1]).toEqual({
      role: 'user',
      content: 'ராஜி, சவணம்பட்டி, 641035, கோயம்புத்தூர்'
    });
  });

  it('strips wrapping quotes from the model output', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: '"Hello, where is my order?"' } }]
    });
    expect(await toVendorEnglish(TAMIL)).toBe('Hello, where is my order?');
  });
});

describe('ensureMessageContentEn', () => {
  it('is a no-op for Latin-script and placeholder bodies (no DB write, no model)', async () => {
    expect(await ensureMessageContentEn('msg-1', HINGLISH)).toBeNull();
    expect(await ensureMessageContentEn('msg-1', '📍 Location')).toBeNull();
    expect(await ensureMessageContentEn('msg-1', '')).toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('does not call the model or overwrite when contentEn is already set', async () => {
    findUniqueMock.mockResolvedValue({ contentEn: 'Hello, where is my order?' });

    const result = await ensureMessageContentEn('msg-1', TAMIL);

    expect(result).toBe('Hello, where is my order?');
    expect(createMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      select: { contentEn: true }
    });
  });

  it('writes contentEn from toVendorEnglish and never touches content', async () => {
    const result = await ensureMessageContentEn('msg-1', TAMIL);

    expect(result).toBe('Hello, where is my order?');
    expect(updateManyMock).toHaveBeenCalledTimes(1);
    const updateArg = updateManyMock.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'msg-1', contentEn: null });
    expect(updateArg.data).toEqual({ contentEn: 'Hello, where is my order?' });
    expect(updateArg.data).not.toHaveProperty('content');
    expect(updateArg.data).not.toHaveProperty('normalizedContent');
  });

  it('returns null without writing when the model echoes the original', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: TAMIL } }]
    });

    const result = await ensureMessageContentEn('msg-1', TAMIL);

    expect(result).toBeNull();
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('swallows translation errors so ingest callers are not blocked', async () => {
    createMock.mockRejectedValue(new Error('OpenAI 500'));

    await expect(ensureMessageContentEn('msg-1', TAMIL)).resolves.toBeNull();
    expect(updateManyMock).not.toHaveBeenCalled();
  });
});
