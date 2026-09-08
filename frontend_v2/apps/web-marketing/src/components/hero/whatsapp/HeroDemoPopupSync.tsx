import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { heroPreviewAfter, heroPreviewBefore } from '../../../copy';

export const HERO_STAT_POPUP_HOLD_MS = Math.max(
  heroPreviewBefore.timing.backlogScrollHoldMs,
  heroPreviewAfter.timing.loopHoldMs,
);

type Side = 'before' | 'after';

interface HeroDemoPopupSyncValue {
  showPopup: boolean;
  waitForPopupHold: (side: Side) => Promise<void>;
}

const HeroDemoPopupSyncContext = createContext<HeroDemoPopupSyncValue | null>(null);

export function HeroDemoPopupSyncProvider({ children }: { children: ReactNode }) {
  const [showPopup, setShowPopup] = useState(false);
  const readyRef = useRef({ before: false, after: false });
  const showingRef = useRef(false);
  const waitersRef = useRef<Array<() => void>>([]);
  const holdTimerRef = useRef<number>();

  const flushWaiters = useCallback(() => {
    const waiters = waitersRef.current;
    waitersRef.current = [];
    waiters.forEach((resolve) => resolve());
  }, []);

  const waitForPopupHold = useCallback((side: Side) => {
    return new Promise<void>((resolve) => {
      waitersRef.current.push(resolve);
      readyRef.current[side] = true;
      if (!readyRef.current.before || !readyRef.current.after || showingRef.current) return;

      showingRef.current = true;
      setShowPopup(true);
      holdTimerRef.current = window.setTimeout(() => {
        showingRef.current = false;
        readyRef.current = { before: false, after: false };
        setShowPopup(false);
        flushWaiters();
      }, HERO_STAT_POPUP_HOLD_MS);
    });
  }, [flushWaiters]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
      flushWaiters();
    };
  }, [flushWaiters]);

  const value = useMemo(
    () => ({ showPopup, waitForPopupHold }),
    [showPopup, waitForPopupHold],
  );

  return <HeroDemoPopupSyncContext.Provider value={value}>{children}</HeroDemoPopupSyncContext.Provider>;
}

export function useHeroDemoPopupSync(): HeroDemoPopupSyncValue | null {
  return useContext(HeroDemoPopupSyncContext);
}
