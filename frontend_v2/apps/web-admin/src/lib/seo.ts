import type { PageMeta } from '@chatlogix/hooks';

const NOINDEX = 'noindex, nofollow';

function origin(): string {
  return window.location.origin;
}

const loginMeta: PageMeta = {
  title: 'Sign in to ChatLogix Admin',
  description: 'Internal ChatLogix admin. Sign in to review vendors and keep the platform running.',
  robots: NOINDEX,
};

const appTitles: ReadonlyArray<readonly [string, string]> = [
  ['/dashboard', 'Dashboard'],
  ['/vendors', 'Vendors'],
  ['/usage', 'Usage'],
  ['/reliability', 'Reliability'],
  ['/support', 'Support'],
  ['/controls', 'Controls'],
  ['/templates', 'Templates'],
  ['/billing', 'Billing'],
  ['/payments', 'Payments'],
  ['/tax-reports', 'Tax Reports'],
];

export function resolveAdminPageMeta(pathname: string): PageMeta {
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    return {
      ...loginMeta,
      canonical: `${origin()}/login`,
    };
  }

  const hit = appTitles.find(([path]) => pathname === path || pathname.startsWith(`${path}/`));
  const label = hit?.[1] ?? 'Admin';

  return {
    title: `${label} | ChatLogix Admin`,
    description: loginMeta.description,
    robots: NOINDEX,
  };
}
