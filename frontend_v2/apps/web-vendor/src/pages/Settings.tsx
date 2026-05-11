import { useState } from 'react';
import { useAuth } from '@chatlogix/auth';
import { Card } from '@chatlogix/ui';
import { AccountBusinessTab } from '../components/settings/tabs/AccountBusinessTab';
import { AIConfigTab } from '../components/settings/tabs/AIConfigTab';
import { OrderSettingsTab } from '../components/settings/tabs/OrderSettingsTab';
import { NotificationsTab } from '../components/settings/tabs/NotificationsTab';
import { AdvancedTab } from '../components/settings/tabs/AdvancedTab';

type TabId = 'account' | 'ai' | 'orders' | 'notifications' | 'advanced';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'account', label: 'Account & Business' },
  { id: 'ai', label: 'AI Configuration' },
  { id: 'orders', label: 'Order Settings' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'advanced', label: 'Advanced' },
];

export function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('account');

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
                  onClick={() => setActiveTab(tab.id)}
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
            {activeTab === 'notifications' && <NotificationsTab vendorId={user.vendorId} />}
            {activeTab === 'advanced' && <AdvancedTab vendorId={user.vendorId} />}
          </Card>
        </div>
      </div>
    </div>
  );
}

