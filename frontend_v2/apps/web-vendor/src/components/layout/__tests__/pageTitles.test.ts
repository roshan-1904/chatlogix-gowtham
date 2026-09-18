import { describe, expect, it } from 'vitest';
import { getPageTitle } from '../pageTitles';

describe('getPageTitle', () => {
  it('matches a top-level route', () => {
    expect(getPageTitle('/orders')).toBe('Orders');
  });

  it('prefers the longest matching prefix for nested routes', () => {
    expect(getPageTitle('/settings/whatsapp')).toBe('WhatsApp connection');
    expect(getPageTitle('/catalog/import/photo')).toBe('Catalog import');
    expect(getPageTitle('/faqs/new')).toBe('New FAQ');
  });

  it('keeps the parent label for unmapped child routes', () => {
    expect(getPageTitle('/orders/abc-123')).toBe('Orders');
    expect(getPageTitle('/queries/42')).toBe('Customer queries');
  });

  it('does not match on a partial segment', () => {
    expect(getPageTitle('/settingsx')).toBeUndefined();
  });

  it('returns undefined rather than a wrong label for unknown routes', () => {
    expect(getPageTitle('/templates')).toBeUndefined();
    expect(getPageTitle('/')).toBeUndefined();
  });
});
