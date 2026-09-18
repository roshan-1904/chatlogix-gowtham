import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card } from '@chatlogix/ui';
import type { WhatsAppStatus } from '../../lib/whatsappConnect';

function statusBadgeVariant(
  status: WhatsAppStatus['connectStatus']
): 'success' | 'warning' | 'info' | 'default' {
  switch (status) {
    case 'live':
      return 'success';
    case 'error':
      return 'warning';
    case 'meta_in_progress':
    case 'credit_attached':
      return 'info';
    case null:
    case 'not_started':
    case 'disconnected':
    default:
      return 'default';
  }
}

function statusLabel(status: WhatsAppStatus['connectStatus']): string {
  switch (status) {
    case 'live':
      return 'Live';
    case 'credit_attached':
      return 'Billing linked';
    case 'meta_in_progress':
      return 'In progress';
    case 'error':
      return 'Error';
    case 'not_started':
      return 'Not started';
    case 'disconnected':
      return 'Disconnected';
    case null:
      return 'Unknown';
    default:
      return 'Unknown';
  }
}

interface ConnectStatusPanelProps {
  status: WhatsAppStatus;
  onConnectAgain: () => void;
  onRetryBilling: () => void;
  isRetryingBilling: boolean;
}

export function ConnectStatusPanel({
  status,
  onConnectAgain,
  onRetryBilling,
  isRetryingBilling,
}: ConnectStatusPanelProps) {
  const navigate = useNavigate();

  return (
    <Card className="space-y-4 rounded-xl p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusBadgeVariant(status.connectStatus)}>{statusLabel(status.connectStatus)}</Badge>
        {!status.walletCanReply && status.connectStatus !== 'not_started' && (
          <span className="text-xs text-amber-700">Wallet balance required for replies</span>
        )}
      </div>

      {status.displayPhone && (
        <div>
          <div className="text-xs text-gray-500">Your shop number</div>
          <div className="text-lg font-semibold text-gray-900">{status.displayPhone}</div>
          {status.displayName && <div className="text-sm text-gray-600">{status.displayName}</div>}
        </div>
      )}

      {status.connectStatus === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {status.lastErrorMessage ?? 'Something went wrong. Try again.'}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={onConnectAgain}>
              Connect again
            </Button>
            {status.lastErrorCode === 'credit_attach_failed' && (
              <Button
                size="sm"
                variant="primary"
                onClick={onRetryBilling}
                isLoading={isRetryingBilling}
              >
                Retry billing link
              </Button>
            )}
          </div>
        </div>
      )}

      {status.waMeLink && status.connectStatus !== 'live' && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm text-gray-700">Send &quot;Hi&quot; from another phone to test:</p>
          <a
            href={status.waMeLink}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block break-all text-sm font-medium text-primary-500"
          >
            {status.waMeLink}
          </a>
          {!status.testInboundAt && (
            <p className="mt-2 text-xs text-gray-500">Waiting for your test message…</p>
          )}
          {status.testInboundAt && !status.walletCanReply && (
            <p className="mt-2 text-xs text-amber-700">
              Message received.{' '}
              <Link to="/wallet" className="font-medium underline">
                Add wallet balance
              </Link>{' '}
              for the assistant to reply.
            </p>
          )}
        </div>
      )}

      {status.connectStatus === 'live' && (
        <div className="rounded-lg border border-secondary-500/30 bg-secondary-500/10 p-3 text-sm text-primary-500">
          Customers can message you and the assistant can reply when your wallet has balance.
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void navigate('/dashboard')}>
            Back to dashboard
          </Button>
        </div>
      )}

      {status.mockAttachSkipped && (
        <p className="text-xs text-gray-400">Dev: billing attach skipped (mock).</p>
      )}
    </Card>
  );
}
