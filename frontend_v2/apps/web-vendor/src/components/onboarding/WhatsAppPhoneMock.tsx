interface ChatLine {
  from: 'customer' | 'assistant';
  text: string;
}

interface WhatsAppPhoneMockProps {
  botName?: string;
  messages?: ChatLine[];
  className?: string;
}

const DEFAULT_MESSAGES: ChatLine[] = [
  { from: 'customer', text: 'Rate enna for 1 kg?' },
  { from: 'assistant', text: '1 kg is ₹450, freshly packed today. Want me to note an order?' },
  { from: 'customer', text: 'Yes, deliver this evening' },
];

export function WhatsAppPhoneMock({
  botName = 'Shop Assistant',
  messages = DEFAULT_MESSAGES,
  className = '',
}: WhatsAppPhoneMockProps) {
  const lines = messages.length > 0 ? messages : DEFAULT_MESSAGES;

  return (
    <div
      className={`mx-auto w-full max-w-[260px] rounded-[1.75rem] border-8 border-gray-900 bg-gray-900 shadow-xl ${className}`}
      aria-hidden="true"
    >
      <div className="overflow-hidden rounded-[1.15rem] bg-[#ECE5DD]">
        <div className="flex items-center gap-2 bg-[#075E54] px-3 py-2.5 text-white">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">
            {botName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{botName}</p>
            <p className="text-[10px] text-white/80">online · demo only</p>
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-2 text-white/95" aria-hidden>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
            </svg>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.62 10.79a15.15 15.15 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.56.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.56 1 1 0 01-.25 1.02l-2.2 2.21z" />
            </svg>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </span>
        </div>
        <div className="space-y-2 px-2.5 py-3 min-h-[168px]">
          {lines.map((msg, i) => (
            <div key={`${msg.from}-${i}`} className={`flex ${msg.from === 'customer' ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px] leading-snug shadow-sm ${
                  msg.from === 'customer'
                    ? 'rounded-tr-sm bg-[#DCF8C6] text-gray-900'
                    : 'rounded-tl-sm bg-white text-gray-900'
                }`}
              >
                {msg.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
