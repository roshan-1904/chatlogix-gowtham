import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Button } from '@chatlogix/ui';
import { useVendorSettings } from '../../../hooks/settings/useVendorSettings';
import { orderSettingsSchema, type OrderSettingsFormData } from '../../../lib/validation/settingsSchemas';
import { FormField } from '../FormField';
import { ConfirmationDialog } from '../ConfirmationDialog';

interface OrderSettingsTabProps {
  vendorId: string;
}

export function OrderSettingsTab({}: OrderSettingsTabProps) {
  const {
    orderSettings,
    isLoadingOrderSettings,
    updateOrderSettings,
    isUpdatingOrderSettings,
  } = useVendorSettings();

  const [showConfirm, setShowConfirm] = useState(false);

  const form = useForm<OrderSettingsFormData>({
    resolver: zodResolver(orderSettingsSchema),
    defaultValues: {
      category: null,
      askForPreferredDeliveryDate: false,
      orderPrefix: null,
      minimumOrderValue: null,
      orderPreparationConfig: null,
    },
  });

  useEffect(() => {
    if (orderSettings) {
      form.reset({
        category: orderSettings.category,
        askForPreferredDeliveryDate: orderSettings.askForPreferredDeliveryDate,
        orderPrefix: orderSettings.orderPrefix,
        minimumOrderValue: orderSettings.minimumOrderValue,
        orderPreparationConfig: orderSettings.orderPreparationConfig,
      });
    }
  }, [orderSettings, form]);

  const onSubmit = async (data: OrderSettingsFormData) => {
    try {
      await updateOrderSettings(data);
      toast.success('Order settings updated successfully');
      setShowConfirm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update order settings');
    }
  };

  if (isLoadingOrderSettings) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Order Settings</h2>
        <p className="text-sm text-gray-600 mt-1">
          Configure order processing, prefixes, and minimum values
        </p>
      </div>

      <form onSubmit={form.handleSubmit(() => setShowConfirm(true))} className="space-y-6">
        <FormField
          label="Order Prefix"
          name="orderPrefix"
          type="text"
          value={form.watch('orderPrefix') || ''}
          onChange={(value) => form.setValue('orderPrefix', value as string || null)}
          helpText="5-letter prefix for order numbers (e.g., VENDI, BAKER)"
          maxLength={5}
        />

        <FormField
          label="Minimum Order Value"
          name="minimumOrderValue"
          type="number"
          value={form.watch('minimumOrderValue') || ''}
          onChange={(value) => form.setValue('minimumOrderValue', value ? Number(value) : null)}
          helpText="Minimum order value in paise (leave empty for no minimum)"
        />

        <FormField
          label="Category"
          name="category"
          type="text"
          value={form.watch('category') || ''}
          onChange={(value) => form.setValue('category', value as string || null)}
          helpText="Business category"
        />

        <div className="flex items-center">
          <input
            type="checkbox"
            id="askForPreferredDeliveryDate"
            checked={form.watch('askForPreferredDeliveryDate') || false}
            onChange={(e) => form.setValue('askForPreferredDeliveryDate', e.target.checked)}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label htmlFor="askForPreferredDeliveryDate" className="ml-2 text-sm text-gray-700">
            Ask customers for preferred delivery date
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="ghost"
            onClick={() => form.reset()}
            disabled={isUpdatingOrderSettings}
          >
            Reset
          </Button>
          <Button type="submit" disabled={isUpdatingOrderSettings}>
            {isUpdatingOrderSettings ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>

      <ConfirmationDialog
        open={showConfirm}
        onConfirm={form.handleSubmit(onSubmit)}
        onCancel={() => setShowConfirm(false)}
        title="Confirm Order Settings Changes"
        message="Are you sure you want to save these order settings changes?"
        variant="danger"
      />
    </div>
  );
}

