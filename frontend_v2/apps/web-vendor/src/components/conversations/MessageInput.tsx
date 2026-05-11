import { Button } from '@chatlogix/ui';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  disabled: boolean;
  error: string | null;
}

export function MessageInput({
  value,
  onChange,
  onSend,
  onKeyPress,
  disabled,
  error,
}: MessageInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyPress(e as unknown as React.KeyboardEvent);
  };

  return (
    <div className="bg-[#f0f2f5] border-t border-gray-300 px-3 py-2">
      <div className="flex items-end space-x-2">
        <button
          type="button"
          className="text-xl text-gray-600 px-2 pb-1 disabled:opacity-50"
          disabled={disabled}
          aria-label="Emoji (coming soon)"
        >
          😊
        </button>
        <button
          type="button"
          className="text-lg text-gray-600 px-1 pb-1 disabled:opacity-50"
          disabled={disabled}
          aria-label="Attach file (coming soon)"
        >
          📎
        </button>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message"
          disabled={disabled}
          rows={1}
          className="flex-1 max-h-24 resize-none px-3 py-2 rounded-lg bg-white text-sm border border-transparent focus:outline-none focus:ring-0 focus:border-transparent disabled:opacity-60"
        />
        <Button
          onClick={onSend}
          disabled={!value.trim() || disabled}
          className={`rounded-full h-10 w-10 p-0 flex items-center justify-center text-sm font-semibold ${
            value.trim()
              ? 'bg-[#25d366] hover:bg-[#1da955] text-white'
              : 'bg-gray-300 text-gray-600 cursor-default'
          }`}
        >
          ➤
        </Button>
      </div>
      {error && (
        <div className="mt-1 text-xs text-red-600 px-1">{error}</div>
      )}
    </div>
  );
}

