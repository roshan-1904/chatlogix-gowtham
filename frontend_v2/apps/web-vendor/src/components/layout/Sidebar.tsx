import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCustomerQuerySummary } from '../../hooks/queries/useCustomerQueries';
import { useVendorConfig } from '../../hooks/useVendorConfig';
import type { IconComponent } from '../icons';
import {
  IconCatalog,
  IconChat,
  IconClose,
  IconDashboard,
  IconFaq,
  IconInbox,
  IconOrders,
  IconSettings,
  IconSidebarCollapse,
  IconSidebarExpand,
  IconSupport,
  IconTemplates,
  IconWallet
} from '../icons';

const COLLAPSE_STORAGE_KEY = 'chatlogix:sidebar-collapsed';

interface NavItem {
  name: string;
  href: string;
  icon: IconComponent;
  /** Rendered as a muted "Soon" row instead of a link until the route exists. */
  comingSoon?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: IconDashboard },
      { name: 'Conversations', href: '/conversations', icon: IconChat },
      { name: 'Queries', href: '/queries', icon: IconInbox },
      { name: 'Orders', href: '/orders', icon: IconOrders }
    ]
  },
  {
    label: 'Catalog',
    items: [
      { name: 'Catalog', href: '/catalog', icon: IconCatalog },
      { name: 'FAQs', href: '/faqs', icon: IconFaq },
      { name: 'Templates', href: '/templates', icon: IconTemplates, comingSoon: true }
    ]
  },
  {
    label: 'Account',
    items: [
      { name: 'Wallet', href: '/wallet', icon: IconWallet },
      { name: 'Settings', href: '/settings', icon: IconSettings },
      { name: 'Support', href: '/support', icon: IconSupport, comingSoon: true }
    ]
  }
];

function readStoredCollapsed(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const location = useLocation();
  const { openCount } = useCustomerQuerySummary();
  const { data: vendor } = useVendorConfig();
  // Read storage during initialization so the rail does not flash wide first.
  const [isCollapsed, setIsCollapsed] = useState(readStoredCollapsed);

  const toggleCollapsed = () => {
    setIsCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      } catch {
        // Private-mode storage failures should not break navigation.
      }
      return next;
    });
  };

  const year = new Date().getFullYear();

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col overflow-hidden
        border-r border-gray-200 bg-white shadow-lg transition-transform duration-300 ease-in-out
        lg:static lg:translate-x-0 lg:shadow-sm lg:transition-[width]
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        ${isCollapsed ? 'lg:w-16' : 'lg:w-64'}
      `}
    >
      <div className="flex items-center justify-between px-4 py-3 lg:hidden">
        <h2 className="text-lg font-semibold text-gray-900">Menu</h2>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          aria-label="Close menu"
        >
          <IconClose className="h-5 w-5" />
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2 lg:pt-4">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-3 last:mb-0">
            <p
              className={`px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 ${
                isCollapsed ? 'lg:hidden' : ''
              }`}
            >
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = !item.comingSoon && location.pathname.startsWith(item.href);
                const showBadge = item.href === '/queries' && openCount > 0;
                const rowClasses = `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isCollapsed ? 'lg:justify-center lg:px-0' : ''
                }`;

                if (item.comingSoon) {
                  return (
                    <li key={item.name}>
                      <span
                        aria-disabled="true"
                        title={isCollapsed ? `${item.name} (coming soon)` : undefined}
                        className={`${rowClasses} cursor-default text-gray-400`}
                      >
                        <Icon className="h-5 w-5 shrink-0 text-gray-300" />
                        <span className={`flex-1 ${isCollapsed ? 'lg:hidden' : ''}`}>{item.name}</span>
                        <span
                          className={`rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 ${
                            isCollapsed ? 'lg:hidden' : ''
                          }`}
                        >
                          Soon
                        </span>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      onClick={onClose}
                      title={isCollapsed ? item.name : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={`${rowClasses} ${
                        isActive
                          ? 'bg-primary-500/5 font-medium text-primary-500 before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary-500'
                          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className={`flex-1 ${isCollapsed ? 'lg:hidden' : ''}`}>{item.name}</span>
                      {showBadge && (
                        <>
                          <span
                            className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-secondary-500 px-1.5 text-xs font-medium text-white ${
                              isCollapsed ? 'lg:hidden' : ''
                            }`}
                          >
                            {openCount > 99 ? '99+' : openCount}
                          </span>
                          {isCollapsed && (
                            <span
                              className="absolute right-3 top-2 hidden h-2 w-2 rounded-full bg-secondary-500 lg:block"
                              aria-hidden
                            />
                          )}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-gray-200 px-3 py-3">
        <button
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 lg:flex ${
            isCollapsed ? 'lg:justify-center lg:px-0' : ''
          }`}
        >
          {isCollapsed ? (
            <IconSidebarExpand className="h-5 w-5 shrink-0" />
          ) : (
            <IconSidebarCollapse className="h-5 w-5 shrink-0" />
          )}
          <span className={isCollapsed ? 'lg:hidden' : ''}>Collapse</span>
        </button>

        <div className={`px-3 pt-2 ${isCollapsed ? 'lg:hidden' : ''}`}>
          {vendor && (
            <>
              <p className="truncate text-sm font-medium text-gray-900">{vendor.businessName}</p>
              {vendor.plan && <p className="text-xs capitalize text-gray-500">{vendor.plan}</p>}
            </>
          )}
          <p className="mt-2 text-[10px] text-gray-400">
            © {year} ChatLogix · v0.1.0
          </p>
        </div>
      </div>
    </aside>
  );
}
