import { useEffect, useRef, useState } from 'react';
import { Modal, Button } from '@chatlogix/ui';
import { useEnhanceSession } from '../../hooks/useEnhanceSession';
import type { EnhanceEntityType, EnhancePreview } from '../../lib/catalogEnhance';
import { EnhanceChatPanel } from './EnhanceChatPanel';
import { EnhancePreviewPanel } from './EnhancePreviewPanel';

interface Props {
  entityType: EnhanceEntityType;
  entityId: string | undefined;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onAccepted?: (preview: EnhancePreview) => void | Promise<void>;
}

export function EnhanceModal({
  entityType,
  entityId,
  title,
  isOpen,
  onClose,
  onAccepted,
}: Props) {
  const [mobileTab, setMobileTab] = useState<'chat' | 'preview'>('chat');
  const [updateQuestion, setUpdateQuestion] = useState(false);
  const [editedText, setEditedText] = useState('');
  const openedRef = useRef(false);

  const session = useEnhanceSession({
    entityType,
    entityId,
    onAccepted,
    onClose,
  });

  const aiPreviewText =
    entityType === 'product'
      ? session.preview.description ?? ''
      : session.preview.answer ?? '';

  useEffect(() => {
    setEditedText(aiPreviewText);
  }, [aiPreviewText]);

  useEffect(() => {
    if (!isOpen) {
      openedRef.current = false;
      return;
    }
    if (entityId && !openedRef.current) {
      openedRef.current = true;
      void session.openModal();
    }
  }, [isOpen, entityId, session.openModal]);

  const canAccept = Boolean(editedText.trim());

  const handleAccept = () => {
    void session.accept({
      applyKeywords: true,
      updateQuestion,
      ...(entityType === 'product'
        ? { description: editedText.trim() }
        : { answer: editedText.trim() }),
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl" closeOnClickOutside={false}>
      {session.loading && session.messages.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">Starting session…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="hidden lg:grid lg:grid-cols-2 gap-4 h-[min(400px,calc(90vh-11rem))] min-h-[240px]">
            <EnhanceChatPanel
              messages={session.messages}
              generating={session.generating}
              onSend={session.sendMessage}
              onVoice={session.sendVoice}
            />
            <EnhancePreviewPanel
              entityType={entityType}
              preview={session.preview}
              generating={session.generating}
              editedText={editedText}
              onEditedTextChange={setEditedText}
            />
          </div>
          <div className="lg:hidden flex flex-col gap-2 h-[min(400px,calc(90vh-11rem))] min-h-[240px]">
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                className={`flex-1 text-sm py-1 rounded ${mobileTab === 'chat' ? 'bg-primary-500 text-white' : 'bg-gray-100'}`}
                onClick={() => setMobileTab('chat')}
              >
                Chat
              </button>
              <button
                type="button"
                className={`flex-1 text-sm py-1 rounded ${mobileTab === 'preview' ? 'bg-primary-500 text-white' : 'bg-gray-100'}`}
                onClick={() => setMobileTab('preview')}
              >
                Preview
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {mobileTab === 'chat' ? (
                <EnhanceChatPanel
                  messages={session.messages}
                  generating={session.generating}
                  onSend={session.sendMessage}
                  onVoice={session.sendVoice}
                />
              ) : (
                <EnhancePreviewPanel
                  entityType={entityType}
                  preview={session.preview}
                  generating={session.generating}
                  editedText={editedText}
                  onEditedTextChange={setEditedText}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-gray-200 shrink-0">
            <div className="min-w-0 space-y-1">
              {entityType === 'faq' && session.preview.question && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={updateQuestion}
                    onChange={(e) => setUpdateQuestion(e.target.checked)}
                  />
                  Update question with suggested polish
                </label>
              )}
              <p className="text-xs text-gray-500">
                AI enhancement uses credits from your account balance.
              </p>
            </div>
            <div className="flex justify-end gap-2 shrink-0">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button
                disabled={!canAccept || session.loading}
                onClick={handleAccept}
              >
                Use this
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
