import { useNavigate } from 'react-router-dom';
import { IconCatalog, IconChat, IconOrders, IconWallet } from './dashboardIcons';
import type { DashboardStats } from '../../types/dashboard';

interface QuickActionsPanelProps {
  billing: DashboardStats['billing'];
  whatsappLive?: boolean;
}

const actionClass =
  'flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center transition-colors hover:border-primary-500/20 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/30';

export function QuickActionsPanel({ billing, whatsappLive = false }: QuickActionsPanelProps) {
  const navigate = useNavigate();

  return (
    <nav className="grid grid-cols-2 gap-2 sm:gap-3" aria-label="Quick actions">
      <button type="button" className={actionClass} onClick={() => void navigate('/catalog/new')}>
        <IconCatalog className="h-5 w-5 text-primary-500" />
        <span className="text-xs font-medium text-gray-800">Add product</span>
      </button>
      <button type="button" className={actionClass} onClick={() => void navigate('/orders')}>
        <IconOrders className="h-5 w-5 text-primary-500" />
        <span className="text-xs font-medium text-gray-800">View orders</span>
      </button>
      <button type="button" className={actionClass} onClick={() => void navigate('/settings/whatsapp')}>
        <IconChat className="h-5 w-5 text-secondary-500" />
        <span className="text-xs font-medium text-gray-800">
          {whatsappLive ? 'WhatsApp' : 'Connect WhatsApp'}
        </span>
      </button>
      <button
        type="button"
        className={`${actionClass} ${billing.lowBalanceWarning ? 'border-secondary-500/30 bg-secondary-500/5' : ''}`}
        onClick={() => void navigate('/wallet')}
      >
        <IconWallet className={`h-5 w-5 ${billing.lowBalanceWarning ? 'text-secondary-500' : 'text-primary-500'}`} />
        <span className="text-xs font-medium text-gray-800">Add money</span>
      </button>
    </nav>
  );
}
