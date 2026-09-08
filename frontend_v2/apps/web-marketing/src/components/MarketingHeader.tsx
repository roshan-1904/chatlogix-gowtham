import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { navLinks, site } from '../lib/site';
import { pageInnerClass } from '../lib/pageLayout';
import { PortalCta } from './PortalCta';
import { TryChatIcon } from './try/TryIcons';

function BrandMark() {
  return (
    <Link
      to="/"
      className="flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 lg:justify-self-start"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e7f6f1] text-[#128C7E]">
        <TryChatIcon className="h-[18px] w-[18px]" />
      </span>
      <span className="hidden font-display text-[17px] font-extrabold tracking-tight text-primary-500 min-[380px]:inline">
        Chat<span className="text-[#128C7E]">Logix</span>
      </span>
    </Link>
  );
}

function HeaderTryFree({ className = '' }: { className?: string }) {
  return (
    <PortalCta
      href={site.urls.tryFree}
      size="sm"
      className={`!min-h-10 gap-1.5 px-4 text-[13px] font-semibold ${className}`}
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
        className={`flex h-16 items-center justify-between gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr] ${pageInnerClass}`}
      >
        <BrandMark />

        <nav className="hidden items-center justify-center gap-1 lg:flex" aria-label="Primary">
          {navLinks.map((link) => {
            const isActive = activeHref === link.href || activeHref === link.href.replace(/^\//, '');
            return (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setActiveHref(link.href)}
                className={`inline-flex h-9 items-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold tracking-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                  isActive
                    ? 'bg-[#e7f6f1] text-[#128C7E]'
                    : 'text-primary-500/70 hover:bg-[#e7f6f1]/70 hover:text-[#128C7E]'
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        <div className="flex items-center justify-self-end gap-2">
          <div className="hidden items-center gap-1 lg:flex">
            <PortalCta
              href={site.urls.login}
              variant="ghost"
              size="sm"
              className="!min-h-10 border-0 bg-transparent px-3.5 text-[13px] font-semibold text-primary-500 hover:bg-[#e7f6f1] hover:text-[#128C7E]"
            >
              Login
            </PortalCta>
            <HeaderTryFree />
          </div>
          <div className="flex items-center gap-2 lg:hidden">
            <HeaderTryFree className="!px-3" />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-primary-500 hover:bg-[#e7f6f1] focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
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
                  className="block rounded-xl px-3 py-3 text-[14px] font-semibold text-primary-500 hover:bg-[#e7f6f1] hover:text-[#128C7E]"
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
                className="block rounded-xl px-3 py-3 text-[14px] font-semibold text-primary-500 hover:bg-[#e7f6f1] hover:text-[#128C7E]"
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
