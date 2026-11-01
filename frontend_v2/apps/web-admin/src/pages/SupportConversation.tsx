import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Button } from '@chatlogix/ui';
import { getAuditedConversation, type AuditedConversation } from '../lib/support';

export function SupportConversation() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [searchParams] = useSearchParams();
  const caseId = searchParams.get('caseId');

  const { data, isLoading, isError, error, refetch } = useQuery<AuditedConversation>({
    queryKey: ['audited-conversation', conversationId, caseId],
    queryFn: () => getAuditedConversation(conversationId!, caseId || undefined),
    enabled: Boolean(conversationId),
    retry: false, // Do not spam retries on fail-closed audit errors
  });

  const backUrl = caseId ? `/support/${caseId}` : '/support';
  const backLabel = caseId ? '← Back to Case' : '← Back to Support';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header & Back link */}
      <div>
        <Link
          to={backUrl}
          className="text-xs font-semibold text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 mb-2"
        >
          {backLabel}
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Customer Conversation Transcript
            </h1>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              Conversation ID: {conversationId}
            </p>
          </div>
          {data && (
            <div className="text-right">
              <span className="text-sm font-bold text-gray-900 block">
                {data.vendor.businessName}
              </span>
              <span className="text-xs font-mono text-gray-500">
                Customer: {data.customer.phone}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Security & Audit Notice */}
      <div className="p-4 bg-blue-50/80 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-start gap-3 shadow-2xs">
        <span className="text-lg">🛡️</span>
        <div className="flex-1 space-y-1">
          <h4 className="font-bold text-blue-950">
            Audited Conversation Read (Action: <code>conversation_read</code>)
          </h4>
          <p className="leading-relaxed text-blue-800">
            This read action has been verified and recorded into <code>StaffAuditLog</code> with your staff ID and timestamp.
            Per ChatLogix data protection policy, customer chat content contains PII and must <strong>never</strong> be screenshotted,
            exported, or pasted into public channels or ticket trackers.
          </p>
        </div>
      </div>

      {/* Main Conversation Stream */}
      {isLoading ? (
        <Card className="p-12 text-center text-sm text-gray-500 space-y-3 bg-white">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-primary-500 border-t-transparent"></div>
          <p>Loading the conversation…</p>
        </Card>
      ) : isError ? (
        <Card className="p-8 bg-red-50/60 border border-red-200 text-center space-y-4">
          <span className="text-3xl block">🔒</span>
          <div>
            <h3 className="text-base font-bold text-red-900">
              Could not record this read. The conversation was not opened.
            </h3>
            <p className="text-xs text-red-700 mt-1 max-w-md mx-auto">
              {(error as any)?.response?.data?.message ||
                'Audit logging failed or StaffAuditLog schema migration is pending. In accordance with security protocol, conversation content is blocked.'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            className="border border-red-300 text-red-800 hover:bg-red-100"
          >
            Retry Verification
          </Button>
        </Card>
      ) : !data || data.messages.length === 0 ? (
        <Card className="p-12 text-center text-sm text-gray-400 bg-white">
          <p>No messages recorded in this conversation yet.</p>
        </Card>
      ) : (
        <Card className="p-6 border border-gray-200/80 shadow-sm bg-gray-50/40">
          <ul role="list" className="space-y-4">
            {data.messages.map((msg) => {
              const isCustomer = msg.senderType === 'customer';
              const isFailed = msg.status === 'failed';

              return (
                <li
                  key={msg.id}
                  role="listitem"
                  className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                >
                  {/* Sender & Timestamp */}
                  <div className="flex items-center gap-2 mb-1 text-[11px] text-gray-500 px-1">
                    <span className="font-semibold capitalize text-gray-700">
                      {msg.senderType}
                    </span>
                    <span>•</span>
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {msg.status && !isCustomer && (
                      <Badge variant={isFailed ? 'warning' : 'default'} className="text-[10px] py-0">
                        {msg.status}
                      </Badge>
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`max-w-lg p-3.5 rounded-2xl text-sm leading-relaxed ${
                      isCustomer
                        ? 'bg-white text-gray-900 border border-gray-200 shadow-2xs rounded-tl-sm'
                        : isFailed
                        ? 'bg-rose-50 text-rose-950 border border-rose-300 rounded-tr-sm'
                        : 'bg-primary-50 text-gray-900 border border-primary-200/70 rounded-tr-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* Secondary English Translation if available */}
                    {msg.contentEn && msg.contentEn !== msg.content && (
                      <div className="mt-2 pt-2 border-t border-gray-200/50 text-xs text-gray-500 italic">
                        <span className="font-bold not-italic text-[10px] uppercase text-gray-400 block">
                          English Translation:
                        </span>
                        {msg.contentEn}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
