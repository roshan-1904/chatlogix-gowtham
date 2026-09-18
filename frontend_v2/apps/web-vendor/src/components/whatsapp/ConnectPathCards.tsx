import type { WhatsAppConnectPath } from '../../lib/whatsappConnect';

interface ConnectPathCardsProps {
  selected: WhatsAppConnectPath | null;
  onSelect: (path: WhatsAppConnectPath) => void;
  onPersonalWhatsApp: () => void;
  personalBlocked: boolean;
}

export function ConnectPathCards({
  selected,
  onSelect,
  onPersonalWhatsApp,
  personalBlocked,
}: ConnectPathCardsProps) {
  const cardBase =
    'w-full rounded-xl border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/30';

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-800">
        Is this number already logged into WhatsApp Business App (the green one)?
      </p>
      <div className="grid gap-2">
        <button
          type="button"
          className={`${cardBase} ${
            selected === 'coexistence'
              ? 'border-secondary-500 bg-secondary-500/5'
              : 'border-gray-200 hover:border-primary-500/20'
          }`}
          onClick={() => onSelect('coexistence')}
        >
          <p className="text-sm font-semibold text-primary-500">Yes — I use the Business App</p>
          <p className="mt-1 text-xs text-gray-500">Coexistence: keep the app and connect to ChatLogix.</p>
        </button>
        <button
          type="button"
          className={`${cardBase} ${
            selected === 'cloud'
              ? 'border-secondary-500 bg-secondary-500/5'
              : 'border-gray-200 hover:border-primary-500/20'
          }`}
          onClick={() => onSelect('cloud')}
        >
          <p className="text-sm font-semibold text-primary-500">No — new SIM or not on Business App yet</p>
          <p className="mt-1 text-xs text-gray-500">Cloud API setup for a fresh or migrated number.</p>
        </button>
        <button
          type="button"
          className="w-full rounded-lg px-2 py-2 text-left text-xs font-medium text-gray-500 underline-offset-2 hover:text-primary-500 hover:underline"
          onClick={onPersonalWhatsApp}
        >
          It&apos;s on personal WhatsApp (blue icon)
        </button>
      </div>
      {personalBlocked && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Personal WhatsApp can&apos;t be used until you move the number. Use another SIM, wait after deleting
          personal WhatsApp, or switch to the Business App and choose &quot;Yes&quot; above.
        </p>
      )}
    </div>
  );
}
