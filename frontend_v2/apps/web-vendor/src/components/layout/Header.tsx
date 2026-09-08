import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useLogout } from '@chatlogix/auth';
import { BrandLogo } from '@chatlogix/ui';
import { apiClient } from '../../lib/api';

interface VendorInfo {
  id: string;
  businessName: string;
  plan?: string;
  status?: string;
  walletBalance?: number;
}

interface HeaderProps {
  readonly onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const logout = useLogout();
  const [vendorInfo, setVendorInfo] = useState<VendorInfo | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchVendorInfo = async () => {
      if (!user?.vendorId) {
        return;
      }

      try {
        const vendor = await apiClient.get<VendorInfo>(
          `/vendors/${user.vendorId}/config`
        );
        setVendorInfo(vendor);
      } catch (error) {
        console.error('Failed to fetch vendor info:', error);
      }
    };

    fetchVendorInfo();
  }, [user?.vendorId]);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setIsUserMenuOpen(false);
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          {/* Left Section - Logo & Menu */}
          <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-4 min-w-0 flex-1">
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors touch-manipulation"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex min-w-0 items-center">
              <BrandLogo className="h-10 w-auto sm:h-11 lg:h-12" />
            </div>
          </div>

          {/* Right Section - User Info & Actions */}
          <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-4">
            {/* Desktop View - Full Info */}
            <div className="hidden lg:flex items-center space-x-4">
              {vendorInfo && (
                <div className="flex flex-col items-end">
                  <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                    {vendorInfo.businessName}
                  </span>
                  {user && (
                    <span className="text-xs text-gray-500">{user.phoneNumber}</span>
                  )}
                </div>
              )}
              <button
                onClick={handleLogout}
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors whitespace-nowrap"
              >
                Logout
              </button>
              <div className="h-9 w-9 rounded-full bg-gray-300 flex-shrink-0"></div>
            </div>

            {/* Tablet View - Compact Info */}
            <div className="hidden md:flex lg:hidden items-center space-x-3">
              {vendorInfo && (
                <span className="text-sm font-medium text-gray-900 truncate max-w-[120px]">
                  {vendorInfo.businessName}
                </span>
              )}
              <button
                onClick={handleLogout}
                className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
              >
                Logout
              </button>
              <div className="h-8 w-8 rounded-full bg-gray-300 flex-shrink-0"></div>
            </div>

            {/* Mobile View - User Menu Dropdown */}
            <div className="md:hidden relative" ref={userMenuRef}>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center space-x-2 p-1.5 rounded-md hover:bg-gray-100 transition-colors touch-manipulation"
                aria-label="User menu"
                aria-expanded={isUserMenuOpen}
              >
                <div className="h-8 w-8 rounded-full bg-gray-300 flex-shrink-0"></div>
                <svg
                  className={`w-4 h-4 text-gray-600 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  {vendorInfo && (
                    <div className="px-4 py-3 border-b border-gray-200">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {vendorInfo.businessName}
                      </p>
                      {user && (
                        <p className="text-xs text-gray-500 mt-1">{user.phoneNumber}</p>
                      )}
                    </div>
                  )}
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

