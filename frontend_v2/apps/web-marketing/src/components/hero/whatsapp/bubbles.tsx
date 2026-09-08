import { wa } from './whatsappChrome';

export function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div
        className={`inline-flex items-center gap-1 rounded-lg rounded-tl-none bg-white px-3.5 py-2.5 ${wa.shadow}`}
        aria-label="Typing"
      >
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 rounded-full bg-[#8696a0] motion-safe:animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function TextBubble({
  text,
  from,
  time,
  ticks,
}: {
  text: string;
  from: 'customer' | 'shop';
  time: string;
  ticks?: boolean;
}) {
  const isShop = from === 'shop';
  return (
    <div className={`flex w-full ${isShop ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[82%] px-2 py-1.5 ${isShop ? wa.shopBubble : wa.customerBubble} ${wa.shadow}`}
      >
        <p className="whitespace-pre-wrap pr-10 text-[12.5px] leading-[1.35]">{text}</p>
        <span className="absolute bottom-1 right-2 flex items-center gap-0.5 text-[10px] text-[#667781]">
          {time}
          {isShop && ticks ? (
            <svg className="h-3.5 w-3.5 text-[#53bdeb]" viewBox="0 0 16 15" fill="currentColor" aria-hidden>
              <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.28 9.88 5.03 6.63a.365.365 0 0 0-.516.006l-.424.433a.364.364 0 0 0 .006.514l3.58 3.58a.365.365 0 0 0 .516-.006l6.5-7.5a.365.365 0 0 0-.063-.51z" />
              <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.18 9.88 2.53 8.23a.364.364 0 0 0-.516.006l-.424.433a.364.364 0 0 0 .006.514l2.16 2.16a.365.365 0 0 0 .516-.006l6.5-7.5a.365.365 0 0 0-.063-.51z" />
            </svg>
          ) : null}
        </span>
      </div>
    </div>
  );
}

export function VoiceBubble({
  from,
  duration,
  time,
  waveform = [5, 9, 6, 14, 8, 12, 7, 11, 5, 10, 6],
}: {
  from: 'customer' | 'shop';
  duration: string;
  time: string;
  waveform?: number[];
}) {
  const isShop = from === 'shop';
  return (
    <div className={`flex w-full ${isShop ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex max-w-[82%] items-center gap-2 px-2.5 py-2 ${isShop ? wa.shopBubble : wa.customerBubble} ${wa.shadow}`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isShop ? 'bg-[#008069]' : 'bg-[#8696a0]'} text-white`}
          aria-hidden
        >
          <svg className="ml-0.5 h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
            <path d="M3 2.2v7.6L10.2 6 3 2.2z" />
          </svg>
        </span>
        <span className="flex h-5 items-end gap-[2px]" aria-hidden>
          {waveform.map((h, i) => (
            <span key={`${h}-${i}`} className="w-[2px] rounded-full bg-[#8696a0]" style={{ height: `${h}px` }} />
          ))}
        </span>
        <span className="text-[10px] text-[#667781]">{duration}</span>
        <span className="ml-auto text-[10px] text-[#667781]">{time}</span>
      </div>
    </div>
  );
}
