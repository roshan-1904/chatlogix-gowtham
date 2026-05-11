import { useState, useEffect } from 'react';
import { Modal, Button } from '@chatlogix/ui';
import { apiClient } from '../../../lib/api';
import { ConversationView } from '../../conversations/ConversationView';
import type { Conversation } from '../../conversations/types';

interface CustomerConversationModalProps {
  conversationId: string;
  customerId: string;
  customerPhone: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenFullConversation: (conversationId: string) => void;
}

export function CustomerConversationModal({
  conversationId,
  customerId,
  customerPhone,
  isOpen,
  onClose,
  onOpenFullConversation,
}: CustomerConversationModalProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && conversationId) {
      const fetchConversation = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const data = await apiClient.get<Conversation>(`/conversations/${conversationId}`);
          setConversation(data);
        } catch (err) {
          console.error('Failed to load conversation:', err);
          setError('Failed to load conversation');
          // Create minimal conversation object from props as fallback
          setConversation({
            id: conversationId,
            vendorId: '',
            customerId,
            status: 'active',
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            customer: {
              id: customerId,
              phone: customerPhone,
            },
            lastMessage: null,
          });
        } finally {
          setIsLoading(false);
        }
      };

      fetchConversation();
    }
  }, [isOpen, conversationId, customerId, customerPhone]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Customer Conversation"
      size="xl"
    >
      <div className="flex flex-col" style={{ height: '80vh', maxHeight: '800px', minHeight: '500px' }}>
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Loading conversation...
          </div>
        ) : error && !conversation ? (
          <div className="flex-1 flex items-center justify-center text-red-500">
            {error}
          </div>
        ) : conversation ? (
          <>
            <div className="flex-1 min-h-0 overflow-hidden">
              <ConversationView
                conversationId={conversationId}
                conversation={conversation}
                enablePolling={true}
                pollingInterval={10000}
              />
            </div>
            <div className="flex gap-3 pt-4 border-t border-gray-200 mt-4 flex-shrink-0">
              <Button
                variant="primary"
                onClick={() => onOpenFullConversation(conversationId)}
                className="flex-1"
              >
                Open Full Conversation
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

