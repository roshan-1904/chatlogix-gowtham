import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@chatlogix/ui';
import { useVendorSettings } from '../../../hooks/settings/useVendorSettings';
import { FormField } from '../FormField';
import { ConfirmationDialog } from '../ConfirmationDialog';
import type { MatchingConfig } from '../../../types/settings';

interface AdvancedTabProps {
  vendorId: string;
}

export function AdvancedTab({}: AdvancedTabProps) {
  const {
    matchingConfig,
    isLoadingMatchingConfig,
    updateMatchingConfig,
    isUpdatingMatchingConfig,
    updateTimezone,
    isUpdatingTimezone,
  } = useVendorSettings();

  const [showConfirm, setShowConfirm] = useState(false);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [config, setConfig] = useState<MatchingConfig>({});

  useEffect(() => {
    if (matchingConfig) {
      setConfig(matchingConfig);
    }
  }, [matchingConfig]);

  const handleTimezoneSubmit = async () => {
    try {
      await updateTimezone({ timezone });
      toast.success('Timezone updated successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update timezone');
    }
  };

  const handleMatchingConfigSubmit = async () => {
    try {
      await updateMatchingConfig(config);
      toast.success('Matching configuration updated successfully');
      setShowConfirm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update matching configuration');
    }
  };

  if (isLoadingMatchingConfig) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Advanced Settings</h2>
        <p className="text-sm text-gray-600 mt-1">
          Configure advanced options and matching settings
        </p>
      </div>

      {/* Timezone Section */}
      <div className="space-y-4 border-b pb-6">
        <h3 className="text-lg font-medium text-gray-900">Timezone</h3>
        <FormField
          label="Timezone"
          name="timezone"
          type="text"
          value={timezone}
          onChange={(value) => setTimezone(value as string)}
          helpText="Your business timezone (e.g., Asia/Kolkata, America/New_York)"
        />
        <div className="flex justify-end">
          <Button
            onClick={handleTimezoneSubmit}
            disabled={isUpdatingTimezone}
          >
            {isUpdatingTimezone ? 'Saving...' : 'Save Timezone'}
          </Button>
        </div>
      </div>

      {/* Matching Config Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Product Matching Configuration</h3>
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="enableFuzzy"
              checked={config.enableFuzzy || false}
              onChange={(e) => setConfig({ ...config, enableFuzzy: e.target.checked })}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="enableFuzzy" className="ml-2 text-sm text-gray-700">
              Enable fuzzy matching
            </label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="enableAIMatching"
              checked={config.enableAIMatching || false}
              onChange={(e) => setConfig({ ...config, enableAIMatching: e.target.checked })}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="enableAIMatching" className="ml-2 text-sm text-gray-700">
              Enable AI matching
            </label>
          </div>

          <FormField
            label="Matching Threshold"
            name="threshold"
            type="number"
            value={config.threshold || ''}
            onChange={(value) => setConfig({ ...config, threshold: value ? Number(value) : undefined })}
            helpText="Threshold for matching (0-1)"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfig(matchingConfig || {})}
            disabled={isUpdatingMatchingConfig}
          >
            Reset
          </Button>
          <Button
            onClick={() => setShowConfirm(true)}
            disabled={isUpdatingMatchingConfig}
          >
            {isUpdatingMatchingConfig ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <ConfirmationDialog
        open={showConfirm}
        onConfirm={handleMatchingConfigSubmit}
        onCancel={() => setShowConfirm(false)}
        title="Confirm Advanced Settings Changes"
        message="Are you sure you want to save these advanced settings changes?"
      />
    </div>
  );
}

