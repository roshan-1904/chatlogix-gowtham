import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Button } from '@chatlogix/ui';
import { useVendorSettings } from '../../../hooks/settings/useVendorSettings';
import { businessInfoSchema, type BusinessInfoFormData } from '../../../lib/validation/settingsSchemas';
import { FormField } from '../FormField';
import { ConfirmationDialog } from '../ConfirmationDialog';
import { Note } from '../Note';
import { sendPhoneVerification, confirmPhoneVerification } from '../../../api/settings';
import type { PhoneVerificationSendRequest } from '../../../types/settings';

interface AccountBusinessTabProps {
  vendorId: string;
}

export function AccountBusinessTab({ vendorId }: AccountBusinessTabProps) {
  const {
    businessInfo,
    isLoadingBusinessInfo,
    updateBusinessInfo,
    isUpdatingBusinessInfo,
  } = useVendorSettings();

  const [showConfirm, setShowConfirm] = useState(false);
  const [phoneVerificationStep, setPhoneVerificationStep] = useState<'none' | 'send' | 'verify'>('none');
  const [phoneSessionInfo, setPhoneSessionInfo] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');

  const form = useForm<BusinessInfoFormData>({
    resolver: zodResolver(businessInfoSchema),
    defaultValues: {
      businessName: businessInfo?.businessName || '',
      phone: businessInfo?.phone || '',
      email: businessInfo?.email || '',
      category: businessInfo?.category || null,
    },
  });

  // Update form when data loads
  useEffect(() => {
    if (businessInfo) {
      form.reset({
        businessName: businessInfo.businessName,
        phone: businessInfo.phone,
        email: businessInfo.email,
        category: businessInfo.category,
      });
    }
  }, [businessInfo, form]);

  const handlePhoneChange = async () => {
    const newPhone = form.getValues('phone');
    if (newPhone === businessInfo?.phone) {
      return; // No change
    }

    try {
      const request: PhoneVerificationSendRequest = { newPhoneNumber: newPhone };
      const response = await sendPhoneVerification(vendorId, request);
      setPhoneSessionInfo(response.sessionInfo);
      setPhoneVerificationStep('verify');
      toast.success('Verification code sent to your phone');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send verification code');
    }
  };

  const handlePhoneVerify = async () => {
    if (!phoneSessionInfo) return;

    try {
      await confirmPhoneVerification(vendorId, {
        sessionInfo: phoneSessionInfo,
        code: verificationCode,
      });
      setPhoneVerificationStep('none');
      setVerificationCode('');
      toast.success('Phone number verified');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid verification code');
    }
  };

  const onSubmit = async (data: BusinessInfoFormData) => {
    try {
      // Check if phone changed and needs verification
      if (data.phone !== businessInfo?.phone && phoneVerificationStep !== 'none') {
        toast.error('Please verify your new phone number first');
        return;
      }

      await updateBusinessInfo(data);
      toast.success('Business information updated successfully');
      setShowConfirm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update business information');
    }
  };

  if (isLoadingBusinessInfo) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Account & Business Information</h2>
        <p className="text-sm text-gray-600 mt-1">
          Update your business details and contact information
        </p>
      </div>

      <form onSubmit={form.handleSubmit(() => setShowConfirm(true))} className="space-y-6">
        <FormField
          label="Business Name"
          name="businessName"
          type="text"
          value={form.watch('businessName')}
          onChange={(value) => form.setValue('businessName', value as string)}
          onBlur={() => form.trigger('businessName')}
          error={form.formState.errors.businessName?.message}
          required
          helpText="Your business name as it appears to customers"
        />

        <div className="space-y-2">
          <FormField
            label="Phone Number"
            name="phone"
            type="tel"
            value={form.watch('phone')}
            onChange={(value) => {
              form.setValue('phone', value as string);
              if (value !== businessInfo?.phone) {
                setPhoneVerificationStep('send');
              }
            }}
            onBlur={() => form.trigger('phone')}
            error={form.formState.errors.phone?.message}
            required
            helpText="Phone number in E.164 format (e.g., +1234567890)"
          />
          {phoneVerificationStep === 'send' && (
            <div className="flex gap-2">
              <Button type="button" onClick={handlePhoneChange} variant="ghost" size="sm">
                Send Verification Code
              </Button>
            </div>
          )}
          {phoneVerificationStep === 'verify' && (
            <div className="space-y-2 p-3 bg-blue-50 rounded-lg">
              <Note variant="info">
                Enter the verification code sent to your phone
              </Note>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Enter code"
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  maxLength={10}
                />
                <Button type="button" onClick={handlePhoneVerify} size="sm">
                  Verify
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setPhoneVerificationStep('none');
                    setVerificationCode('');
                  }}
                  variant="ghost"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <FormField
          label="Email"
          name="email"
          type="email"
          value={form.watch('email')}
          onChange={(value) => form.setValue('email', value as string)}
          onBlur={() => form.trigger('email')}
          error={form.formState.errors.email?.message}
          required
          helpText="Email address for account notifications"
        />

        <FormField
          label="Category"
          name="category"
          type="text"
          value={form.watch('category') || ''}
          onChange={(value) => form.setValue('category', value as string || null)}
          helpText="Business category (e.g., Food, Retail, Service)"
        />

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="ghost"
            onClick={() => form.reset()}
            disabled={isUpdatingBusinessInfo}
          >
            Reset
          </Button>
          <Button type="submit" disabled={isUpdatingBusinessInfo}>
            {isUpdatingBusinessInfo ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>

      <ConfirmationDialog
        open={showConfirm}
        onConfirm={form.handleSubmit(onSubmit)}
        onCancel={() => setShowConfirm(false)}
        title="Confirm Changes"
        message="Are you sure you want to save these changes?"
      />
    </div>
  );
}

