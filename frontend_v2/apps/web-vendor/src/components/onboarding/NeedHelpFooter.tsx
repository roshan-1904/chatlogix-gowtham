import { onboardingCopy } from './onboardingCopy';

const supportNumber = import.meta.env.VITE_SUPPORT_WHATSAPP || '';

interface NeedHelpFooterProps {
  className?: string;
  variant?: 'sticky' | 'inline';
}

export function NeedHelpFooter({ className = '' }: NeedHelpFooterProps) {
  const waLink = supportNumber
    ? `https://wa.me/${supportNumber.replace(/\D/g, '')}`
    : null;

  if (!waLink) return null;

  return (
    <footer className={`border-t border-gray-100 px-4 py-4 text-center text-sm text-gray-500 ${className}`}>
      {onboardingCopy.help.prefix}{' '}
      <a href={waLink} target="_blank" rel="noreferrer" className="font-medium text-primary-600">
        WhatsApp us
      </a>{' '}
      {onboardingCopy.help.suffix}
    </footer>
  );
}
