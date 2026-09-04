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
    <div className="border-t border-[#d1d7db] bg-[#f0f2f5] px-3 py-2.5">
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message"
          disabled={disabled}
          rows={1}
          className="max-h-24 flex-1 resize-none rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-[#111b21] shadow-sm placeholder:text-[#667781] focus:outline-none focus:ring-0 disabled:opacity-60"
        />
        <Button
          onClick={onSend}
          disabled={!value.trim() || disabled}
          aria-label="Send message"
          className={`flex h-11 w-11 items-center justify-center rounded-full p-0 ${
            value.trim()
              ? 'bg-[#00a884] text-white hover:bg-[#029a78]'
              : 'cursor-default bg-[#d1d7db] text-white'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </Button>
      </div>
      {error ? <div className="mt-1 px-1 text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
