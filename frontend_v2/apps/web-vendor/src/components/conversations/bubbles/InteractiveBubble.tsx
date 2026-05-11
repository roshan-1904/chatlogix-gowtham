import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';

interface InteractiveBubbleProps {
  readonly message: Message;
  readonly onJumpToMessage?: (messageId: string) => void;
}

interface InteractivePayload {
  kind?: 'button_reply' | 'list_reply' | string;
  label?: string;
  description?: string;
}

function readInteractive(message: Message): InteractivePayload {
  const p = (message.structuredPayload ?? {}) as Record<string, unknown>;
  const kind = typeof p.kind === 'string' ? p.kind : undefined;
  const label =
    (typeof p.title === 'string' && p.title) ||
    (typeof p.label === 'string' && p.label) ||
    undefined;
  const description = typeof p.description === 'string' ? p.description : undefined;
  return { kind, label, description };
}

function InteractiveBubbleComponent({ message, onJumpToMessage }: InteractiveBubbleProps) {
  const { t } = useTranslation('conversations');
  const data = readInteractive(message);

  const label = data.label ?? message.content;
  const isList = data.kind === 'list_reply';
  const headline = isList
    ? t('interactive.listReply', { label })
    : t('interactive.buttonReply', { label });

  return (
    <MessageShell message={message} onJumpToMessage={onJumpToMessage}>
      <div className="font-medium">{headline}</div>
      {data.description ? (
        <div className="text-xs opacity-80 mt-0.5">{data.description}</div>
      ) : null}
    </MessageShell>
  );
}

export const InteractiveBubble = memo(InteractiveBubbleComponent);
