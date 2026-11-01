import { Link, useLocation } from 'react-router-dom';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Vendors', href: '/vendors', icon: '🏪' },
  { name: 'Usage', href: '/usage', icon: '📈' },
  { name: 'Reliability', href: '/reliability', icon: '🛡️' },
  { name: 'Support', href: '/support', icon: '🎧' },
  { name: 'Controls', href: '/controls', icon: '🎛️' },
  { name: 'Payments', href: '/payments', icon: '💰' },
  { name: 'Tax reports', href: '/tax-reports', icon: '🧾' },
  { name: 'Billing', href: '/billing', icon: '💳' },
  { name: 'Templates', href: '/templates', icon: '📝' },
];

export function Sidebar() {
  const location = useLocation() as { pathname: string };

  return (
    <aside className="w-64 bg-white shadow-sm border-r border-gray-200">
      <nav className="p-4">
        <ul className="space-y-2">
          {navigation.map((item) => {
            const isActive =
              location.pathname === item.href ||
              (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
            return (
              <li key={item.name}>
                <Link
                  to={item.href}
                  className={`flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

