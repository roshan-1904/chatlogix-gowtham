import { UseFormReturn } from 'react-hook-form';
import { Button, Input } from '@chatlogix/ui';
import { CountryCodeSelector } from './CountryCodeSelector';

interface PhoneLoginFormProps {
  form: UseFormReturn<{ countryCode: string; phone: string }>;
  onSubmit: (data: { countryCode: string; phone: string }) => void;
  isLoading: boolean;
  phoneLabel?: string;
  helperText?: string;
  submitLabel?: string;
  footnote?: string;
  autoFocus?: boolean;
  labelClassName?: string;
  helperClassName?: string;
  footnoteClassName?: string;
}

export function PhoneLoginForm({
  form,
  onSubmit,
  isLoading,
  phoneLabel = 'Phone Number',
  helperText = 'Enter your 10-digit mobile number',
  submitLabel = 'Send Verification Code',
  footnote,
  autoFocus = false,
  labelClassName = 'block text-sm font-medium text-gray-700 mb-2',
  helperClassName = 'mt-2 text-xs text-gray-500',
  footnoteClassName = 'mt-3 text-center text-xs text-gray-500',
}: Readonly<PhoneLoginFormProps>) {
  const countryCode = form.watch('countryCode') || '+91';

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-6">
        <div>
          <label htmlFor="phone" className={labelClassName}>
            {phoneLabel}
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
                autoFocus={autoFocus}
              />
            </div>
          </div>
          <p className={helperClassName}>{helperText}</p>
        </div>

        <Button type="submit" disabled={isLoading} isLoading={isLoading} className="w-full" size="lg">
          {isLoading ? 'Sending...' : submitLabel}
        </Button>
      </div>

      {footnote ? (
        <p className={footnoteClassName}>{footnote}</p>
      ) : null}
    </form>
  );
}
