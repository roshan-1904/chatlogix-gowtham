import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Button } from '@chatlogix/ui';
import { getShopContext, type ShopContext } from '../../lib/support';

interface ShopContextCardProps {
  vendorId: string;
  conversationId?: string | null;
  caseId?: string;
}

export function ShopContextCard({ vendorId, conversationId, caseId }: ShopContextCardProps) {
  const { data, isLoading, isError } = useQuery<ShopContext>({
    queryKey: ['shop-context', vendorId],
    queryFn: () => getShopContext(vendorId),
    enabled: Boolean(vendorId),
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-10 bg-gray-100 rounded"></div>
          <div className="h-10 bg-gray-100 rounded"></div>
          <div className="h-10 bg-gray-100 rounded"></div>
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="p-6 text-center text-sm text-gray-500">
        <p className="text-red-600 mb-2 font-medium">Could not load shop context.</p>
        <p className="text-xs text-gray-400">Verify vendor ID and database connection.</p>
      </Card>
    );
  }

  const { vendor, whatsapp, lastFailure, openQuestions } = data;
  const balanceRupees = (vendor.walletBalanceMilli / 1000).toFixed(2);
  const isLowBalance = vendor.walletBalanceMilli < 20000; // < ₹20

  return (
    <Card className="p-0 overflow-hidden border border-gray-200/80 shadow-sm">
      <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/70 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600">
          Shop Context
        </h3>
        <span className="text-xs text-gray-500 font-medium truncate max-w-[160px]">
          {vendor.businessName}
        </span>
      </div>

      <div className="p-5 space-y-5 text-sm">
        {/* Wallet & Markup Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
              Wallet Balance
            </span>
            <div className="flex items-baseline gap-1">
              <span
                className={`text-lg font-bold ${
                  isLowBalance ? 'text-amber-600' : 'text-gray-900'
                }`}
              >
                ₹{balanceRupees}
              </span>
              {isLowBalance && (
                <span className="text-[10px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded font-medium">
                  Low
                </span>
              )}
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
              Markup
            </span>
            <span className="text-lg font-bold text-gray-900">
              {vendor.markupPercent}%
            </span>
          </div>
        </div>

        {/* WhatsApp Connection */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1.5">
            WhatsApp Status
          </span>
          {whatsapp ? (
            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-100">
              <span className="font-mono text-xs text-gray-700 font-medium">
                {whatsapp.phoneNumber}
              </span>
              <Badge variant={whatsapp.connectStatus === 'live' ? 'success' : 'warning'}>
                {whatsapp.connectStatus}
              </Badge>
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic p-2 bg-gray-50 rounded border border-gray-100">
              This shop has no WhatsApp number yet.
            </p>
          )}
        </div>

        {/* Last Failure */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1.5">
            Last Failed Reply
          </span>
          {lastFailure ? (
            <div className="p-3 bg-rose-50/50 rounded-lg border border-rose-200/60 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-rose-800 truncate max-w-[180px]">
                  {lastFailure.failureReason}
                </span>
                <span className="text-[10px] text-gray-500">
                  {new Date(lastFailure.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {lastFailure.preview && (
                <p className="text-gray-600 line-clamp-2 italic">
                  &ldquo;{lastFailure.preview}&rdquo;
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic p-2 bg-gray-50 rounded border border-gray-100">
              No failed reply stored for this shop.
            </p>
          )}
        </div>

        {/* Open Questions */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Open Customer Questions
            </span>
            <span className="text-xs font-semibold text-gray-600">
              {openQuestions.length}
            </span>
          </div>

          {openQuestions.length > 0 ? (
            <ul className="space-y-1.5">
              {openQuestions.map((q) => (
                <li
                  key={q.id}
                  className="p-2 bg-gray-50 rounded text-xs border border-gray-100 flex items-start justify-between gap-2"
                >
                  <span className="text-gray-800 line-clamp-1 flex-1 font-medium">
                    {q.questionEn}
                  </span>
                  <span className="text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded font-mono">
                    {q.hitCount} hits
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500 italic p-2 bg-gray-50 rounded border border-gray-100">
              This shop has no open customer questions.
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="pt-2 border-t border-gray-100 flex flex-col gap-2">
          {conversationId && (
            <Link
              to={`/support/conversations/${conversationId}${caseId ? `?caseId=${caseId}` : ''}`}
            >
              <Button
                variant="primary"
                size="sm"
                className="w-full justify-center shadow-sm"
              >
                Read Conversation Transcript
              </Button>
            </Link>
          )}

          <Link to={`/vendors`}>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center border border-gray-300 text-xs font-medium"
            >
              Adjust Shop Wallet
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
