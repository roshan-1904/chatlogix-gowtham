import { Card } from '@chatlogix/ui';

export function WhatsAppConnectGuidePanel() {
  return (
    <Card className="sticky top-4 rounded-xl p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-primary-500">Before you connect</h2>
      <ul className="mt-3 space-y-3 text-xs text-gray-600 sm:text-sm">
        <li>
          <span className="font-medium text-gray-800">Wallet billing</span>
          <p className="mt-0.5">
            Customer messages are charged from your ChatLogix wallet. You do not pay Meta separately for each reply.
          </p>
        </li>
        <li>
          <span className="font-medium text-gray-800">Pop-ups</span>
          <p className="mt-0.5">Allow pop-ups in this browser so the Meta sign-in window can open.</p>
        </li>
        <li>
          <span className="font-medium text-gray-800">OTP</span>
          <p className="mt-0.5">Keep your phone nearby — Meta may send a verification code.</p>
        </li>
        <li>
          <span className="font-medium text-gray-800">Shop number</span>
          <p className="mt-0.5">
            Use the number customers will message, not the phone you use to log in to ChatLogix.
          </p>
        </li>
      </ul>
      <p className="mt-4 text-[11px] text-gray-400">
        See the WhatsApp Connect guide in product docs for coexistence vs Cloud API paths.
      </p>
    </Card>
  );
}
