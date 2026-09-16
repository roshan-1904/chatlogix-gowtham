import { Card } from '@chatlogix/ui';
import { Button } from '@chatlogix/ui';
import { useNavigate } from 'react-router-dom';
import type { DashboardStats } from '../../types/dashboard';

interface QuickActionsPanelProps {
  billing: DashboardStats['billing'];
}

export function QuickActionsPanel({ billing }: QuickActionsPanelProps) {
  const navigate = useNavigate();

  return (
    <Card className="p-4">
      <h3 className="text-base font-semibold text-[#072349] mb-3">Quick Actions</h3>
      <nav className="space-y-2" aria-label="Quick actions navigation">
        <Button
          variant="primary"
          onClick={() => void navigate('/catalog/new')}
          className="w-full justify-center py-2 font-medium text-sm"
          aria-label="Add a new product to catalog"
        >
          <span aria-hidden="true">➕</span> Add Product
        </Button>
        <Button
          variant="secondary"
          onClick={() => void navigate('/orders')}
          className="w-full justify-center py-2 font-medium text-sm"
          aria-label="View all orders"
        >
          <span aria-hidden="true">📋</span> View Orders
        </Button>
        <Button
          variant="secondary"
          onClick={() => void navigate('/wallet')}
          className={`w-full justify-center py-2 font-medium text-sm ${
            billing.lowBalanceWarning
              ? 'bg-[#25D366] hover:bg-[#25D366]/90 text-white border-0'
              : ''
          }`}
          aria-label="Add money to your wallet"
        >
          <span aria-hidden="true">💳</span> Add Money
        </Button>
        <Button
          variant="ghost"
          onClick={() => void navigate('/conversations')}
          className="w-full justify-center py-2 font-medium text-sm hover:bg-gray-100"
          aria-label="View all conversations"
        >
          <span aria-hidden="true">💬</span> View Conversations
        </Button>
      </nav>
    </Card>
  );
}

