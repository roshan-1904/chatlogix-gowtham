import { describe, it, expect } from 'vitest';
import { navGroups } from '../Sidebar';

// Known registered top-level routes in web-vendor App.tsx
const REGISTERED_ROUTES = new Set([
  '/dashboard',
  '/conversations',
  '/queries',
  '/orders',
  '/order-payments',
  '/catalog',
  '/faqs',
  '/settings',
  '/wallet',
  '/support',
]);

describe('Navigation Integrity (P0.4)', () => {
  const allItems = navGroups.flatMap((group) => group.items);

  it('every active navigation item maps to a registered route in App.tsx', () => {
    const activeItems = allItems.filter((item) => !item.comingSoon);

    expect(activeItems.length).toBeGreaterThan(0);

    for (const item of activeItems) {
      expect(
        REGISTERED_ROUTES.has(item.href),
        `Nav item "${item.name}" with href "${item.href}" is clickable but has no registered route in App.tsx`
      ).toBe(true);
    }
  });

  it('any nav item without a route is explicitly gated with comingSoon: true', () => {
    const unroutedItems = allItems.filter((item) => !REGISTERED_ROUTES.has(item.href));

    for (const item of unroutedItems) {
      expect(
        item.comingSoon,
        `Nav item "${item.name}" (${item.href}) does not exist in App.tsx and must be marked comingSoon: true`
      ).toBe(true);
    }
  });

  it('every navigation item has valid metadata (name, leading slash href, and icon component)', () => {
    const hrefsSeen = new Set<string>();

    for (const item of allItems) {
      expect(item.name.trim().length).toBeGreaterThan(0);
      expect(item.href.startsWith('/')).toBe(true);
      expect(typeof item.icon).toBe('function');

      // No duplicate hrefs in navigation
      expect(hrefsSeen.has(item.href), `Duplicate href found: ${item.href}`).toBe(false);
      hrefsSeen.add(item.href);
    }
  });
});

