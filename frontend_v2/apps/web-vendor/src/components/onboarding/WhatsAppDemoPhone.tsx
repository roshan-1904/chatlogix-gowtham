import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import toast from 'react-hot-toast';
import {
  bubbleAlignClass,
  bubbleCornerClass,
  bubbleMetaClass,
  bubbleShadowClass,
  bubbleSurfaceClass,
  type BubbleVariant,
} from '../conversations/bubbles/shared/bubbleChrome';
import { StatusTick } from '../conversations/bubbles/shared/StatusTick';
import { AudioPlayer } from '../conversations/bubbles/shared/AudioPlayer';
import type { MessageStatus } from '../conversations/types';
import { sandboxChat, sandboxVoice } from '../../lib/onboarding';
import { mapOnboardingError } from './mapOnboardingError';
import { onboardingCopy } from './onboardingCopy';

type OutgoingStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

interface DemoMessage {
  id: string;
  role: 'customer' | 'assistant';
  type: 'text' | 'voice';
  text?: string;
  audioUrl?: string;
  durationSec?: number;
  outgoingStatus?: OutgoingStatus;
  timestamp: Date;
}

interface WhatsAppDemoPhoneProps {
  botName: string;
  greeting?: string;
  suggestedPrompts: readonly string[];
  walletEmpty: boolean;
  onWalletRefresh?: () => void;
  onLastCost?: (costMilli: number) => void;
  onAssistantReply?: () => void;
  framed?: boolean;
}

const TYPING_DELAY_MS = 400;
const MIN_TYPING_MS = 600;
const SENT_TICK_MS = 70;
const SLIDE_CANCEL_PX = 72;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

function mapOutgoingStatus(status: OutgoingStatus): MessageStatus {
  if (status === 'sending') return 'pending';
  if (status === 'sent') return 'sent';
  if (status === 'delivered') return 'delivered';
  if (status === 'failed') return 'failed';
  return 'read';
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function SendingClock() {
  return (
    <span className="text-[#667781]" aria-label="Sending">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start" aria-label={onboardingCopy.demoPhone.typing}>
      <div
        className={`inline-flex items-center gap-1 rounded-2xl rounded-tl-sm bg-white px-4 py-3 ${bubbleShadowClass()}`}
      >
        <span className="h-2 w-2 animate-bounce rounded-full bg-[#8696a0]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-[#8696a0] [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-[#8696a0] [animation-delay:300ms]" />
      </div>
    </div>
  );
}

function DemoBubble({ msg }: { msg: DemoMessage }) {
  const variant: BubbleVariant = msg.role === 'customer' ? 'outgoing' : 'incoming';
  const transcript = msg.type === 'voice' ? msg.text?.trim() : undefined;

  return (
    <div className={`flex w-full flex-col ${bubbleAlignClass(variant)}`}>
      <div
        className={`relative max-w-[80%] px-2.5 py-1.5 ${bubbleCornerClass(variant)} ${bubbleSurfaceClass(variant)} ${bubbleShadowClass()}`}
      >
        {msg.type === 'voice' && msg.audioUrl ? (
          <>
            <AudioPlayer src={msg.audioUrl} durationSec={msg.durationSec} variant={variant} />
            {transcript ? (
              <p className="mt-1.5 border-t border-black/[0.06] pt-1.5 text-[13px] leading-snug text-[#3b4a54]">
                {transcript}
              </p>
            ) : null}
          </>
        ) : (
          <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[19px] text-[#111b21]">
            {msg.text}
          </p>
        )}
        <div className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${bubbleMetaClass()}`}>
          <span>{formatTime(msg.timestamp)}</span>
          {msg.role === 'customer' && msg.outgoingStatus ? (
            msg.outgoingStatus === 'sending' ? (
              <SendingClock />
            ) : (
              <StatusTick status={mapOutgoingStatus(msg.outgoingStatus)} />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HeaderIconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center text-white"
      onClick={onPress}
    >
      {children}
    </button>
  );
}

export function WhatsAppDemoPhone({
  botName,
  greeting,
  suggestedPrompts,
  walletEmpty,
  onWalletRefresh,
  onLastCost,
  onAssistantReply,
  framed = true,
}: WhatsAppDemoPhoneProps) {
  const copy = onboardingCopy.demoPhone;
  const fileInputId = useId();
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [headerStatus, setHeaderStatus] = useState<'online' | 'typing'>('online');
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [cancelSlide, setCancelSlide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusClock, setStatusClock] = useState(() => formatTime(new Date()));

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartXRef = useRef(0);
  const recordStartedAtRef = useRef(0);
  const cancelSlideRef = useRef(false);
  const recordingRef = useRef(false);
  const holdActiveRef = useRef(false);
  const busyRef = useRef(false);
  const greetingShownRef = useRef(false);
  const audioUrlsRef = useRef<string[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      audioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      audioUrlsRef.current = [];
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (greetingShownRef.current || !greeting?.trim()) return;
    greetingShownRef.current = true;
    setMessages([
      {
        id: 'greeting',
        role: 'assistant',
        type: 'text',
        text: greeting.trim(),
        timestamp: new Date(),
      },
    ]);
  }, [greeting]);

  useEffect(() => {
    const tick = () => setStatusClock(formatTime(new Date()));
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, typing, scrollToBottom]);

  const resizeComposer = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const patchOutgoing = useCallback((msgId: string, outgoingStatus: OutgoingStatus) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || m.role !== 'customer') return m;
        if (m.outgoingStatus === 'failed' || m.outgoingStatus === 'read') return m;
        return { ...m, outgoingStatus };
      })
    );
  }, []);

  const finishReply = useCallback(
    async (msgId: string, sendStartedAt: number, work: Promise<{ response: string; costMilli: number }>) => {
      const typingTimer = window.setTimeout(() => {
        if (!mountedRef.current) return;
        setTyping(true);
        setHeaderStatus('typing');
      }, TYPING_DELAY_MS);

      try {
        const result = await work;
        const elapsed = Date.now() - sendStartedAt;
        const minVisible = TYPING_DELAY_MS + MIN_TYPING_MS;
        if (elapsed < minVisible) {
          await delay(minVisible - elapsed);
        }
        if (!mountedRef.current) return;
        window.clearTimeout(typingTimer);
        setMessages((prev) => [
          ...prev.map((m) =>
            m.id === msgId ? { ...m, outgoingStatus: 'read' as OutgoingStatus } : m
          ),
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            type: 'text',
            text: result.response,
            timestamp: new Date(),
          },
        ]);
        onLastCost?.(result.costMilli);
        onWalletRefresh?.();
        onAssistantReply?.();
      } catch (err) {
        window.clearTimeout(typingTimer);
        toast.error(mapOnboardingError(err));
        patchOutgoing(msgId, 'failed');
      } finally {
        if (mountedRef.current) {
          setTyping(false);
          setHeaderStatus('online');
          busyRef.current = false;
          setBusy(false);
        }
      }
    },
    [onLastCost, onWalletRefresh, onAssistantReply, patchOutgoing]
  );

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busyRef.current || walletEmpty) return;
      busyRef.current = true;
      setBusy(true);
      const msgId = `u-${Date.now()}`;
      const sendStartedAt = Date.now();
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          role: 'customer',
          type: 'text',
          text: trimmed,
          outgoingStatus: 'sending',
          timestamp: new Date(),
        },
      ]);
      setInput('');
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      });

      window.setTimeout(() => patchOutgoing(msgId, 'sent'), SENT_TICK_MS);
      window.setTimeout(() => patchOutgoing(msgId, 'delivered'), TYPING_DELAY_MS);

      await finishReply(msgId, sendStartedAt, sandboxChat(trimmed));
    },
    [walletEmpty, patchOutgoing, finishReply]
  );

  const sendVoiceBlob = useCallback(
    async (blob: Blob, durationSec: number) => {
      if (walletEmpty || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      const msgId = `v-${Date.now()}`;
      const sendStartedAt = Date.now();
      const audioUrl = URL.createObjectURL(blob);
      audioUrlsRef.current.push(audioUrl);
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          role: 'customer',
          type: 'voice',
          audioUrl,
          durationSec,
          outgoingStatus: 'sending',
          timestamp: new Date(),
        },
      ]);

      window.setTimeout(() => patchOutgoing(msgId, 'sent'), SENT_TICK_MS);
      window.setTimeout(() => patchOutgoing(msgId, 'delivered'), TYPING_DELAY_MS);

      const work = sandboxVoice(blob).then((result) => {
        const transcript = result.transcript?.trim();
        if (transcript) {
          setMessages((prev) =>
            prev.map((m) => (m.id === msgId ? { ...m, text: transcript } : m))
          );
        }
        return result;
      });

      await finishReply(msgId, sendStartedAt, work);
    },
    [walletEmpty, patchOutgoing, finishReply]
  );

  const releaseMedia = useCallback(() => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    recordingRef.current = false;
    setRecording(false);
    setCancelSlide(false);
    cancelSlideRef.current = false;
  }, []);

  const stopRecording = useCallback(
    (send: boolean) => {
      const recorder = recorderRef.current;
      const elapsedSec = Math.max(1, Math.round((Date.now() - recordStartedAtRef.current) / 1000));
      if (!recorder) {
        releaseMedia();
        return;
      }

      const shouldSend = send && !cancelSlideRef.current;
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        releaseMedia();
        if (shouldSend && blob.size > 0) {
          void sendVoiceBlob(blob, elapsedSec);
        }
      };

      if (recorder.state !== 'inactive') {
        recorder.stop();
      } else {
        releaseMedia();
      }
    },
    [releaseMedia, sendVoiceBlob]
  );

  const startRecording = useCallback(
    async (clientX: number) => {
      if (walletEmpty || busyRef.current || recordingRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!holdActiveRef.current || !mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const mimeType = pickRecorderMime();
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.start();
        recorderRef.current = recorder;
        streamRef.current = stream;
        recordStartXRef.current = clientX;
        recordStartedAtRef.current = Date.now();
        recordingRef.current = true;
        cancelSlideRef.current = false;
        setCancelSlide(false);
        setRecordSeconds(0);
        setRecording(true);
        recordTimerRef.current = window.setInterval(() => {
          setRecordSeconds(Math.floor((Date.now() - recordStartedAtRef.current) / 1000));
        }, 250);
      } catch {
        holdActiveRef.current = false;
        toast.error(copy.micDenied);
        fileRef.current?.click();
      }
    },
    [copy.micDenied, walletEmpty]
  );

  const onMicPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || busyRef.current || walletEmpty) return;
    e.preventDefault();
    holdActiveRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    void startRecording(e.clientX);
  };

  const onMicPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!recordingRef.current) return;
    const sliding = recordStartXRef.current - e.clientX > SLIDE_CANCEL_PX;
    cancelSlideRef.current = sliding;
    setCancelSlide(sliding);
  };

  const onMicPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    holdActiveRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!recordingRef.current) return;
    stopRecording(!cancelSlideRef.current);
  };

  const hasText = input.trim().length > 0;
  const prompts =
    suggestedPrompts.length > 0 ? suggestedPrompts : onboardingCopy.step4.suggestedPrompts;

  const phoneInner = (
    <div className="flex h-full min-h-0 flex-col bg-[#ECE5DD]">
      <div className="flex shrink-0 items-center gap-1 bg-[#075E54] px-2 py-2 text-white">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
          {botName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-[16px] font-medium leading-tight">{botName}</p>
          <p className="text-[12.5px] text-white/90">
            {headerStatus === 'typing' ? copy.typing : copy.online}
          </p>
        </div>
        <HeaderIconButton label={copy.videoLabel} onPress={() => toast(copy.demoOnly)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M17 10.5V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-3.5l4 4v-11l-4 4z" />
          </svg>
        </HeaderIconButton>
        <HeaderIconButton label={copy.callLabel} onPress={() => toast(copy.demoOnly)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6 1.1 0 2 .9 2 2V20c0 1.1-.9 2-2 2-9.4 0-17-7.6-17-17 0-1.1.9-2 2-2h3.5c1.1 0 2 .9 2 2 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
          </svg>
        </HeaderIconButton>
        <HeaderIconButton label={copy.menuLabel} onPress={() => toast(copy.demoOnly)}>
          <svg width="4" height="18" viewBox="0 0 4 18" fill="currentColor" aria-hidden>
            <circle cx="2" cy="2" r="2" />
            <circle cx="2" cy="9" r="2" />
            <circle cx="2" cy="16" r="2" />
          </svg>
        </HeaderIconButton>
      </div>

      <div ref={listRef} className="chat-canvas conversation-scrollbar min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 py-3">
        <div className="flex justify-center">
          <span className="rounded-lg bg-white/90 px-3 py-1 text-[11px] text-[#54656f] shadow-sm">
            {copy.today}
          </span>
        </div>
        {messages.map((msg) => (
          <DemoBubble key={msg.id} msg={msg} />
        ))}
        {typing ? <TypingBubble /> : null}
      </div>

      {!walletEmpty && !recording && prompts.length > 0 ? (
        <div className="flex shrink-0 gap-2 overflow-x-auto px-2 pb-1 pt-1">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={busy}
              onClick={() => void sendText(prompt)}
              className="shrink-0 rounded-full border border-[#00a884]/35 bg-white px-3 py-1.5 text-[13px] text-[#027eb5] shadow-sm disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}

      {walletEmpty ? (
        <div className="shrink-0 border-t border-[#d1d7db] bg-[#f0f2f5] px-4 py-3 text-center text-sm text-gray-700">
          {onboardingCopy.step4.emptyWallet}
        </div>
      ) : (
        <div className="flex shrink-0 items-end gap-1.5 bg-[#f0f2f5] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
          {recording ? (
            <div className="mb-0.5 flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-3xl bg-white px-3 py-2 shadow-sm">
              <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
              <span className="w-10 shrink-0 text-[13px] tabular-nums text-[#111b21]">
                {formatDuration(recordSeconds)}
              </span>
              <span className="flex h-5 flex-1 items-end gap-[3px]" aria-hidden>
                {[7, 12, 8, 16, 9, 14, 6, 13, 10, 15, 8, 12].map((h, i) => (
                  <span
                    key={`${h}-${i}`}
                    className={`voice-bar w-[3px] rounded-full ${cancelSlide ? 'bg-red-400 is-playing' : 'bg-[#00a884] is-playing'}`}
                    style={{ height: `${h}px`, animationDelay: `${(i % 6) * 80}ms` }}
                  />
                ))}
              </span>
              <span
                className={`shrink-0 text-[12px] ${cancelSlide ? 'font-medium text-red-600' : 'text-[#667781]'}`}
              >
                {cancelSlide ? copy.slideCancel : `‹ ${copy.slideCancel}`}
              </span>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#54656f]"
                aria-label={copy.attachLabel}
                onClick={() => toast(copy.demoOnly)}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M16.5 6v11.5a4 4 0 01-8 0V5a2.5 2.5 0 015 0v10.5a1 1 0 01-2 0V6H9v9.5a2.5 2.5 0 005 0V5a4 4 0 00-8 0v12.5a6 6 0 0012 0V6h-1.5z" />
                </svg>
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                rows={1}
                placeholder={copy.composerPlaceholder}
                aria-label={copy.composerPlaceholder}
                className="mb-0.5 max-h-[120px] min-h-[40px] flex-1 resize-none rounded-3xl border-0 bg-white px-4 py-2 text-[15px] leading-snug text-[#111b21] shadow-sm outline-none"
                onChange={(e) => {
                  setInput(e.target.value);
                  resizeComposer();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendText(input);
                  }
                }}
              />
            </>
          )}
          {hasText && !recording ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendText(input)}
              className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm disabled:opacity-50"
              aria-label={copy.sendLabel}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="mb-0.5 flex h-11 w-11 shrink-0 touch-none items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm select-none"
              aria-label={copy.micLabel}
              style={{ WebkitTouchCallout: 'none' } as CSSProperties}
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={onMicPointerDown}
              onPointerMove={onMicPointerMove}
              onPointerUp={onMicPointerUp}
              onPointerCancel={onMicPointerUp}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 8a1 1 0 001-1h2a3 3 0 01-6 0h2a1 1 0 001 1z" />
              </svg>
            </button>
          )}
          <input
            id={fileInputId}
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void sendVoiceBlob(file, 0);
            }}
          />
        </div>
      )}
    </div>
  );

  if (!framed) {
    return <div className="flex h-full min-h-0 flex-1 flex-col">{phoneInner}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[390px]">
      <div className="overflow-hidden rounded-[2.25rem] border-[10px] border-gray-900 bg-gray-900 shadow-2xl">
        <div className="flex h-7 items-center justify-between bg-gray-900 px-5 text-[10px] text-white/80">
          <span className="tabular-nums">{statusClock}</span>
          <div className="h-1.5 w-16 rounded-full bg-gray-700" />
          <span>LTE</span>
        </div>
        <div className="h-[844px] max-h-[min(844px,calc(100dvh-13rem))]">{phoneInner}</div>
      </div>
    </div>
  );
}
