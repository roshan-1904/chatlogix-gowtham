import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@chatlogix/auth';
import { Card } from '@chatlogix/ui';
import { AccountBusinessTab } from '../components/settings/tabs/AccountBusinessTab';
import { AIConfigTab } from '../components/settings/tabs/AIConfigTab';
import { OrderSettingsTab } from '../components/settings/tabs/OrderSettingsTab';
import { NotificationsTab } from '../components/settings/tabs/NotificationsTab';
import { AdvancedTab } from '../components/settings/tabs/AdvancedTab';
import { PaymentCollectionTab } from '../components/settings/tabs/PaymentCollectionTab';

type TabId = 'account' | 'ai' | 'orders' | 'payments' | 'notifications' | 'advanced';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'account', label: 'Account & Business' },
  { id: 'ai', label: 'AI Configuration' },
  { id: 'orders', label: 'Order Settings' },
  { id: 'payments', label: 'Payment Collection' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'advanced', label: 'Advanced' },
];

const TAB_IDS: TabId[] = ['account', 'ai', 'orders', 'payments', 'notifications', 'advanced'];

function tabFromSearch(params: URLSearchParams): TabId {
  const raw = params.get('tab');
  if (raw && TAB_IDS.includes(raw as TabId)) return raw as TabId;
  return 'account';
}

export function Settings() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => tabFromSearch(searchParams));

  useEffect(() => {
    setActiveTab(tabFromSearch(searchParams));
  }, [searchParams]);

  const selectTab = (id: TabId) => {
    setActiveTab(id);
    setSearchParams(id === 'account' ? {} : { tab: id }, { replace: true });
  };

  if (!user?.vendorId) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Please log in to access settings.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account and business preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Navigation */}
        <div className="lg:w-64 flex-shrink-0">
          <Card className="p-4">
            <nav className="space-y-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </Card>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          <Card className="p-6">
            {activeTab === 'account' && <AccountBusinessTab vendorId={user.vendorId} />}
            {activeTab === 'ai' && <AIConfigTab vendorId={user.vendorId} />}
            {activeTab === 'orders' && <OrderSettingsTab vendorId={user.vendorId} />}
            {activeTab === 'payments' && <PaymentCollectionTab vendorId={user.vendorId} />}
            {activeTab === 'notifications' && <NotificationsTab vendorId={user.vendorId} />}
            {activeTab === 'advanced' && <AdvancedTab vendorId={user.vendorId} />}
          </Card>
        </div>
      </div>
    </div>
  );
}

