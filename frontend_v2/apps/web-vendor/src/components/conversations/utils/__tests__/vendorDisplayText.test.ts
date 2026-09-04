import { describe, expect, it } from 'vitest';
import { showDualLanguage, vendorSnippet } from '../vendorDisplayText';

describe('vendorDisplayText', () => {
  describe('vendorSnippet', () => {
    it('prefers contentEn over original for English-only snippets', () => {
      expect(vendorSnippet('ஹலோ', 'Hello')).toBe('Hello');
    });

    it('falls back to content when contentEn is missing', () => {
      expect(vendorSnippet('hello there', null)).toBe('hello there');
    });
  });

  describe('showDualLanguage', () => {
    it('shows dual layout when contentEn differs from original', () => {
      expect(showDualLanguage('நான் ராஜி', 'I am Raji')).toBe(true);
    });

    it('uses single line when contentEn matches original', () => {
      expect(showDualLanguage('hello', 'hello')).toBe(false);
    });

    it('uses single line when contentEn is absent', () => {
      expect(showDualLanguage('hello', null)).toBe(false);
      expect(showDualLanguage('hello', undefined)).toBe(false);
    });

    it('uses single line when contentEn is blank', () => {
      expect(showDualLanguage('hello', '   ')).toBe(false);
    });
  });
});
