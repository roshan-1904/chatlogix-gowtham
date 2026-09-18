import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@chatlogix/ui';

interface DashboardSectionCardProps {
  title: string;
  subtitle?: string;
  footerLabel?: string;
  footerTo?: string;
  children: ReactNode;
  className?: string;
}

export function DashboardSectionCard({
  title,
  subtitle,
  footerLabel,
  footerTo,
  children,
  className = '',
}: DashboardSectionCardProps) {
  return (
    <Card className={`rounded-xl shadow-sm overflow-hidden ${className}`}>
      <div className="border-b border-gray-100 px-4 py-3 sm:px-5 sm:py-3.5">
        <h2 className="text-sm font-semibold text-primary-500 sm:text-base">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
      {footerLabel && footerTo && (
        <div className="border-t border-gray-100 px-4 py-2.5 sm:px-5">
          <Link
            to={footerTo}
            className="text-xs font-medium text-primary-500 hover:text-primary-600 hover:underline"
          >
            {footerLabel}
          </Link>
        </div>
      )}
    </Card>
  );
}
