import type { ReactNode } from 'react';
import { site } from '../lib/site';

type PortalCtaVariant = 'primary' | 'secondary' | 'ghost';

interface PortalCtaProps {
  href: string;
  children: ReactNode;
  variant?: PortalCtaVariant;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  target?: string;
  rel?: string;
}

const base =
  'inline-flex items-center justify-center whitespace-nowrap font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors active:scale-[0.98]';

const variants: Record<PortalCtaVariant, string> = {
  primary: 'bg-primary-500 text-white hover:opacity-90 focus:ring-primary-500',
  secondary: 'bg-secondary-500 text-white hover:opacity-90 focus:ring-secondary-500',
  ghost: 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 focus:ring-gray-300',
};

const sizes: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'px-3 py-2 text-sm min-h-[44px]',
  md: 'px-4 py-2.5 text-sm min-h-[44px]',
  lg: 'px-6 py-3 text-base min-h-[48px]',
};

export function PortalCta({
  href,
  children,
  variant = 'primary',
  className = '',
  size = 'md',
  target,
  rel,
}: PortalCtaProps) {
  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </a>
  );
}

export function TryFreeCta({ className = '', size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <PortalCta href={site.urls.tryFree} className={className} size={size}>
      Try Free
    </PortalCta>
  );
}

export function LoginLink({ className = '' }: { className?: string }) {
  return (
    <a
      href={site.urls.login}
      className={`text-sm font-medium text-primary-500 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded min-h-[44px] inline-flex items-center ${className}`}
    >
      Login
    </a>
  );
}
