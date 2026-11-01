// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeCsvCell,
  exportPlatformUsageCsv,
  triggerBlobDownload,
  getLast7DaysPreset,
  getThisMonthPreset,
  formatIstYmd
} from '../usage';
import { tokenStorage } from '@chatlogix/auth';

describe('Usage CSV client utilities', () => {
  describe('escapeCsvCell', () => {
    it('returns empty string for null and undefined', () => {
      expect(escapeCsvCell(null)).toBe('');
      expect(escapeCsvCell(undefined)).toBe('');
    });

    it('returns raw string/number when no special characters are present', () => {
      expect(escapeCsvCell('Annapoorna')).toBe('Annapoorna');
      expect(escapeCsvCell(1234.56)).toBe('1234.56');
    });

    it('wraps with quotes if value contains comma', () => {
      expect(escapeCsvCell('Annapoorna, Inc.')).toBe('"Annapoorna, Inc."');
    });

    it('escapes internal quotes and wraps with quotes', () => {
      expect(escapeCsvCell('Sam\'s "Best" Store')).toBe('"Sam\'s ""Best"" Store"');
    });

    it('wraps with quotes if value contains newline or CRLF', () => {
      expect(escapeCsvCell('Line1\nLine2')).toBe('"Line1\nLine2"');
      expect(escapeCsvCell('Line1\r\nLine2')).toBe('"Line1\r\nLine2"');
    });
  });

  describe('Date preset helpers for IST', () => {
    it('formats IST date as YYYY-MM-DD', () => {
      // 2026-10-25T00:00:00.000Z -> IST is +05:30 -> 2026-10-25
      const date = new Date('2026-10-25T00:00:00.000Z');
      expect(formatIstYmd(date)).toBe('2026-10-25');
    });

    it('generates valid last 7 days preset', () => {
      const preset = getLast7DaysPreset();
      expect(preset.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(preset.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(preset.from <= preset.to).toBe(true);
    });

    it('generates valid this month preset starting on 01', () => {
      const preset = getThisMonthPreset();
      expect(preset.from).toMatch(/^\d{4}-\d{2}-01$/);
      expect(preset.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('exportPlatformUsageCsv', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      vi.spyOn(tokenStorage, 'getToken').mockReturnValue('test-admin-token');
    });

    afterEach(() => {
      global.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it('calls fetch with query params, format=csv, and auth header', async () => {
      const mockBlob = new Blob(['Shop,Vendor ID\n'], { type: 'text/csv' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Disposition': 'attachment; filename="chatlogix-usage-2026-10-18-to-2026-10-24.csv"',
          'Content-Type': 'text/csv; charset=utf-8'
        }),
        blob: () => Promise.resolve(mockBlob)
      });

      const result = await exportPlatformUsageCsv({
        from: '2026-10-18',
        to: '2026-10-24'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('from=2026-10-18&to=2026-10-24&format=csv'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-admin-token'
          }) as unknown as Record<string, string>
        })
      );
      expect(result.filename).toBe('chatlogix-usage-2026-10-18-to-2026-10-24.csv');
      expect(result.blob).toBe(mockBlob);
    });

    it('throws descriptive error when fetch returns non-2xx', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'range_exceeds_31_days', message: 'Date range cannot exceed 31 calendar days' })
      });

      await expect(
        exportPlatformUsageCsv({
          from: '2026-09-01',
          to: '2026-10-25'
        })
      ).rejects.toThrow('Date range cannot exceed 31 calendar days');
    });
  });

  describe('triggerBlobDownload', () => {
    it('creates object URL and simulates link click', () => {
      const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/test-uuid');
      const revokeObjectURLMock = vi.fn();
      global.URL.createObjectURL = createObjectURLMock;
      global.URL.revokeObjectURL = revokeObjectURLMock;

      const clickMock = vi.fn();
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      const removeChildSpy = vi.spyOn(document.body, 'removeChild');

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const el = originalCreateElement(tagName);
        if (tagName === 'a') {
          el.click = clickMock;
        }
        return el;
      });

      const mockBlob = new Blob(['test']);
      triggerBlobDownload(mockBlob, 'test-export.csv');

      expect(createObjectURLMock).toHaveBeenCalledWith(mockBlob);
      expect(clickMock).toHaveBeenCalled();
      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();
    });

    it('handles non-browser environment gracefully when document is undefined', () => {
      const originalDocument = global.document;
      try {
        // @ts-expect-error Simulating non-browser environment
        delete global.document;
        const mockBlob = new Blob(['test']);
        expect(() => triggerBlobDownload(mockBlob, 'test.csv')).not.toThrow();
      } finally {
        global.document = originalDocument;
      }
    });
  });
});
