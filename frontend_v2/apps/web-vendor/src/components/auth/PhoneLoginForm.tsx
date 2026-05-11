import { UseFormReturn } from 'react-hook-form';
import { Button, Input } from '@chatlogix/ui';
import ReCAPTCHA from 'react-google-recaptcha';
import { CountryCodeSelector } from './CountryCodeSelector';

interface PhoneLoginFormProps {
  form: UseFormReturn<{ countryCode: string; phone: string }>;
  onSubmit: (data: { countryCode: string; phone: string }) => void;
  isLoading: boolean;
  recaptchaRef: React.RefObject<ReCAPTCHA>;
  recaptchaSiteKey: string;
  onRecaptchaError: (error: Error) => void;
}

export function PhoneLoginForm({
  form,
  onSubmit,
  isLoading,
  recaptchaRef,
  recaptchaSiteKey,
  onRecaptchaError,
}: Readonly<PhoneLoginFormProps>) {
  const countryCode = form.watch('countryCode') || '+91';

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
          Phone Number
        </label>
        <div className="flex gap-2 items-stretch">
          <div className="flex-shrink-0">
            <CountryCodeSelector
              value={countryCode}
              onChange={value => form.setValue('countryCode', value)}
              disabled={isLoading}
            />
          </div>
          <div className="flex-1 min-w-0">
            <Input
              {...form.register('phone')}
              type="tel"
              id="phone"
              placeholder="12345 67890"
              disabled={isLoading}
              error={form.formState.errors.phone?.message}
              className="w-full h-[42px]"
              maxLength={10}
              inputMode="numeric"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Enter your 10-digit mobile number
        </p>
      </div>

      {recaptchaSiteKey && (
        <div className="hidden">
          <ReCAPTCHA
            ref={recaptchaRef}
            sitekey={recaptchaSiteKey}
            size="invisible"
            onError={onRecaptchaError}
          />
        </div>
      )}

      <Button type="submit" disabled={isLoading} isLoading={isLoading} className="w-full" size="lg">
        {isLoading ? 'Sending...' : 'Send Verification Code'}
      </Button>
    </form>
  );
}

