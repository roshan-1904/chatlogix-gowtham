import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BubbleVariant } from './bubbleChrome';

interface AudioPlayerProps {
  readonly src: string;
  readonly durationSec?: number | null;
  readonly variant: BubbleVariant;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function hashBars(seed: string, count: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i += 1) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    bars.push(28 + (hash % 72));
  }
  return bars;
}

function AudioPlayerComponent({ src, durationSec, variant }: AudioPlayerProps) {
  const { t } = useTranslation('conversations');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState<number>(durationSec ?? 0);
  const bars = useMemo(() => hashBars(src, 28), [src]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrent(0);
    setTotal(durationSec ?? 0);
  }, [src, durationSec]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrent(audio.currentTime);
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) setTotal(audio.duration);
    };
    const onEnd = () => {
      setIsPlaying(false);
      setCurrent(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
    };
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      void audio.play();
      setIsPlaying(true);
    }
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Number(e.target.value);
    audio.currentTime = next;
    setCurrent(next);
  };

  const progressMax = total > 0 ? total : 0;
  const progress = progressMax > 0 ? current / progressMax : 0;
  const remaining = Math.max(progressMax - current, 0);
  const isOutgoing = variant === 'outgoing';

  return (
    <div className="flex items-center gap-2.5 min-w-[220px] py-0.5">
      <audio ref={audioRef} src={src} preload="metadata">
        <track kind="captions" />
      </audio>
      <span
        aria-hidden
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 8a1 1 0 001-1h2a3 3 0 01-6 0h2a1 1 0 001 1z" />
        </svg>
      </span>
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? t('audio.pause') : t('audio.play')}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#111b21] hover:bg-black/[0.06]"
      >
        {isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M7 5v14l12-7z" />
          </svg>
        )}
      </button>
      <div className="relative flex-1 min-w-0">
        <div className="pointer-events-none flex h-8 items-end gap-[2px]" aria-hidden>
          {bars.map((height, i) => {
            const filled = i / bars.length <= progress;
            return (
              <span
                key={i}
                className={`voice-bar w-[2.5px] rounded-full ${
                  filled ? 'bg-[#00a884]' : isOutgoing ? 'bg-[#8696a0]/45' : 'bg-[#8696a0]/40'
                } ${isPlaying && filled ? 'is-playing' : ''}`}
                style={{
                  height: `${height}%`,
                  animationDelay: `${(i % 8) * 70}ms`,
                }}
              />
            );
          })}
        </div>
        <input
          type="range"
          min={0}
          max={progressMax}
          step={0.1}
          value={current}
          onChange={onSeek}
          aria-label={t('audio.seek')}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
      <span className="w-9 text-right text-[11px] tabular-nums text-[#667781]">
        {formatTime(isPlaying ? remaining : total)}
      </span>
    </div>
  );
}

export const AudioPlayer = memo(AudioPlayerComponent);
