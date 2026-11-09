import { onboardingCopy } from './onboardingCopy';
import { resolveSupportContact } from '../../lib/support';

const copy = onboardingCopy.help;

interface NeedHelpFooterProps {
  className?: string;
  variant?: 'sticky' | 'inline';
}

export function NeedHelpFooter({ className }: NeedHelpFooterProps) {
  const link = resolveSupportContact();

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
