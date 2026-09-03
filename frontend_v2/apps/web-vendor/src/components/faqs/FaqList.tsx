/**
 * FAQ list — a simple table (question, answer preview, active status, actions).
 * FAQ counts are expected to stay small per vendor, so no pagination.
 */

import { Badge, Button } from '@chatlogix/ui';
import type { Faq } from '../../types/faq';

interface FaqListProps {
  faqs: Faq[];
  loading?: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function FaqList({ faqs, loading = false, onEdit, onDelete }: FaqListProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-200 animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (faqs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-sm">No FAQs yet.</p>
        <p className="text-xs mt-1">Add one so the AI can answer common customer questions automatically.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-3">Question</th>
            <th className="px-4 py-3">Answer</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {faqs.map((faq) => (
            <tr key={faq.id} className="border-t border-gray-200 hover:bg-gray-50">
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onEdit(faq.id)}
                  className="font-medium text-gray-900 hover:text-primary-500 text-left"
                >
                  {faq.question}
                </button>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">{truncate(faq.answer, 80)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <Badge variant={faq.isActive ? 'success' : 'secondary'}>
                    {faq.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  {faq.embeddingPending && (
                    <Badge variant="warning" className="w-fit">
                      AI matching pending
                    </Badge>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(faq.id)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(faq.id)}>
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
