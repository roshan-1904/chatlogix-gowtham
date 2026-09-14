import { useState } from 'react';
import { Button } from '@chatlogix/ui';
import type { EnhanceChatMessage } from '../../lib/catalogEnhance';
import { EnhanceVoiceButton } from './EnhanceVoiceButton';

interface Props {
  messages: EnhanceChatMessage[];
  generating: boolean;
  onSend: (text: string) => void | Promise<void>;
  onVoice: (blob: Blob) => void | Promise<void>;
}

export function EnhanceChatPanel({ messages, generating, onSend, onVoice }: Props) {
  const [draft, setDraft] = useState('');

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || generating) return;
    setDraft('');
    await onSend(text);
  };

  return (
    <div className="flex flex-col h-full min-h-0 border border-gray-200 rounded-lg bg-gray-50">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-gray-500">Chat with the assistant to refine your content.</p>
        )}
        {messages.map((m, i) => (
          <div
            key={`${m.createdAt}-${i}`}
            className={`max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'ml-auto bg-primary-500 text-white'
                : 'bg-white border border-gray-200 text-gray-800'
            }`}
          >
            {m.content}
          </div>
        ))}
        {generating && (
          <p className="text-xs text-gray-500 animate-pulse">Updating preview…</p>
        )}
      </div>
      <div className="p-2 border-t border-gray-200 bg-white flex gap-2 items-end">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Type a message…"
          className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <EnhanceVoiceButton disabled={generating} onRecorded={onVoice} />
        <Button type="button" size="sm" disabled={generating || !draft.trim()} onClick={() => void handleSend()}>
          Send
        </Button>
      </div>
    </div>
  );
}
