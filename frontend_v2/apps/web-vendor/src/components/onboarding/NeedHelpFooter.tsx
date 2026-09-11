import { onboardingCopy } from './onboardingCopy';

const copy = onboardingCopy.help;

/**
 * Help is always reachable, so this never renders nothing. Preference order:
 * VITE_SUPPORT_WHATSAPP (digits) → VITE_SUPPORT_EMAIL (mailto) → the public
 * chatlogix.in contact page.
 */
function supportLink(): { href: string; label: string } {
  const digits = (import.meta.env.VITE_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '');
  if (digits) return { href: `https://wa.me/${digits}`, label: copy.whatsapp };

  const email = (import.meta.env.VITE_SUPPORT_EMAIL ?? '').trim();
  if (email) return { href: `mailto:${email}`, label: copy.email };

  return { href: copy.fallbackUrl, label: copy.fallbackLabel };
}

interface NeedHelpFooterProps {
  className?: string;
  variant?: 'sticky' | 'inline';
}

export function NeedHelpFooter({ className }: NeedHelpFooterProps) {
  const link = supportLink();

  return (
    <footer
      className={`border-t border-gray-100 text-center text-gray-500 ${
        className ?? 'px-4 py-4 text-sm'
      }`}
    >
      {copy.prefix}{' '}
      <a href={link.href} target="_blank" rel="noreferrer" className="font-medium text-primary-600">
        {link.label}
      </a>{' '}
      {copy.suffix}
    </footer>
  );
}
