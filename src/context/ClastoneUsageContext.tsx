import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { doc, increment, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const IDLE_TIMEOUT_MS = 30_000;
const FLUSH_INTERVAL_MS = 5 * 60_000;
const TICK_MS = 1_000;

export type UsageInfoClickKind = 'tv' | 'movie' | 'person';

type PendingInfoCounts = { tv: number; movie: number; person: number };

function emptyPendingInfo(): PendingInfoCounts {
  return { tv: 0, movie: 0, person: 0 };
}

export type ClastoneUsageState = {
  totalClastoneUsageMs: number;
  pendingClastoneUsageMs: number;
  lastBatchSentAtMs: number | null;
  totalInfoShowClicks: number;
  pendingInfoShowClicks: number;
  totalInfoMovieClicks: number;
  pendingInfoMovieClicks: number;
  totalInfoPersonClicks: number;
  pendingInfoPersonClicks: number;
  recordInfoClick: (kind: UsageInfoClickKind) => void;
};

const ClastoneUsageContext = createContext<ClastoneUsageState | null>(null);

function getPendingKey(uid: string): string {
  return `clastone:usage:pending:${uid}`;
}

function getPendingInfoKey(uid: string): string {
  return `clastone:usage:pendingInfo:${uid}`;
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

function normalizePositiveInt(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function readPendingInfo(uid: string): PendingInfoCounts {
  if (typeof window === 'undefined') return emptyPendingInfo();
  const raw = window.localStorage.getItem(getPendingInfoKey(uid));
  if (!raw) return emptyPendingInfo();
  try {
    const parsed = JSON.parse(raw) as Partial<PendingInfoCounts>;
    return {
      tv: normalizePositiveInt(parsed.tv),
      movie: normalizePositiveInt(parsed.movie),
      person: normalizePositiveInt(parsed.person),
    };
  } catch {
    return emptyPendingInfo();
  }
}

function writePendingInfo(uid: string, counts: PendingInfoCounts): void {
  if (typeof window === 'undefined') return;
  const tv = Math.max(0, Math.floor(counts.tv));
  const movie = Math.max(0, Math.floor(counts.movie));
  const person = Math.max(0, Math.floor(counts.person));
  if (tv === 0 && movie === 0 && person === 0) {
    window.localStorage.removeItem(getPendingInfoKey(uid));
    return;
  }
  window.localStorage.setItem(getPendingInfoKey(uid), JSON.stringify({ tv, movie, person }));
}

function sumPendingInfo(c: PendingInfoCounts): number {
  return c.tv + c.movie + c.person;
}

export function ClastoneUsageProvider({
  uid,
  initialTotalMs,
  initialInfoShowClicks = 0,
  initialInfoMovieClicks = 0,
  initialInfoPersonClicks = 0,
  children,
}: {
  uid: string;
  initialTotalMs: number;
  initialInfoShowClicks?: number;
  initialInfoMovieClicks?: number;
  initialInfoPersonClicks?: number;
  children: React.ReactNode;
}) {
  const initialFromServer = Number.isFinite(initialTotalMs) ? Math.max(0, Math.floor(initialTotalMs)) : 0;
  const initialShow = normalizePositiveInt(initialInfoShowClicks);
  const initialMovie = normalizePositiveInt(initialInfoMovieClicks);
  const initialPerson = normalizePositiveInt(initialInfoPersonClicks);

  const recoveredPending = readPendingMs(uid);
  const recoveredInfo = readPendingInfo(uid);

  const [totalClastoneUsageMs, setTotalClastoneUsageMs] = useState(initialFromServer + recoveredPending);
  const [pendingClastoneUsageMs, setPendingClastoneUsageMs] = useState(recoveredPending);
  const [lastBatchSentAtMs, setLastBatchSentAtMs] = useState<number | null>(null);

  const [totalInfoShowClicks, setTotalInfoShowClicks] = useState(initialShow + recoveredInfo.tv);
  const [pendingInfoShowClicks, setPendingInfoShowClicks] = useState(recoveredInfo.tv);
  const [totalInfoMovieClicks, setTotalInfoMovieClicks] = useState(initialMovie + recoveredInfo.movie);
  const [pendingInfoMovieClicks, setPendingInfoMovieClicks] = useState(recoveredInfo.movie);
  const [totalInfoPersonClicks, setTotalInfoPersonClicks] = useState(initialPerson + recoveredInfo.person);
  const [pendingInfoPersonClicks, setPendingInfoPersonClicks] = useState(recoveredInfo.person);

  const confirmedServerMsRef = useRef(initialFromServer);
  const pendingMsRef = useRef(recoveredPending);
  const confirmedInfoRef = useRef({ tv: initialShow, movie: initialMovie, person: initialPerson });
  const pendingInfoRef = useRef<PendingInfoCounts>({ ...recoveredInfo });

  const lastTickAtRef = useRef(Date.now());
  const lastActivityAtRef = useRef(Date.now());
  const activeRef = useRef(true);
  const flushingRef = useRef(false);
  const lastFlushAttemptAtRef = useRef(0);

  const bumpDisplay = useCallback(() => {
    setTotalClastoneUsageMs(confirmedServerMsRef.current + pendingMsRef.current);
    setPendingClastoneUsageMs(pendingMsRef.current);
    setTotalInfoShowClicks(confirmedInfoRef.current.tv + pendingInfoRef.current.tv);
    setPendingInfoShowClicks(pendingInfoRef.current.tv);
    setTotalInfoMovieClicks(confirmedInfoRef.current.movie + pendingInfoRef.current.movie);
    setPendingInfoMovieClicks(pendingInfoRef.current.movie);
    setTotalInfoPersonClicks(confirmedInfoRef.current.person + pendingInfoRef.current.person);
    setPendingInfoPersonClicks(pendingInfoRef.current.person);
  }, []);

  useEffect(() => {
    confirmedServerMsRef.current = initialFromServer;
    setTotalClastoneUsageMs(initialFromServer + pendingMsRef.current);
  }, [initialFromServer]);

  useEffect(() => {
    confirmedInfoRef.current.tv = initialShow;
    confirmedInfoRef.current.movie = initialMovie;
    confirmedInfoRef.current.person = initialPerson;
    bumpDisplay();
  }, [initialShow, initialMovie, initialPerson, bumpDisplay]);

  const recordInfoClick = useCallback(
    (kind: UsageInfoClickKind) => {
      if (kind === 'tv') pendingInfoRef.current.tv += 1;
      else if (kind === 'movie') pendingInfoRef.current.movie += 1;
      else pendingInfoRef.current.person += 1;
      writePendingInfo(uid, pendingInfoRef.current);
      bumpDisplay();
    },
    [uid, bumpDisplay]
  );

  useEffect(() => {
    const flushPending = async () => {
      if (!db || flushingRef.current) return;
      const snapshotPending = pendingMsRef.current;
      const snapshotInfo: PendingInfoCounts = {
        tv: pendingInfoRef.current.tv,
        movie: pendingInfoRef.current.movie,
        person: pendingInfoRef.current.person,
      };
      if (snapshotPending <= 0 && sumPendingInfo(snapshotInfo) <= 0) return;

      flushingRef.current = true;
      lastFlushAttemptAtRef.current = Date.now();
      try {
        const usage: Record<string, unknown> = {
          lastActiveFlushAt: new Date().toISOString(),
        };
        if (snapshotPending > 0) {
          usage.clastoneActiveMs = increment(snapshotPending);
        }
        if (snapshotInfo.tv > 0) {
          usage.infoShowClicks = increment(snapshotInfo.tv);
        }
        if (snapshotInfo.movie > 0) {
          usage.infoMovieClicks = increment(snapshotInfo.movie);
        }
        if (snapshotInfo.person > 0) {
          usage.infoPersonClicks = increment(snapshotInfo.person);
        }

        await setDoc(
          doc(db, 'users', uid),
          {
            usage,
          },
          { merge: true }
        );

        if (snapshotPending > 0) {
          confirmedServerMsRef.current += snapshotPending;
          pendingMsRef.current = Math.max(0, pendingMsRef.current - snapshotPending);
          writePendingMs(uid, pendingMsRef.current);
        }
        if (snapshotInfo.tv > 0) {
          confirmedInfoRef.current.tv += snapshotInfo.tv;
          pendingInfoRef.current.tv = Math.max(0, pendingInfoRef.current.tv - snapshotInfo.tv);
        }
        if (snapshotInfo.movie > 0) {
          confirmedInfoRef.current.movie += snapshotInfo.movie;
          pendingInfoRef.current.movie = Math.max(0, pendingInfoRef.current.movie - snapshotInfo.movie);
        }
        if (snapshotInfo.person > 0) {
          confirmedInfoRef.current.person += snapshotInfo.person;
          pendingInfoRef.current.person = Math.max(0, pendingInfoRef.current.person - snapshotInfo.person);
        }
        writePendingInfo(uid, pendingInfoRef.current);
        setLastBatchSentAtMs(Date.now());
        bumpDisplay();
      } catch {
        writePendingMs(uid, pendingMsRef.current);
        writePendingInfo(uid, pendingInfoRef.current);
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
      writePendingInfo(uid, pendingInfoRef.current);
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
      writePendingInfo(uid, pendingInfoRef.current);
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

      const hasPendingUsage = pendingMsRef.current > 0 || sumPendingInfo(pendingInfoRef.current) > 0;
      const shouldHeartbeatFlush = hasPendingUsage && now - lastFlushAttemptAtRef.current >= FLUSH_INTERVAL_MS;
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
      writePendingInfo(uid, pendingInfoRef.current);
      void flushPending();
    };
  }, [uid, bumpDisplay]);

  const value = useMemo<ClastoneUsageState>(
    () => ({
      totalClastoneUsageMs,
      pendingClastoneUsageMs,
      lastBatchSentAtMs,
      totalInfoShowClicks,
      pendingInfoShowClicks,
      totalInfoMovieClicks,
      pendingInfoMovieClicks,
      totalInfoPersonClicks,
      pendingInfoPersonClicks,
      recordInfoClick,
    }),
    [
      totalClastoneUsageMs,
      pendingClastoneUsageMs,
      lastBatchSentAtMs,
      totalInfoShowClicks,
      pendingInfoShowClicks,
      totalInfoMovieClicks,
      pendingInfoMovieClicks,
      totalInfoPersonClicks,
      pendingInfoPersonClicks,
      recordInfoClick,
    ]
  );

  return <ClastoneUsageContext.Provider value={value}>{children}</ClastoneUsageContext.Provider>;
}

export function useClastoneUsage() {
  const ctx = useContext(ClastoneUsageContext);
  if (!ctx) throw new Error('useClastoneUsage must be used within ClastoneUsageProvider');
  return ctx;
}
