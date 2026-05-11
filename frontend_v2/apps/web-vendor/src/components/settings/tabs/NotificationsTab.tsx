import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@chatlogix/ui';
import { useVendorSettings } from '../../../hooks/settings/useVendorSettings';
import { ConfirmationDialog } from '../ConfirmationDialog';
import type { NotificationSettings } from '../../../types/settings';

interface NotificationsTabProps {
  vendorId: string;
}

export function NotificationsTab({}: NotificationsTabProps) {
  const {
    notificationSettings,
    isLoadingNotificationSettings,
    updateNotificationSettings,
    isUpdatingNotificationSettings,
  } = useVendorSettings();

  const [showConfirm, setShowConfirm] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>({});

  useEffect(() => {
    if (notificationSettings) {
      setSettings(notificationSettings);
    }
  }, [notificationSettings]);

  const onSubmit = async () => {
    try {
      await updateNotificationSettings(settings);
      toast.success('Notification settings updated successfully');
      setShowConfirm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update notification settings');
    }
  };

  if (isLoadingNotificationSettings) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Notification Settings</h2>
        <p className="text-sm text-gray-600 mt-1">
          Configure when and how you receive notifications
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="orderUpdates"
            checked={settings.orderUpdates || false}
            onChange={(e) => setSettings({ ...settings, orderUpdates: e.target.checked })}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label htmlFor="orderUpdates" className="ml-2 text-sm text-gray-700">
            Order updates
          </label>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="paymentLinks"
            checked={settings.paymentLinks || false}
            onChange={(e) => setSettings({ ...settings, paymentLinks: e.target.checked })}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label htmlFor="paymentLinks" className="ml-2 text-sm text-gray-700">
            Payment links
          </label>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="shippingUpdates"
            checked={settings.shippingUpdates || false}
            onChange={(e) => setSettings({ ...settings, shippingUpdates: e.target.checked })}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label htmlFor="shippingUpdates" className="ml-2 text-sm text-gray-700">
            Shipping updates
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setSettings(notificationSettings || {})}
          disabled={isUpdatingNotificationSettings}
        >
          Reset
        </Button>
        <Button
          onClick={() => setShowConfirm(true)}
          disabled={isUpdatingNotificationSettings}
        >
          {isUpdatingNotificationSettings ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <ConfirmationDialog
        open={showConfirm}
        onConfirm={onSubmit}
        onCancel={() => setShowConfirm(false)}
        title="Confirm Notification Settings Changes"
        message="Are you sure you want to save these notification settings changes?"
      />
    </div>
  );
}

