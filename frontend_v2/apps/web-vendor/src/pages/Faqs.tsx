/**
 * FAQs list page
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '@chatlogix/ui';
import { useFaqs } from '../hooks/faqs/useFaqs';
import { FaqList } from '../components/faqs/FaqList';

export function Faqs() {
  const navigate = useNavigate();
  const { faqs, loading, error, deleteFaqById } = useFaqs();
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; question: string } | null>(null);

  const handleEdit = (id: string) => {
    navigate(`/faqs/${id}/edit`);
  };

  const handleDelete = (id: string) => {
    const faq = faqs.find((f) => f.id === id);
    if (faq) {
      setDeleteConfirm({ id, question: faq.question });
    }
  };

  const confirmDelete = async () => {
    if (deleteConfirm) {
      try {
        await deleteFaqById(deleteConfirm.id);
        setDeleteConfirm(null);
      } catch (err) {
        console.error('Failed to delete FAQ:', err);
        alert('Failed to delete FAQ. Please try again.');
      }
    }
  };

  return (
    <div className="p-1 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">FAQs</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Answers the AI can use when a customer asks something similar on WhatsApp.
          </p>
        </div>
        <Button onClick={() => navigate('/faqs/new')} className="w-full sm:w-auto">
          Add FAQ
        </Button>
      </div>

      {error && (
        <div className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg text-sm sm:text-base text-red-700">
          {error}
        </div>
      )}

      <FaqList faqs={faqs} loading={loading} onEdit={handleEdit} onDelete={handleDelete} />

      {deleteConfirm && (
        <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete FAQ">
          <div className="space-y-4">
            <p>
              Are you sure you want to delete <strong>{deleteConfirm.question}</strong>?
            </p>
            <p className="text-sm text-gray-500">
              This action cannot be undone. The FAQ will be deactivated and the AI will stop using it.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
