/**
 * FAQ form: question + answer + active toggle. This is the full v1 scope —
 * no categories or ordering.
 */

import { useState } from 'react';
import { Button, Input } from '@chatlogix/ui';
import { EnhanceModal } from '../catalogEnhance/EnhanceModal';
import type { EnhancePreview } from '../../lib/catalogEnhance';
import type { Faq, FaqFormData } from '../../types/faq';

interface FaqFormProps {
  faq?: Faq;
  onSubmit: (data: FaqFormData) => Promise<void>;
  onCancel: () => void;
  mode: 'create' | 'edit';
  isLoading?: boolean;
  onEnhanceSaved?: () => void | Promise<void>;
}

export function FaqForm({
  faq,
  onSubmit,
  onCancel,
  mode,
  isLoading = false,
  onEnhanceSaved,
}: FaqFormProps) {
  const [question, setQuestion] = useState(faq?.question ?? '');
  const [answer, setAnswer] = useState(faq?.answer ?? '');
  const [isActive, setIsActive] = useState(faq?.isActive ?? true);
  const [errors, setErrors] = useState<{ question?: string; answer?: string }>({});
  const [enhanceOpen, setEnhanceOpen] = useState(false);

  const validate = (): boolean => {
    const nextErrors: { question?: string; answer?: string } = {};
    if (!question.trim()) nextErrors.question = 'Question is required';
    else if (question.length > 300) nextErrors.question = 'Question must be 300 characters or fewer';
    if (!answer.trim()) nextErrors.answer = 'Answer is required';
    else if (answer.length > 1500) nextErrors.answer = 'Answer must be 1500 characters or fewer';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit({ question: question.trim(), answer: answer.trim(), isActive });
  };

  const handleEnhanceAccepted = async (preview: EnhancePreview) => {
    if (preview.answer) setAnswer(preview.answer);
    await onEnhanceSaved?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div>
        <label htmlFor="faq-question" className="block text-sm font-medium text-gray-700 mb-1">
          Question
        </label>
        <Input
          id="faq-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Do you deliver on Sundays?"
          maxLength={300}
          error={errors.question}
        />
        <p className="text-xs text-gray-500 mt-1">
          Write in English. Stored in English so WhatsApp AI can reuse this for every language.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label htmlFor="faq-answer" className="block text-sm font-medium text-gray-700">
            Answer
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={mode === 'create' || !faq?.id}
            onClick={() => setEnhanceOpen(true)}
          >
            Enhance with AI
          </Button>
        </div>
        {mode === 'create' || !faq?.id ? (
          <p className="text-xs text-gray-500 mb-2">Save the FAQ first to use AI enhancement.</p>
        ) : null}
        <textarea
          id="faq-answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="e.g. Yes, we deliver every day including Sundays, 10am-6pm."
          maxLength={1500}
          rows={5}
          className={`w-full px-4 py-2 border rounded-lg outline-none bg-white text-gray-900 placeholder:text-gray-400 ${
            errors.answer ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {errors.answer && <p className="mt-1 text-sm text-red-600">{errors.answer}</p>}
      </div>

      <div className="flex items-center gap-2">
        <input
          id="faq-active"
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="faq-active" className="text-sm text-gray-700">
          Active (used by the AI to answer customers)
        </label>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {mode === 'create' ? 'Add FAQ' : 'Save Changes'}
        </Button>
      </div>

      {faq?.id ? (
        <EnhanceModal
          isOpen={enhanceOpen}
          onClose={() => setEnhanceOpen(false)}
          entityType="faq"
          entityId={faq.id}
          title={`Enhance — ${question || faq.question}`}
          onAccepted={handleEnhanceAccepted}
        />
      ) : null}
    </form>
  );
}
