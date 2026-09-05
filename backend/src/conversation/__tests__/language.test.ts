import { describe, it, expect } from 'vitest';
import { isEnglishLanguage, detectLanguageFromText } from '../language.js';

describe('isEnglishLanguage', () => {
  it('treats en variants as English', () => {
    expect(isEnglishLanguage('en')).toBe(true);
    expect(isEnglishLanguage('en-IN')).toBe(true);
    expect(isEnglishLanguage('en_US')).toBe(true);
  });

  it('treats regional codes and mixed as non-English', () => {
    expect(isEnglishLanguage('hi')).toBe(false);
    expect(isEnglishLanguage('ta')).toBe(false);
    expect(isEnglishLanguage('ml')).toBe(false);
    expect(isEnglishLanguage('kn')).toBe(false);
    expect(isEnglishLanguage('te')).toBe(false);
    expect(isEnglishLanguage('mixed')).toBe(false);
  });

  it('defaults null/empty to English', () => {
    expect(isEnglishLanguage(null)).toBe(true);
    expect(isEnglishLanguage(undefined)).toBe(true);
    expect(isEnglishLanguage('')).toBe(true);
  });
});

describe('detectLanguageFromText', () => {
  it('detects major Indian scripts', () => {
    expect(detectLanguageFromText('नमस्ते')).toBe('hi');
    expect(detectLanguageFromText('வணக்கம்')).toBe('ta');
    expect(detectLanguageFromText('നമസ്കാരം')).toBe('ml');
    expect(detectLanguageFromText('ನಮಸ್ಕಾರ')).toBe('kn');
    expect(detectLanguageFromText('నమస్కారం')).toBe('te');
  });

  it('returns en for Latin-only text', () => {
    expect(detectLanguageFromText('Hello, 2 brownies please')).toBe('en');
  });
});
