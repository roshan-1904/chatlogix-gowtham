/**
 * Route prefix -> header page context label.
 *
 * Matched longest-prefix-first so a nested route such as `/settings/whatsapp`
 * wins over `/settings`. Anything unmapped renders no label rather than a
 * wrong one.
 */
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/conversations': 'Conversations',
  '/queries': 'Customer queries',
  '/orders': 'Orders',
  '/catalog': 'Catalog',
  '/catalog/new': 'New product',
  '/catalog/import': 'Catalog import',
  '/faqs': 'FAQs',
  '/faqs/new': 'New FAQ',
  '/settings': 'Settings',
  '/settings/whatsapp': 'WhatsApp connection',
  '/wallet': 'Wallet'
};

const PREFIXES_LONGEST_FIRST = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length);

export function getPageTitle(pathname: string): string | undefined {
  const prefix = PREFIXES_LONGEST_FIRST.find(
    (candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`)
  );
  return prefix ? PAGE_TITLES[prefix] : undefined;
}
