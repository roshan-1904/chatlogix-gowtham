import { Link, useLocation } from 'react-router-dom';
import { useCustomerQuerySummary } from '../../hooks/queries/useCustomerQueries';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Conversations', href: '/conversations', icon: '💬' },
  { name: 'Queries', href: '/queries', icon: '📥' },
  { name: 'Catalog', href: '/catalog', icon: '📦' },
  { name: 'FAQs', href: '/faqs', icon: '❓' },
  { name: 'Orders', href: '/orders', icon: '🛒' },
  { name: 'Templates', href: '/templates', icon: '📝' },
  { name: 'Wallet', href: '/wallet', icon: '💳' },
  { name: 'Settings', href: '/settings', icon: '⚙️' },
  { name: 'Support', href: '/support', icon: '💬' },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const location = useLocation();
  const { openCount } = useCustomerQuerySummary();

  return (
    <>
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 bg-white shadow-lg lg:shadow-sm border-r border-gray-200
          h-[calc(100vh-120px)] lg:h-[calc(100vh-120px)]
          overflow-y-auto transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <nav className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-4 lg:hidden">
            <h2 className="text-lg font-semibold text-gray-900">Menu</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <ul className="space-y-1 sm:space-y-2">
            {navigation.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              return (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    onClick={() => {
                      if (onClose) {
                        onClose();
                      }
                    }}
                    className={`flex items-center space-x-2 sm:space-x-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg transition-colors text-sm sm:text-base ${
                      isActive
                        ? 'bg-gray-100 text-primary-500 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-base sm:text-lg">{item.icon}</span>
                    <span className="flex-1">{item.name}</span>
                    {item.href === '/queries' && openCount > 0 && (
                      <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-secondary-500 px-1.5 text-xs font-medium text-white">
                        {openCount > 99 ? '99+' : openCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}
