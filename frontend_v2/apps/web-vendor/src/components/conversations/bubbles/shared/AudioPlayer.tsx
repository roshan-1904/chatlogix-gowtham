import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface AudioPlayerProps {
  readonly src: string;
  readonly durationSec?: number | null;
  readonly tone: 'light' | 'dark';
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function AudioPlayerComponent({ src, durationSec, tone }: AudioPlayerProps) {
  const { t } = useTranslation('conversations');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState<number>(durationSec ?? 0);

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
  }, []);

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

  const isDark = tone === 'dark';
  const buttonClass = isDark
    ? 'bg-white/20 text-white hover:bg-white/30'
    : 'bg-blue-500 text-white hover:bg-blue-600';
  const labelColor = isDark ? 'text-blue-50' : 'text-gray-700';

  const progressMax = total > 0 ? total : 0;

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? t('audio.pause') : t('audio.play')}
        className={`flex items-center justify-center w-9 h-9 rounded-full ${buttonClass}`}
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
      <input
        type="range"
        min={0}
        max={progressMax}
        step={0.1}
        value={current}
        onChange={onSeek}
        aria-label={t('audio.seek')}
        className="flex-1 h-1 accent-blue-400"
      />
      <span className={`text-[11px] tabular-nums ${labelColor}`}>
        {formatTime(current)} / {formatTime(total)}
      </span>
    </div>
  );
}

export const AudioPlayer = memo(AudioPlayerComponent);
