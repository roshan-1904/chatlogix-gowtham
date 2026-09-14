import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Badge, Button } from '@chatlogix/ui';
import {
  getCustomerQuery,
  getPromotionDraft,
  promoteCustomerQuery,
  replyToCustomerQuery,
} from '../lib/customerQueries';
import { notifyCustomerQueriesChanged } from '../hooks/queries/useCustomerQueries';
import type { CustomerQueryDetail } from '../types/customerQuery';

export function QueryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [query, setQuery] = useState<CustomerQueryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [draftQuestion, setDraftQuestion] = useState('');
  const [draftAnswer, setDraftAnswer] = useState('');
  const [suggestedAction, setSuggestedAction] = useState<'faq' | 'catalog' | 'dismiss'>('faq');
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    getCustomerQuery(id)
      .then(async (detail) => {
        if (cancelled) return;
        setQuery(detail);
        if (detail.status === 'answered') {
          try {
            const draft = await getPromotionDraft(id);
            if (!cancelled) {
              setDraftQuestion(draft.question);
              setDraftAnswer(draft.answer);
              setSuggestedAction(draft.suggestedAction);
            }
          } catch {
            setDraftQuestion(detail.questionEn);
            setDraftAnswer(detail.vendorAnswerEn || detail.vendorAnswerOriginal || '');
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load query');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleReply = async () => {
    if (!id || !reply.trim() || sending) return;
    setSending(true);
    try {
      await replyToCustomerQuery(id, reply.trim());
      toast.success('Reply sent. Save this as an FAQ from Queries when you are ready.');
      notifyCustomerQueriesChanged();
      setReply('');
      const detail = await getCustomerQuery(id);
      setQuery(detail);
      if (detail.status === 'answered') {
        try {
          const draft = await getPromotionDraft(id);
          setDraftQuestion(draft.question);
          setDraftAnswer(draft.answer);
          setSuggestedAction(draft.suggestedAction);
        } catch {
          setDraftQuestion(detail.questionEn);
          setDraftAnswer(detail.vendorAnswerEn || detail.vendorAnswerOriginal || '');
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const handleSaveAsFaq = async () => {
    if (!id) return;
    setPromoting(true);
    try {
      await promoteCustomerQuery(id, {
        action: 'faq',
        question: draftQuestion,
        answer: draftAnswer,
      });
      toast.success('Saved as an English FAQ');
      notifyCustomerQueriesChanged();
      setQuery(await getCustomerQuery(id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save FAQ');
    } finally {
      setPromoting(false);
    }
  };

  const handleCatalogFix = async () => {
    if (!id || !query) return;
    setPromoting(true);
    try {
      const result = await promoteCustomerQuery(id, {
        action: 'catalog',
        productId: query.productId,
      });
      toast.success('Open the product to add English variants');
      notifyCustomerQueriesChanged();
      void navigate(result.editPath || '/catalog');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start catalog fix');
    } finally {
      setPromoting(false);
    }
  };

  const handleDismiss = async () => {
    if (!id) return;
    setPromoting(true);
    try {
      await promoteCustomerQuery(id, { action: 'dismiss', dismissReason: 'one_off' });
      toast.success('Query dismissed');
      notifyCustomerQueriesChanged();
      setQuery(await getCustomerQuery(id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not dismiss');
    } finally {
      setPromoting(false);
    }
  };

  if (loading) {
    return <div className="p-1 h-24 bg-gray-200 animate-pulse rounded" />;
  }

  if (error || !query) {
    return (
      <div className="p-1 space-y-4">
        <p className="text-red-700">{error || 'Query not found.'}</p>
        <Button variant="ghost" onClick={() => void navigate('/queries')}>
          Back to Queries
        </Button>
      </div>
    );
  }

  return (
    <div className="p-1 space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => void navigate('/queries')} className="text-sm text-primary-500 mb-2">
            ← Queries
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{query.questionEn}</h1>
          {query.questionOriginal !== query.questionEn && (
            <p className="text-sm text-gray-500 mt-1">{query.questionOriginal}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Badge variant={query.status === 'open' ? 'warning' : 'info'}>{query.status.replace(/_/g, ' ')}</Badge>
            <Badge>{query.category}</Badge>
            {query.hitCount > 1 && <Badge variant="secondary">Asked {query.hitCount} times</Badge>}
          </div>
        </div>
        <Link
          to={`/conversations?conversationId=${query.conversationId}&queryId=${query.id}`}
          className="text-sm text-primary-500 hover:underline shrink-0"
        >
          Open chat
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
        <p className="text-sm font-medium text-gray-700">
          {query.customerName || query.customerPhone}
          {query.customerName && <span className="text-gray-500 font-normal"> · {query.customerPhone}</span>}
        </p>
        <div className="space-y-2">
          {query.messages.map((message) => (
            <p key={message.id} className="text-sm text-gray-700">
              <span className="font-medium capitalize">{message.senderType}: </span>
              {message.content}
            </p>
          ))}
        </div>
      </div>

      {query.vendorAnswerOriginal && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs uppercase text-gray-500 mb-1">Your reply</p>
          <p className="text-sm text-gray-900">{query.vendorAnswerOriginal}</p>
        </div>
      )}

      {query.status === 'answered' && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Save this for the next customer</h2>
            <p className="text-xs text-gray-500 mt-1">
              Suggested: {suggestedAction === 'catalog' ? 'update the product' : suggestedAction === 'dismiss' ? 'dismiss' : 'save as FAQ'}.
              FAQ text is stored in English.
            </p>
          </div>
          <div>
            <label htmlFor="promo-q" className="block text-sm font-medium text-gray-700 mb-1">
              FAQ question
            </label>
            <input
              id="promo-q"
              value={draftQuestion}
              onChange={(event) => setDraftQuestion(event.target.value)}
              maxLength={300}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="promo-a" className="block text-sm font-medium text-gray-700 mb-1">
              FAQ answer
            </label>
            <textarea
              id="promo-a"
              value={draftAnswer}
              onChange={(event) => setDraftAnswer(event.target.value)}
              maxLength={1500}
              rows={4}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button isLoading={promoting} onClick={() => void handleSaveAsFaq()}>
              Save as FAQ
            </Button>
            <Button variant="secondary" disabled={promoting} onClick={() => void handleCatalogFix()}>
              Update product
            </Button>
            <Button variant="ghost" disabled={promoting} onClick={() => void handleDismiss()}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {query.status === 'open' && (
        <div className="space-y-3">
          <label htmlFor="query-reply" className="text-sm font-medium text-gray-700">
            Reply to customer on WhatsApp
          </label>
          <textarea
            id="query-reply"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={4}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            placeholder="Type the answer in the customer's language or English."
          />
          <Button onClick={() => void handleReply()} disabled={!reply.trim()} isLoading={sending}>
            Send reply
          </Button>
        </div>
      )}
    </div>
  );
}
