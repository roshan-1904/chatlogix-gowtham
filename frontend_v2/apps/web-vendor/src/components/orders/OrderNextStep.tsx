import { Button, Card } from '@chatlogix/ui';
import { statusLabels } from '../../utils/orderConstants';
import { canCancelOrder, detailFulfillmentStep } from '../../utils/orderPayment';

interface OrderNextStepProps {
  status: string;
  busy: boolean;
  onAdvance: (nextStatus: string) => void;
  onCancel: () => void;
}

export function OrderNextStep({ status, busy, onAdvance, onCancel }: OrderNextStepProps) {
  const step = detailFulfillmentStep(status);
  const cancellable = canCancelOrder(status);

  return (
    <Card title="Next step" className="!p-3 sm:!p-4">
      {step ? (
        <Button
          variant="primary"
          className="w-full"
          disabled={busy}
          isLoading={busy}
          onClick={() => onAdvance(step.nextStatus)}
        >
          {step.label}
        </Button>
      ) : (
        <p className="text-sm text-gray-600">
          {status === 'awaiting_payment'
            ? 'Collect the full amount in the payment panel.'
            : statusLabels[status] || status}
        </p>
      )}
      {cancellable && (
        <button
          type="button"
          className="mt-3 w-full text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel order
        </button>
      )}
    </Card>
  );
}
