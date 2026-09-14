import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import {
  acceptEnhancePreview,
  sendEnhanceMessage,
  sendEnhanceVoice,
  startEnhanceSession,
  type EnhanceEntityType,
  type EnhancePreview,
  type EnhanceChatMessage,
} from '../lib/catalogEnhance';
import { isEnhanceInsufficientBalance } from '../lib/enhanceErrors';

interface UseEnhanceSessionOptions {
  entityType: EnhanceEntityType;
  entityId: string | undefined;
  onAccepted?: (preview: EnhancePreview) => void | Promise<void>;
  onClose?: () => void;
}

export function useEnhanceSession({
  entityType,
  entityId,
  onAccepted,
  onClose,
}: UseEnhanceSessionOptions) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<EnhanceChatMessage[]>([]);
  const [preview, setPreview] = useState<EnhancePreview>({});
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const openModal = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setSessionId(null);
    setMessages([]);
    setPreview({});
    try {
      const res = await startEnhanceSession(entityType, entityId);
      setSessionId(res.sessionId);
      setMessages(res.messages);
      setPreview(res.preview ?? {});
    } catch (err) {
      if (isEnhanceInsufficientBalance(err)) {
        toast.error('Insufficient credits for AI enhancement.');
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not start enhancement');
      }
      onClose?.();
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, onClose]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionId || !content.trim()) return;
      setGenerating(true);
      try {
        const res = await sendEnhanceMessage(sessionId, content.trim());
        setMessages(res.messages);
        setPreview(res.preview ?? {});
      } catch (err) {
        if (isEnhanceInsufficientBalance(err)) {
          toast.error('Insufficient credits for AI enhancement.');
        } else {
          toast.error(err instanceof Error ? err.message : 'Send failed');
        }
      } finally {
        setGenerating(false);
      }
    },
    [sessionId]
  );

  const sendVoice = useCallback(
    async (audio: Blob) => {
      if (!sessionId) return;
      setGenerating(true);
      try {
        const res = await sendEnhanceVoice(sessionId, audio);
        setMessages(res.messages);
        setPreview(res.preview ?? {});
      } catch (err) {
        if (isEnhanceInsufficientBalance(err)) {
          toast.error('Insufficient credits for AI enhancement.');
        } else {
          toast.error(err instanceof Error ? err.message : 'Voice failed');
        }
      } finally {
        setGenerating(false);
      }
    },
    [sessionId]
  );

  const accept = useCallback(
    async (options?: { applyKeywords?: boolean; updateQuestion?: boolean }) => {
      if (!sessionId) return;
      setLoading(true);
      try {
        await acceptEnhancePreview(sessionId, options);
        await onAccepted?.(preview);
        toast.success('Saved enhanced content');
        onClose?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save');
      } finally {
        setLoading(false);
      }
    },
    [sessionId, preview, onAccepted, onClose]
  );

  return {
    openModal,
    messages,
    preview,
    loading,
    generating,
    sendMessage,
    sendVoice,
    accept,
    sessionId,
  };
}
