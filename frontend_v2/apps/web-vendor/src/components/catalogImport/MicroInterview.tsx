import { useState } from 'react';
import type { AIConfigSections } from '../../types/catalogImport';
import { Button } from '@chatlogix/ui';

interface Props {
  readonly initial?: AIConfigSections;
  readonly onChange: (cfg: AIConfigSections) => void;
}

/**
 * Five-question interview. The answers write straight into an AIConfigSections
 * draft that ships with the commit request if the vendor chooses to apply it.
 */
export function MicroInterview({ initial, onChange }: Readonly<Props>) {
  const [state, setState] = useState<AIConfigSections>(initial ?? {});

  const patch = (p: Partial<AIConfigSections>) => {
    const next = { ...state, ...p };
    setState(next);
    onChange(next);
  };

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800">Quick interview</h3>
      <p className="text-xs text-gray-500">
        Five questions so your AI can greet and close conversations on-brand.
      </p>

      <Field
        label="How should the bot greet customers?"
        value={state.greetingStyle ?? ''}
        onChange={(v) => patch({ greetingStyle: v })}
        placeholder="Hi! Welcome to Bella's Bakery — how can we help today?"
      />
      <Field
        label="What hours are you open?"
        value={state.businessHours ?? ''}
        onChange={(v) => patch({ businessHours: v })}
        placeholder="Mon-Sat 9am-9pm, Sun closed"
      />
      <Field
        label="Delivery policy (areas, fees, minimum order)"
        value={state.deliveryInformation ?? ''}
        onChange={(v) => patch({ deliveryInformation: v })}
        placeholder="Free delivery within 3 km for orders above ₹500"
      />
      <Field
        label="Payment options"
        value={state.paymentInformation ?? ''}
        onChange={(v) => patch({ paymentInformation: v })}
        placeholder="UPI, cash on delivery"
      />
      <Field
        label="Anything else we must tell customers?"
        value={state.specialInstructions ?? ''}
        onChange={(v) => patch({ specialInstructions: v })}
        placeholder="All cakes are eggless by default"
      />

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => patch({})}>
          Skip — I&apos;ll fill this later
        </Button>
      </div>
    </div>
  );
}

interface FieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly placeholder?: string;
}

function Field({ label, value, onChange, placeholder }: Readonly<FieldProps>) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      <textarea
        rows={2}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
