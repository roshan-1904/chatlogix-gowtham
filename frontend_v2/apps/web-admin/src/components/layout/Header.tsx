import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BrandLogo } from '@chatlogix/ui';
import { getComputedAlerts } from '../../lib/controls';

export function Header() {
  const { data: alertsData, isLoading } = useQuery({
    queryKey: ['controls-alerts-count'],
    queryFn: getComputedAlerts,
    refetchInterval: 30000, // Refresh every 30s
  });

  const alertCount = alertsData?.count ?? 0;

  return (
    <header className="bg-white shadow-2xs border-b border-gray-200 sticky top-0 z-30">
      <div className="px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <BrandLogo className="h-8 w-auto" />
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            Admin Portal
          </span>
        </div>
        <div className="flex items-center space-x-4">
          <Link
            to="/controls?tab=alerts"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <span>🔔</span>
            <span>Alerts</span>
            {!isLoading && alertCount > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[18px] text-center shadow-2xs">
                {alertCount}
              </span>
            )}
          </Link>
          <div className="h-8 w-8 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center text-xs font-bold text-primary-700">
            A
          </div>
        </div>
      </div>
    </header>
  );
}
