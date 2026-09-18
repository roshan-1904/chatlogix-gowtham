import type { PageMeta } from '@chatlogix/hooks';
import { onboardingCopy } from '../components/onboarding/onboardingCopy';

const INDEX = 'index, follow';
const NOINDEX = 'noindex, nofollow';

function origin(): string {
  return window.location.origin;
}

const loginMeta: PageMeta = {
  title: 'Log in to your WhatsApp shop | ChatLogix',
  description:
    'Sign in to manage catalog, conversations, and orders. ChatLogix keeps answering customers on WhatsApp while you run the shop.',
};

const appFallback: PageMeta = {
  title: 'ChatLogix',
  description: 'Manage your WhatsApp shop with ChatLogix.',
  robots: NOINDEX,
};

const appTitles: ReadonlyArray<readonly [string, string]> = [
  ['/dashboard', 'Dashboard'],
  ['/conversations', 'Conversations'],
  ['/queries', 'Queries'],
  ['/orders', 'Orders'],
  ['/catalog/import/photo', 'Add from a photo'],
  ['/catalog/import/template', 'Import from a spreadsheet'],
  ['/catalog/import', 'Smart import'],
  ['/catalog/new', 'Add a product'],
  ['/catalog', 'Catalog'],
  ['/faqs/new', 'Add an FAQ'],
  ['/faqs', 'FAQs'],
  ['/settings/whatsapp', 'Connect WhatsApp'],
  ['/settings', 'Settings'],
];

const onboardingTitles: ReadonlyArray<readonly [string, string]> = [
  ['/onboarding/welcome', 'Welcome'],
  ['/onboarding/catalog', 'Add your catalog'],
  ['/onboarding/clarify', 'A few shop details'],
  ['/onboarding/confirm', 'Review your shop'],
  ['/onboarding/ai-setup', 'Set up your assistant'],
  ['/onboarding/demo-chat', 'Try the assistant'],
  ['/onboarding/review', 'Finish setup'],
  ['/onboarding/submitted', 'Submitted'],
  ['/onboarding/rejected', 'Application update'],
];

function titled(label: string, robots: string): PageMeta {
  return {
    title: `${label} | ChatLogix`,
    description: appFallback.description,
    robots,
  };
}

function matchPrefix(
  pathname: string,
  table: ReadonlyArray<readonly [string, string]>,
  robots: string,
): PageMeta | null {
  const hit = table.find(([path]) => pathname === path || pathname.startsWith(`${path}/`));
  return hit ? titled(hit[1], robots) : null;
}

export function resolveVendorPageMeta(pathname: string): PageMeta {
  if (pathname === '/signup' || pathname.startsWith('/signup/')) {
    return {
      ...onboardingCopy.signup.meta,
      canonical: `${origin()}/signup`,
      robots: INDEX,
    };
  }

  if (pathname === '/login' || pathname.startsWith('/login/')) {
    return {
      ...loginMeta,
      canonical: `${origin()}/login`,
      robots: INDEX,
    };
  }

  return (
    matchPrefix(pathname, onboardingTitles, NOINDEX) ??
    matchPrefix(pathname, appTitles, NOINDEX) ?? {
      ...appFallback,
      title: `${appFallback.title} | Shop assistant`,
    }
  );
}
