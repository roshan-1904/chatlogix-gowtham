import { Link } from 'react-router-dom';
import { Card } from '@chatlogix/ui';
import { IconWhatsApp } from './dashboardIcons';

interface ConnectWhatsAppPromoProps {
  showLowBalanceLink?: boolean;
}

export function ConnectWhatsAppPromo({ showLowBalanceLink = false }: ConnectWhatsAppPromoProps) {
  return (
    <Card className="rounded-xl border-secondary-500/20 bg-secondary-500/5 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary-500 text-white">
            <IconWhatsApp className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-primary-500 sm:text-base">Connect your shop number</h2>
            <p className="mt-0.5 text-xs text-gray-600 sm:text-sm">
              Answer customers on WhatsApp with AI-assisted replies from your catalog.
              {showLowBalanceLink && (
                <>
                  {' '}
                  <Link to="/wallet" className="font-medium text-primary-500 underline-offset-2 hover:underline">
                    Top up your wallet
                  </Link>
                  {' '}
                  so replies can go out once you are live.
                </>
              )}
            </p>
          </div>
        </div>
        <Link
          to="/settings/whatsapp"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-secondary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-secondary-500/90"
        >
          Connect WhatsApp
        </Link>
      </div>
    </Card>
  );
}
