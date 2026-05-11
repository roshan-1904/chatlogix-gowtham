import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Button } from '@chatlogix/ui';
import { useVendorSettings } from '../../../hooks/settings/useVendorSettings';
import { aiConfigSchema, type AIConfigFormData } from '../../../lib/validation/settingsSchemas';
import { FormField } from '../FormField';
import { ConfirmationDialog } from '../ConfirmationDialog';
import { Note } from '../Note';

interface AIConfigTabProps {
  vendorId: string;
}

export function AIConfigTab({}: AIConfigTabProps) {
  const {
    aiConfig,
    isLoadingAIConfig,
    updateAIConfig,
    isUpdatingAIConfig,
  } = useVendorSettings();

  const [showConfirm, setShowConfirm] = useState(false);

  const form = useForm<AIConfigFormData>({
    resolver: zodResolver(aiConfigSchema),
    defaultValues: {
      aiBotName: null,
      aiPersonality: null,
      aiSystemPrompt: null,
      aiGreeting: null,
      aiClosing: null,
      aiModel: null,
      aiPreparationTimeMinutes: null,
      aiContentResponsibilities: null,
      aiContentConversationRules: null,
      aiContentImportantInstructions: null,
      aiDeliveryInstructions: null,
      aiPickupDeliveryAddress: null,
      aiToneExample: null,
    },
  });

  useEffect(() => {
    if (aiConfig) {
      // Exclude aiProducts from form since products are managed in Catalog
      const { aiProducts, ...configWithoutProducts } = aiConfig;
      form.reset(configWithoutProducts);
    }
  }, [aiConfig, form]);

  const onSubmit = async (data: AIConfigFormData) => {
    try {
      await updateAIConfig(data);
      toast.success('AI configuration updated successfully');
      setShowConfirm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update AI configuration');
    }
  };

  if (isLoadingAIConfig) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">AI Configuration</h2>
        <p className="text-sm text-gray-600 mt-1">
          Configure your AI bot's personality, prompts, and behavior
        </p>
      </div>

      <form onSubmit={form.handleSubmit(() => setShowConfirm(true))} className="space-y-6">
        <FormField
          label="Bot Name"
          name="aiBotName"
          type="text"
          value={form.watch('aiBotName') || ''}
          onChange={(value) => form.setValue('aiBotName', value as string || null)}
          helpText="Name your AI assistant (e.g., BrownieBakerBot)"
        />

        <FormField
          label="Personality"
          name="aiPersonality"
          type="textarea"
          value={form.watch('aiPersonality') || ''}
          onChange={(value) => form.setValue('aiPersonality', value as string || null)}
          rows={3}
          helpText="Describe your AI's personality and communication style"
        />

        <FormField
          label="Delivery Instructions"
          name="aiDeliveryInstructions"
          type="textarea"
          value={form.watch('aiDeliveryInstructions') || ''}
          onChange={(value) => form.setValue('aiDeliveryInstructions', value as string || null)}
          rows={4}
          helpText="Delivery information (areas, methods, timeframes, charges)"
        />

        <FormField
          label="Pickup / Delivery Address"
          name="aiPickupDeliveryAddress"
          type="textarea"
          value={form.watch('aiPickupDeliveryAddress') || ''}
          onChange={(value) => form.setValue('aiPickupDeliveryAddress', value as string || null)}
          rows={3}
          helpText="Your business address for pickup or delivery reference"
        />

        <FormField
          label="Tone Example"
          name="aiToneExample"
          type="textarea"
          value={form.watch('aiToneExample') || ''}
          onChange={(value) => form.setValue('aiToneExample', value as string || null)}
          rows={3}
          helpText="Example of how your AI should communicate (sample greeting or response)"
        />

        <Note variant="info">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-medium mb-1">Products are managed in Catalog</p>
              <p className="text-sm">
                Your AI automatically uses products from your{' '}
                <Link to="/catalog" className="underline font-medium hover:text-blue-900">
                  Product Catalog
                </Link>
                . No need to describe products here - the AI will use your catalog products automatically.
              </p>
            </div>
          </div>
        </Note>

        <FormField
          label="System Prompt (Legacy - Optional)"
          name="aiSystemPrompt"
          type="textarea"
          value={form.watch('aiSystemPrompt') || ''}
          onChange={(value) => form.setValue('aiSystemPrompt', value as string || null)}
          rows={4}
          helpText="Legacy field - use sections above instead. Will be used as base prompt if sections are empty."
        />

        <FormField
          label="Greeting"
          name="aiGreeting"
          type="textarea"
          value={form.watch('aiGreeting') || ''}
          onChange={(value) => form.setValue('aiGreeting', value as string || null)}
          rows={3}
          helpText="Initial greeting message"
        />

        <FormField
          label="Closing"
          name="aiClosing"
          type="textarea"
          value={form.watch('aiClosing') || ''}
          onChange={(value) => form.setValue('aiClosing', value as string || null)}
          rows={3}
          helpText="Closing message for conversations"
        />

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="ghost"
            onClick={() => form.reset()}
            disabled={isUpdatingAIConfig}
          >
            Reset
          </Button>
          <Button type="submit" disabled={isUpdatingAIConfig}>
            {isUpdatingAIConfig ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>

      <ConfirmationDialog
        open={showConfirm}
        onConfirm={form.handleSubmit(onSubmit)}
        onCancel={() => setShowConfirm(false)}
        title="Confirm AI Configuration Changes"
        message="Are you sure you want to save these AI configuration changes?"
      />
    </div>
  );
}

