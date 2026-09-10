import { Link } from 'react-router-dom';
import { pageInnerClass } from '../lib/pageLayout';
import { site, socialLinks } from '../lib/site';

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M12.6 1.5h2.2L9.7 7.3 16 14.5h-4.4L8 10.1 4 14.5H1.8l5.4-6.2L.5 1.5h4.5l3.4 4.1 4.2-4.1zm-.8 11.7h1.2L4.3 2.7H3L11.8 13.2z" />
    </svg>
  );
}

function IconYouTube({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M15.7 4.6a2 2 0 0 0-1.4-1.4C13 3 8 3 8 3s-5 0-6.3.2A2 2 0 0 0 .3 4.6 21 21 0 0 0 0 8a21 21 0 0 0 .3 3.4 2 2 0 0 0 1.4 1.4C3 13 8 13 8 13s5 0 6.3-.2a2 2 0 0 0 1.4-1.4A21 21 0 0 0 16 8a21 21 0 0 0-.3-3.4zM6.4 10.4V5.6L10.8 8 6.4 10.4z" />
    </svg>
  );
}

function IconLinkedIn({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M3.3 14H1V5.3h2.3V14zM2.1 4.3A1.3 1.3 0 1 1 2.1 1.6a1.3 1.3 0 0 1 0 2.7zM15 14h-2.3V9.7c0-1-.4-1.7-1.3-1.7-.7 0-1.1.5-1.3 1-.1.2-.1.5-.1.8V14H7.7s.1-7.6 0-8.7h2.3v1.2c.3-.5 1-1.4 2.4-1.4 1.8 0 3.1 1.2 3.1 3.7V14z" />
    </svg>
  );
}

function IconInstagram({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 4.6A3.4 3.4 0 1 0 8 11.4 3.4 3.4 0 0 0 8 4.6zm0 5.6A2.2 2.2 0 1 1 8 5.8a2.2 2.2 0 0 1 0 4.4z" />
      <path d="M12.4 1.5H3.6A2.1 2.1 0 0 0 1.5 3.6v8.8a2.1 2.1 0 0 0 2.1 2.1h8.8a2.1 2.1 0 0 0 2.1-2.1V3.6a2.1 2.1 0 0 0-2.1-2.1zm.9 10.9a.9.9 0 0 1-.9.9H3.6a.9.9 0 0 1-.9-.9V3.6a.9.9 0 0 1 .9-.9h8.8a.9.9 0 0 1 .9.9v8.8z" />
      <circle cx="12.1" cy="3.9" r=".8" />
    </svg>
  );
}

function IconFacebook({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M10.7 8.9h1.8l.3-2.3H10.7V5.2c0-.6.2-1.1 1.1-1.1h1.1V2.1S11.9 2 10.8 2C8.7 2 7.3 3.3 7.3 5.5v1.1H5.3v2.3h2v5.6h2.4V8.9z" />
    </svg>
  );
}

function IconWhatsApp({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M13.3 2.7A6.6 6.6 0 0 0 2.4 11L1.5 14.5 5 13.6A6.6 6.6 0 1 0 13.3 2.7zM8 13.3a5.3 5.3 0 0 1-2.7-.7l-.2-.1-2.1.6.6-2-.1-.2A5.3 5.3 0 1 1 8 13.3zm3-3.5c-.1.4-.6.7-1 .8-.3.1-.7.2-2.1-.5-1.8-.8-2.9-2.6-3-2.8-.1-.2-.8-1-.8-1.9s.5-1.3.6-1.5c.2-.2.4-.2.5-.2h.4c.1 0 .3 0 .4.3l.5 1.2c.1.2 0 .3 0 .4l-.2.3c-.1.1-.2.2-.1.4.1.2.5.8 1 1.2.6.5 1.2.7 1.4.8.2 0 .3 0 .4-.1l.4-.3c.1-.1.3-.1.4 0l1.1.6c.2.1.3.2.3.3.1.1 0 .5-.2.9z" />
    </svg>
  );
}

const socialIcons = {
  x: IconX,
  youtube: IconYouTube,
  linkedin: IconLinkedIn,
  instagram: IconInstagram,
  facebook: IconFacebook,
  whatsapp: IconWhatsApp,
};

export function MarketingFooter() {
  const year = new Date().getFullYear();
  const links = [
    ...socialLinks,
    ...(site.urls.talkToUs ? [{ id: 'whatsapp' as const, label: 'WhatsApp', href: site.urls.talkToUs }] : []),
  ];

  return (
    // Below `lg` the fixed StickyCta sits on top of the page bottom; reserve its height
    // so the footer is never covered.
    <footer className="marketing-cta-safe-area relative shrink-0 bg-black text-white [--marketing-cta-safe-gap:0.625rem]">
      <div
        className={`relative flex min-h-12 flex-wrap items-center justify-center gap-x-3 gap-y-1.5 py-2.5 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-3 ${pageInnerClass}`}
      >
        <ul className="flex items-center gap-3 sm:gap-3.5">
          {links.map((link) => {
            const Icon = socialIcons[link.id];
            return (
              <li key={link.id}>
                <a
                  href={link.href}
                  aria-label={link.label}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 w-8 items-center justify-center text-white/90 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                </a>
              </li>
            );
          })}
        </ul>

        <p className="text-center text-[12px] text-white">
          ChatLogix © {year}
          <Link
            to="/privacy"
            className="ml-3 text-white underline decoration-white/70 underline-offset-2 hover:decoration-white"
          >
            Privacy
          </Link>
        </p>

        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[12px] sm:justify-self-end">
          <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 1.8c1.7 1.8 2.7 4 2.7 6.2S9.7 12.4 8 14.2C6.3 12.4 5.3 10.2 5.3 8S6.3 3.6 8 1.8z" stroke="currentColor" strokeWidth="1.3" />
            <path d="M2.2 8h11.6" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          <span className="font-medium text-white">English</span>
          <span className="hidden text-white/70 min-[420px]:inline">India</span>
        </span>
      </div>
    </footer>
  );
}
