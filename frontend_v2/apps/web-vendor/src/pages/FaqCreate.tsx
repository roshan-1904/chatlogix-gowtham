/**
 * Create FAQ page
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaqForm } from '../components/faqs/FaqForm';
import { createFaq } from '../lib/faqs';
import type { FaqFormData } from '../types/faq';

export function FaqCreate() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: FaqFormData) => {
    setIsLoading(true);
    const toastId = toast.loading('Adding FAQ...');

    try {
      await createFaq(data);
      toast.success('FAQ added successfully!', { id: toastId });
      setTimeout(() => {
        navigate('/faqs');
      }, 500);
    } catch (error) {
      console.error('Failed to create FAQ:', error);
      const message = error instanceof Error ? error.message : 'Failed to add FAQ. Please try again.';
      toast.error(message, { id: toastId });
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/faqs');
  };

  return (
    <div className="p-1">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Add FAQ</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">Add a question the AI can answer for customers</p>
      </div>

      <FaqForm mode="create" onSubmit={handleSubmit} onCancel={handleCancel} isLoading={isLoading} />
    </div>
  );
}
