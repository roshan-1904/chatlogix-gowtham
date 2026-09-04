import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';
import { bubbleLinkClass, innerCardClass } from './shared/bubbleChrome';

interface LocationBubbleProps {
  readonly message: Message;
  readonly onJumpToMessage?: (messageId: string) => void;
}

interface LocationPayload {
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
}

function readLocation(message: Message): LocationPayload {
  const p = message.structuredPayload ?? {};
  const lat = typeof p.latitude === 'number' ? p.latitude : Number(p.latitude);
  const lng = typeof p.longitude === 'number' ? p.longitude : Number(p.longitude);
  return {
    latitude: Number.isFinite(lat) ? lat : undefined,
    longitude: Number.isFinite(lng) ? lng : undefined,
    name: typeof p.name === 'string' ? p.name : undefined,
    address: typeof p.address === 'string' ? p.address : undefined,
  };
}

function LocationBubbleComponent({ message, onJumpToMessage }: LocationBubbleProps) {
  const { t } = useTranslation('conversations');
  const loc = readLocation(message);
  const hasCoords = loc.latitude !== undefined && loc.longitude !== undefined;
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`
    : null;

  return (
    <MessageShell message={message} wide onJumpToMessage={onJumpToMessage}>
      <div className={`rounded-lg p-2.5 ${innerCardClass()}`}>
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 119.5 9 2.5 2.5 0 0112 11.5z" />
            </svg>
          </span>
          <div className="min-w-0">
            {loc.name ? <div className="truncate font-medium">{loc.name}</div> : null}
            {loc.address ? (
              <div className="whitespace-pre-wrap text-xs text-[#667781]">{loc.address}</div>
            ) : null}
            {hasCoords && !loc.name && !loc.address ? (
              <div className="tabular-nums text-xs text-[#667781]">
                {loc.latitude!.toFixed(6)}, {loc.longitude!.toFixed(6)}
              </div>
            ) : null}
          </div>
        </div>
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-2 inline-block text-xs font-medium ${bubbleLinkClass()}`}
          >
            {t('location.openInMaps')}
          </a>
        ) : null}
      </div>
    </MessageShell>
  );
}

export const LocationBubble = memo(LocationBubbleComponent);
