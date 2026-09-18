import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useLogout } from '@chatlogix/auth';
import { BrandLogo } from '@chatlogix/ui';
import { useVendorConfig } from '../../hooks/useVendorConfig';
import { formatWalletAmount } from '../../utils/currency';
import {
  IconChevronDown,
  IconLogout,
  IconMenu,
  IconSettings,
  IconSupport,
  IconWallet
} from '../icons';
import { getPageTitle } from './pageTitles';

/** Same threshold the dashboard wallet card uses for its low-balance warning. */
const LOW_BALANCE_MILLI = 20000;

function getInitials(businessName: string): string {
  const letters = businessName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]);
  return letters.join('').toUpperCase() || '?';
}

interface HeaderProps {
  readonly onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const logout = useLogout();
  const { data: vendor } = useVendorConfig();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const pageTitle = getPageTitle(location.pathname);
  const walletMilli = vendor?.walletBalanceMilli;
  const isLowBalance = typeof walletMilli === 'number' && walletMilli < LOW_BALANCE_MILLI;

  // Close user menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!isUserMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuOpen]);

  const handleLogout = () => {
    void logout();
    void navigate('/login');
    setIsUserMenuOpen(false);
  };

  return (
    <header className="relative z-30 border-b border-gray-200 bg-white">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
        <button
          onClick={onMenuClick}
          className="-ml-1 rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 lg:hidden"
          aria-label="Toggle menu"
        >
          <IconMenu className="h-5 w-5" />
        </button>

        <Link to="/dashboard" className="flex shrink-0 items-center" aria-label="ChatLogix home">
          <BrandLogo className="h-8 w-auto lg:h-9" />
        </Link>

        {pageTitle && (
          <div className="hidden min-w-0 items-center gap-3 sm:flex">
            <span className="h-5 w-px bg-gray-200" aria-hidden />
            <span className="truncate text-sm text-gray-500">{pageTitle}</span>
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {typeof walletMilli === 'number' && (
            <Link
              to="/wallet"
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                isLowBalance
                  ? 'border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
              aria-label={
                isLowBalance
                  ? `Wallet balance ${formatWalletAmount(walletMilli)} is low. Add money.`
                  : `Wallet balance ${formatWalletAmount(walletMilli)}`
              }
            >
              <IconWallet className="h-4 w-4" />
              <span>{formatWalletAmount(walletMilli)}</span>
            </Link>
          )}

          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen((open) => !open)}
              className="flex items-center gap-1 rounded-lg p-1 transition-colors hover:bg-gray-100"
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={isUserMenuOpen}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-xs font-semibold text-primary-500">
                {vendor ? getInitials(vendor.businessName) : ''}
              </span>
              <IconChevronDown
                className={`h-4 w-4 text-gray-500 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isUserMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-60 rounded-lg border border-gray-200 bg-white py-1.5 shadow-lg"
              >
                <div className="border-b border-gray-200 px-4 py-3">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {vendor?.businessName ?? 'Your business'}
                  </p>
                  {user?.phoneNumber && (
                    <p className="mt-0.5 text-xs text-gray-500">{user.phoneNumber}</p>
                  )}
                </div>
                <Link
                  to="/settings"
                  role="menuitem"
                  onClick={() => setIsUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <IconSettings className="h-4 w-4 text-gray-400" />
                  <span>Settings</span>
                </Link>
                {/* Support has no route yet — same Soon treatment as the sidebar. */}
                <span
                  role="menuitem"
                  aria-disabled="true"
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-400"
                >
                  <IconSupport className="h-4 w-4 text-gray-300" />
                  <span>Support</span>
                  <span className="ml-auto rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                    Soon
                  </span>
                </span>
                <button
                  onClick={handleLogout}
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 border-t border-gray-200 px-4 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  <IconLogout className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
