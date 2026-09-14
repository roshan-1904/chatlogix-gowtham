/**
 * Edit FAQ page
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaqForm } from '../components/faqs/FaqForm';
import { getFaq, updateFaq } from '../lib/faqs';
import type { Faq, FaqFormData } from '../types/faq';

export function FaqEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [faq, setFaq] = useState<Faq | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadFaq();
    }
  }, [id]);

  const loadFaq = async () => {
    try {
      setLoading(true);
      const data = await getFaq(id!);
      setFaq(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load FAQ';
      setError(message);
      console.error('Failed to load FAQ:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (data: FaqFormData) => {
    if (!id) return;

    setIsSubmitting(true);
    const toastId = toast.loading('Saving FAQ...');

    try {
      await updateFaq(id, data);
      toast.success('FAQ updated successfully!', { id: toastId });
      setTimeout(() => {
        navigate('/faqs');
      }, 500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update FAQ. Please try again.';
      toast.error(message, { id: toastId });
      console.error('Failed to update FAQ:', err);
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate('/faqs');
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-4 lg:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 sm:h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-48 sm:h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 sm:p-4 lg:p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-red-700">{error}</p>
          <button
            onClick={() => navigate('/faqs')}
            className="mt-3 sm:mt-4 text-xs sm:text-sm text-red-600 hover:text-red-800"
          >
            ← Back to FAQs
          </button>
        </div>
      </div>
    );
  }

  if (!faq) {
    return (
      <div className="p-3 sm:p-4 lg:p-6">
        <p className="text-xs sm:text-sm text-gray-500">FAQ not found</p>
      </div>
    );
  }

  return (
    <div className="p-1">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Edit FAQ</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">{faq.question}</p>
      </div>

      <FaqForm
        faq={faq}
        mode="edit"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={isSubmitting}
        onEnhanceSaved={async () => {
          await loadFaq();
        }}
      />
    </div>
  );
}
