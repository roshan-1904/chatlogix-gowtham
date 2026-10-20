import { Link } from 'react-router-dom';

export type PayChoice = 'razorpay' | 'gpay' | 'cash';

export interface PayChoiceOption {
  id: PayChoice;
  title: string;
  description: string;
  disabled: boolean;
  disabledReason?: string;
  /** When set, the disabled reason links to payment settings. Omit while settings are still loading. */
  linkToSettings?: boolean;
}

interface CollectPaymentChoicesProps {
  name: string;
  value: PayChoice;
  options: PayChoiceOption[];
  onChange: (id: PayChoice) => void;
}

export function CollectPaymentChoices({ name, value, options, onChange }: CollectPaymentChoicesProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">How the customer pays</legend>
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <label
            key={option.id}
            className={`block rounded-lg border px-3 py-2.5 ${
              selected ? 'border-primary-500' : 'border-gray-200'
            } ${option.disabled ? 'cursor-not-allowed bg-gray-50' : 'cursor-pointer bg-white'}`}
          >
            <span className="flex items-start gap-3">
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={selected}
                disabled={option.disabled}
                onChange={() => onChange(option.id)}
                className="mt-1 accent-primary-500"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900">{option.title}</span>
                <span className="mt-0.5 block text-xs text-gray-500">{option.description}</span>
                {option.disabled && option.disabledReason && (
                  <span className="mt-1 block text-xs text-gray-500">
                    {option.disabledReason}
                    {option.linkToSettings && (
                      <>
                        {' '}
                        <Link
                          to="/settings?tab=payments"
                          className="font-medium text-primary-500 hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          Payment settings
                        </Link>
                      </>
                    )}
                  </span>
                )}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
