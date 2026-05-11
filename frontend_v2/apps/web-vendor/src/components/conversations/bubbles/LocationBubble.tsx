import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';

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
  const p = (message.structuredPayload ?? {}) as Record<string, unknown>;
  const lat = typeof p.latitude === 'number' ? p.latitude : Number(p.latitude);
  const lng = typeof p.longitude === 'number' ? p.longitude : Number(p.longitude);
  return {
    latitude: Number.isFinite(lat) ? lat : undefined,
    longitude: Number.isFinite(lng) ? lng : undefined,
    name: typeof p.name === 'string' ? p.name : undefined,
    address: typeof p.address === 'string' ? p.address : undefined
  };
}

function LocationBubbleComponent({ message, onJumpToMessage }: LocationBubbleProps) {
  const { t } = useTranslation('conversations');
  const isCustomer = message.senderType === 'customer';
  const loc = readLocation(message);
  const hasCoords = loc.latitude !== undefined && loc.longitude !== undefined;
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`
    : null;
  const tone = isCustomer ? 'text-gray-600' : 'text-blue-100';

  return (
    <MessageShell message={message} wide onJumpToMessage={onJumpToMessage}>
      <div
        className={`rounded-md p-2 ${isCustomer ? 'bg-white/60' : 'bg-white/15'}`}
      >
        <div className="flex items-start gap-2">
          <span aria-hidden className="text-xl mt-0.5">
            📍
          </span>
          <div className="min-w-0">
            {loc.name ? (
              <div className="font-medium truncate">{loc.name}</div>
            ) : null}
            {loc.address ? (
              <div className={`text-xs ${tone} whitespace-pre-wrap`}>{loc.address}</div>
            ) : null}
            {hasCoords && !loc.name && !loc.address ? (
              <div className={`text-xs ${tone} tabular-nums`}>
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
            className={`mt-2 inline-block text-xs underline ${
              isCustomer ? 'text-blue-600' : 'text-white'
            }`}
          >
            {t('location.openInMaps')}
          </a>
        ) : null}
      </div>
    </MessageShell>
  );
}

export const LocationBubble = memo(LocationBubbleComponent);
