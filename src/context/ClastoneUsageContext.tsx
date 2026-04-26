import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { doc, increment, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const IDLE_TIMEOUT_MS = 30_000;
const FLUSH_INTERVAL_MS = 5 * 60_000;
const TICK_MS = 1_000;

type ClastoneUsageState = {
  totalClastoneUsageMs: number;
  pendingClastoneUsageMs: number;
  lastBatchSentAtMs: number | null;
};

const ClastoneUsageContext = createContext<ClastoneUsageState | null>(null);

function getPendingKey(uid: string): string {
  return `clastone:usage:pending:${uid}`;
}

function readPendingMs(uid: string): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(getPendingKey(uid));
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function writePendingMs(uid: string, pendingMs: number): void {
  if (typeof window === 'undefined') return;
  const normalized = Math.max(0, Math.floor(pendingMs));
  if (normalized <= 0) {
    window.localStorage.removeItem(getPendingKey(uid));
    return;
  }
  window.localStorage.setItem(getPendingKey(uid), String(normalized));
}

export function ClastoneUsageProvider({
  uid,
  initialTotalMs,
  children,
}: {
  uid: string;
  initialTotalMs: number;
  children: React.ReactNode;
}) {
  const initialFromServer = Number.isFinite(initialTotalMs) ? Math.max(0, Math.floor(initialTotalMs)) : 0;
  const recoveredPending = readPendingMs(uid);
  const [totalClastoneUsageMs, setTotalClastoneUsageMs] = useState(initialFromServer + recoveredPending);
  const [pendingClastoneUsageMs, setPendingClastoneUsageMs] = useState(recoveredPending);
  const [lastBatchSentAtMs, setLastBatchSentAtMs] = useState<number | null>(null);

  const confirmedServerMsRef = useRef(initialFromServer);
  const pendingMsRef = useRef(recoveredPending);
  const lastTickAtRef = useRef(Date.now());
  const lastActivityAtRef = useRef(Date.now());
  const activeRef = useRef(true);
  const flushingRef = useRef(false);
  const lastFlushAttemptAtRef = useRef(0);

  useEffect(() => {
    confirmedServerMsRef.current = initialFromServer;
    setTotalClastoneUsageMs(initialFromServer + pendingMsRef.current);
  }, [initialFromServer]);

  useEffect(() => {
    const bumpDisplay = () => {
      setTotalClastoneUsageMs(confirmedServerMsRef.current + pendingMsRef.current);
      setPendingClastoneUsageMs(pendingMsRef.current);
    };

    const flushPending = async () => {
      if (!db || flushingRef.current) return;
      const snapshotPending = pendingMsRef.current;
      if (snapshotPending <= 0) return;

      flushingRef.current = true;
      lastFlushAttemptAtRef.current = Date.now();
      try {
        await setDoc(
          doc(db, 'users', uid),
          {
            usage: {
              clastoneActiveMs: increment(snapshotPending),
              lastActiveFlushAt: new Date().toISOString(),
            },
          },
          { merge: true }
        );
        confirmedServerMsRef.current += snapshotPending;
        pendingMsRef.current = Math.max(0, pendingMsRef.current - snapshotPending);
        setLastBatchSentAtMs(Date.now());
        writePendingMs(uid, pendingMsRef.current);
        bumpDisplay();
      } catch {
        writePendingMs(uid, pendingMsRef.current);
      } finally {
        flushingRef.current = false;
      }
    };

    const markActivity = () => {
      const now = Date.now();
      lastActivityAtRef.current = now;
      if (!activeRef.current) {
        activeRef.current = true;
        lastTickAtRef.current = now;
      }
    };

    const flushSoon = () => {
      writePendingMs(uid, pendingMsRef.current);
      void flushPending();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushSoon();
      } else {
        markActivity();
      }
    };

    const onPageHide = () => {
      writePendingMs(uid, pendingMsRef.current);
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'pointerdown',
      'focus',
    ];

    for (const eventName of events) {
      window.addEventListener(eventName, markActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, now - lastTickAtRef.current);
      lastTickAtRef.current = now;

      if (activeRef.current) {
        const activeGap = now - lastActivityAtRef.current;
        if (activeGap < IDLE_TIMEOUT_MS) {
          pendingMsRef.current += elapsed;
          writePendingMs(uid, pendingMsRef.current);
          bumpDisplay();
        } else {
          activeRef.current = false;
          flushSoon();
        }
      }

      const shouldHeartbeatFlush =
        pendingMsRef.current > 0 && now - lastFlushAttemptAtRef.current >= FLUSH_INTERVAL_MS;
      if (shouldHeartbeatFlush) {
        void flushPending();
      }
    }, TICK_MS);

    void flushPending();

    return () => {
      window.clearInterval(intervalId);
      for (const eventName of events) {
        window.removeEventListener(eventName, markActivity);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      writePendingMs(uid, pendingMsRef.current);
      void flushPending();
    };
  }, [uid]);

  const value = useMemo<ClastoneUsageState>(
    () => ({
      totalClastoneUsageMs,
      pendingClastoneUsageMs,
      lastBatchSentAtMs,
    }),
    [totalClastoneUsageMs, pendingClastoneUsageMs, lastBatchSentAtMs]
  );

  return <ClastoneUsageContext.Provider value={value}>{children}</ClastoneUsageContext.Provider>;
}

export function useClastoneUsage() {
  const ctx = useContext(ClastoneUsageContext);
  if (!ctx) throw new Error('useClastoneUsage must be used within ClastoneUsageProvider');
  return ctx;
}
