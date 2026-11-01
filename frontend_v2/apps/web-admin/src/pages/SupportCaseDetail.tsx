import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge } from '@chatlogix/ui';
import {
  getCase,
  updateCaseStatus,
  addCaseNote,
  getStatusBadgeVariant,
  getStatusLabel,
  type StaffCase,
  type StaffCaseStatus,
} from '../lib/support';
import { ShopContextCard } from '../components/support/ShopContextCard';

export function SupportCaseDetail() {
  const { caseId } = useParams<{ caseId: string }>();
  const queryClient = useQueryClient();
  const [newNoteBody, setNewNoteBody] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: caseItem, isLoading, isError, refetch } = useQuery<StaffCase>({
    queryKey: ['support-case', caseId],
    queryFn: () => getCase(caseId!),
    enabled: Boolean(caseId),
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: StaffCaseStatus) => updateCaseStatus(caseId!, newStatus),
    onSuccess: (updated) => {
      setActionError(null);
      queryClient.setQueryData(['support-case', caseId], updated);
      void queryClient.invalidateQueries({ queryKey: ['support-cases'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update status.';
      setActionError(msg);
    },
  });

  const noteMutation = useMutation({
    mutationFn: (body: string) => addCaseNote(caseId!, body),
    onSuccess: () => {
      setNewNoteBody('');
      setActionError(null);
      void refetch();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to append note.';
      setActionError(msg);
    },
  });

  if (isLoading) {
    return (
      <div className="p-12 text-center text-sm text-gray-500 max-w-4xl mx-auto space-y-3">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-primary-500 border-t-transparent"></div>
        <p>Loading case details…</p>
      </div>
    );
  }

  if (isError || !caseItem) {
    return (
      <div className="max-w-2xl mx-auto p-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Case Not Found</h2>
        <p className="text-sm text-gray-500">
          The requested support case does not exist or persistence is pending schema migration.
        </p>
        <Link to="/support">
          <Button variant="ghost" className="border border-gray-300">
            &larr; Return to Cases
          </Button>
        </Link>
      </div>
    );
  }

  const currentStatus = caseItem.status;

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteBody.trim() || noteMutation.isPending) return;
    noteMutation.mutate(newNoteBody.trim());
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div>
        <Link
          to="/support"
          className="text-xs font-semibold text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 mb-2"
        >
          &larr; Back to Cases
        </Link>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                {caseItem.subject}
              </h1>
              <Badge variant={getStatusBadgeVariant(currentStatus)}>
                {getStatusLabel(currentStatus)}
              </Badge>
            </div>
            <p className="text-sm text-gray-600 mt-1 font-medium">
              Shop: {caseItem.vendor?.businessName || caseItem.vendorId}
            </p>
          </div>

          {/* Status Action Buttons */}
          <div className="flex items-center gap-2">
            {currentStatus === 'open' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => statusMutation.mutate('waiting')}
                  isLoading={statusMutation.isPending}
                  className="border border-gray-300 text-xs font-medium"
                >
                  Mark Waiting
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => statusMutation.mutate('resolved')}
                  isLoading={statusMutation.isPending}
                  className="text-xs font-medium bg-emerald-600 hover:bg-emerald-700"
                >
                  Resolve Case
                </Button>
              </>
            )}

            {currentStatus === 'waiting' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => statusMutation.mutate('open')}
                  isLoading={statusMutation.isPending}
                  className="border border-gray-300 text-xs font-medium"
                >
                  Mark Open
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => statusMutation.mutate('resolved')}
                  isLoading={statusMutation.isPending}
                  className="text-xs font-medium bg-emerald-600 hover:bg-emerald-700"
                >
                  Resolve Case
                </Button>
              </>
            )}

            {currentStatus === 'resolved' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => statusMutation.mutate('open')}
                isLoading={statusMutation.isPending}
                className="border border-gray-300 text-xs font-medium"
              >
                Reopen Case
              </Button>
            )}
          </div>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs flex items-center justify-between">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-500 font-bold ml-2"
          >
            &times;
          </button>
        </div>
      )}

      {/* 2-Column Responsive Grid: 7/12 main & 5/12 context */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Column: Notes & Timeline (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Notes History Card */}
          <Card className="p-6 border border-gray-200/80 shadow-sm bg-white">
            <h2 className="text-base font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center justify-between">
              <span>Case Notes & Timeline</span>
              <span className="text-xs font-normal text-gray-500">
                {caseItem.notes?.length || 0} note{(caseItem.notes?.length || 0) === 1 ? '' : 's'}
              </span>
            </h2>

            {/* Notes List */}
            {caseItem.notes && caseItem.notes.length > 0 ? (
              <div className="space-y-4 mb-6">
                {caseItem.notes.map((note) => {
                  const isSystem = note.authorId === 'system';
                  return (
                    <div
                      key={note.id}
                      className={`p-3.5 rounded-xl border text-sm transition-all ${
                        isSystem
                          ? 'bg-gray-50/70 border-gray-200/60 text-gray-600 italic'
                          : 'bg-white border-gray-200/90 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5 text-xs">
                        <span
                          className={`font-semibold ${
                            isSystem ? 'text-gray-500' : 'text-primary-700'
                          }`}
                        >
                          {isSystem ? 'System Event' : `Staff (${note.authorId})`}
                        </span>
                        <span className="text-gray-400 text-[11px]">
                          {new Date(note.createdAt).toLocaleDateString([], {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-gray-800 whitespace-pre-wrap leading-relaxed not-italic">
                        {note.body}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic mb-6 p-4 bg-gray-50 rounded-lg text-center">
                No notes have been added to this case yet.
              </p>
            )}

            {/* Add Note Form */}
            <form onSubmit={handleAddNote} className="space-y-3 pt-4 border-t border-gray-100">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                Add Note
              </label>
              <textarea
                rows={3}
                placeholder="Add a case note (do not paste passwords, tokens or full card numbers)..."
                value={newNoteBody}
                onChange={(e) => setNewNoteBody(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                maxLength={2000}
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">
                  {newNoteBody.length} / 2000 chars
                </span>
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  disabled={!newNoteBody.trim() || noteMutation.isPending}
                  isLoading={noteMutation.isPending}
                >
                  Add Note
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Right Column: Shop Context Card (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <ShopContextCard
            vendorId={caseItem.vendorId}
            conversationId={caseItem.conversationId}
            caseId={caseItem.id}
          />
        </div>
      </div>
    </div>
  );
}
