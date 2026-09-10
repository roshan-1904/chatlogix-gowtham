import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { navLinks, site } from '../lib/site';
import { pageInnerClass } from '../lib/pageLayout';
import { BrandLogo } from '@chatlogix/ui';
import { PortalCta } from './PortalCta';

function BrandMark() {
  return (
    <Link
      to="/"
      className="flex min-h-[44px] min-w-0 items-center rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 lg:justify-self-start"
    >
      <BrandLogo variant="icon" className="h-10 w-10 shrink-0 min-[380px]:hidden sm:h-11 sm:w-11" />
      <BrandLogo className="hidden h-10 w-auto max-w-full min-[380px]:block sm:h-12 lg:h-[3.25rem]" />
    </Link>
  );
}

function HeaderTryFree({ className = '' }: { className?: string }) {
  return (
    <PortalCta
      href={site.urls.tryFree}
      size="md"
      className={`!min-h-11 gap-1.5 rounded-full px-5 text-[15px] font-semibold ${className}`}
    >
      Try Free
      <span aria-hidden>→</span>
    </PortalCta>
  );
}

export function MarketingHeader({ pinned = false }: { pinned?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeHref, setActiveHref] = useState('');

  useEffect(() => {
    if (!menuOpen) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    const syncHash = () => {
      const { hash, pathname } = window.location;
      setActiveHref(hash ? `${pathname}${hash}` : '');
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    window.addEventListener('popstate', syncHash);
    return () => {
      window.removeEventListener('hashchange', syncHash);
      window.removeEventListener('popstate', syncHash);
    };
  }, []);

  return (
    <header
      className={`z-40 border-b border-black/[0.04] bg-[#f8f9fa] ${
        pinned ? 'relative shrink-0' : 'sticky top-0'
      }`}
    >
      <div
        className={`flex h-[var(--marketing-header-h)] min-w-0 items-center justify-between gap-3 sm:gap-4 lg:grid lg:grid-cols-[1fr_auto_1fr] ${pageInnerClass}`}
      >
        <BrandMark />

        <nav className="hidden items-center justify-center gap-1.5 lg:flex" aria-label="Primary">
          {navLinks.map((link) => {
            const isActive = activeHref === link.href || activeHref === link.href.replace(/^\//, '');
            return (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setActiveHref(link.href)}
                className={`inline-flex h-11 items-center whitespace-nowrap rounded-full px-4 text-[15px] font-semibold tracking-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 xl:px-5 xl:text-base ${
                  isActive
                    ? 'bg-[#e7f6f1] text-[#128C7E]'
                    : 'text-primary-500/80 hover:bg-[#e7f6f1]/70 hover:text-[#128C7E]'
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        {/* `shrink-0` so the wordmark, not the menu button, absorbs any width pressure. */}
        <div className="flex shrink-0 items-center justify-self-end gap-2">
          <div className="hidden items-center gap-1.5 lg:flex">
            <PortalCta
              href={site.urls.login}
              variant="ghost"
              size="md"
              className="!min-h-11 border-0 bg-transparent px-4 text-[15px] font-semibold text-primary-500 hover:bg-[#e7f6f1] hover:text-[#128C7E]"
            >
              Login
            </PortalCta>
            <HeaderTryFree />
          </div>
          <div className="flex items-center gap-2 lg:hidden">
            <HeaderTryFree className="!px-4" />
            <button
              type="button"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary-500 hover:bg-[#e7f6f1] focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {menuOpen ? (
        <nav
          id="mobile-nav"
          className={`border-t border-black/[0.04] bg-[#f8f9fa] py-3 lg:hidden ${pageInnerClass}`}
          aria-label="Mobile"
        >
          <ul className="space-y-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="block rounded-xl px-3 py-3.5 text-base font-semibold text-primary-500 hover:bg-[#e7f6f1] hover:text-[#128C7E]"
                  onClick={() => {
                    setActiveHref(link.href);
                    setMenuOpen(false);
                  }}
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li className="pt-1">
              <a
                href={site.urls.login}
                className="block rounded-xl px-3 py-3.5 text-base font-semibold text-primary-500 hover:bg-[#e7f6f1] hover:text-[#128C7E]"
                onClick={() => setMenuOpen(false)}
              >
                Login
              </a>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
