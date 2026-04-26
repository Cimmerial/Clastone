import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from '../lib/firebase';
import { loadWatchlist, type WatchlistData } from '../lib/firestoreWatchlist';

export type FriendOverlapMode = 'overlap' | 'boycott';
export type FriendOverlapModeMap = Record<string, FriendOverlapMode | undefined>;
const FRIEND_MODES_STORAGE_KEY = 'clastone_friend_overlap_modes_v1';
const FRIEND_WATCHLIST_CACHE_KEY = 'clastone_friend_watchlists_cache_v1';
const REFRESH_THROTTLE_MS = 1000;

function isFriendOverlapMode(value: unknown): value is FriendOverlapMode {
  return value === 'overlap' || value === 'boycott';
}

function loadCachedFriendModes(): FriendOverlapModeMap {
  try {
    const raw = localStorage.getItem(FRIEND_MODES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: FriendOverlapModeMap = {};
    for (const [uid, mode] of Object.entries(parsed)) {
      if (isFriendOverlapMode(mode)) next[uid] = mode;
    }
    return next;
  } catch {
    return {};
  }
}

function loadCachedFriendWatchlists(): Record<string, WatchlistData> {
  try {
    const raw = localStorage.getItem(FRIEND_WATCHLIST_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, WatchlistData | undefined>;
    const next: Record<string, WatchlistData> = {};
    for (const [uid, wl] of Object.entries(parsed)) {
      if (!wl || !Array.isArray(wl.movies) || !Array.isArray(wl.tv)) continue;
      next[uid] = {
        movies: wl.movies,
        tv: wl.tv,
      };
    }
    return next;
  } catch {
    return {};
  }
}

/**
 * Shared state for friend watchlist filtering.
 * - overlap: keep only titles that are also on that friend's watchlist
 * - boycott: remove titles that are on that friend's watchlist
 * When `enabled` is false, overlap sets stay null and no Firestore loads run.
 */
export function useWatchlistFriendOverlap(
  enabled: boolean,
  friendUids: string[],
  myMovieIds: string[],
  myTvIds: string[]
) {
  const [isOverlapModalOpen, setIsOverlapModalOpen] = useState(false);
  const [friendModes, setFriendModes] = useState<FriendOverlapModeMap>(() => loadCachedFriendModes());
  const [friendModesDraft, setFriendModesDraft] = useState<FriendOverlapModeMap>({});
  const [isLoadingOverlap, setIsLoadingOverlap] = useState(false);
  const [friendWatchlists, setFriendWatchlists] = useState<Record<string, WatchlistData>>(() => loadCachedFriendWatchlists());
  const [friendWatchlistErrors, setFriendWatchlistErrors] = useState<Record<string, true | undefined>>({});
  const [refreshingFriendUids, setRefreshingFriendUids] = useState<Record<string, true | undefined>>({});
  const lastRefreshAtMsRef = useRef<Record<string, number>>({});
  const refreshTimersRef = useRef<Record<string, number | undefined>>({});

  const fetchFriendWatchlist = useCallback(async (uid: string): Promise<WatchlistData> => {
    if (!db) return { movies: [], tv: [] };
    const res = await loadWatchlist(db, uid);
    return {
      movies: Array.from(res.movies ?? []) as WatchlistData['movies'],
      tv: Array.from(res.tv ?? []) as WatchlistData['tv'],
    };
  }, []);

  useEffect(() => {
    const allowed = new Set(friendUids);
    setFriendModes((prev) => {
      const next: FriendOverlapModeMap = {};
      let changed = false;
      for (const [uid, mode] of Object.entries(prev)) {
        if (!allowed.has(uid) || !isFriendOverlapMode(mode)) {
          changed = true;
          continue;
        }
        next[uid] = mode;
      }
      return changed ? next : prev;
    });
    setFriendModesDraft((prev) => {
      const next: FriendOverlapModeMap = {};
      let changed = false;
      for (const [uid, mode] of Object.entries(prev)) {
        if (!allowed.has(uid) || !isFriendOverlapMode(mode)) {
          changed = true;
          continue;
        }
        next[uid] = mode;
      }
      return changed ? next : prev;
    });
  }, [friendUids]);

  useEffect(() => {
    try {
      localStorage.setItem(FRIEND_MODES_STORAGE_KEY, JSON.stringify(friendModes));
    } catch {
      /* ignore cache write errors */
    }
  }, [friendModes]);

  useEffect(() => {
    try {
      localStorage.setItem(FRIEND_WATCHLIST_CACHE_KEY, JSON.stringify(friendWatchlists));
    } catch {
      /* ignore cache write errors */
    }
  }, [friendWatchlists]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(refreshTimersRef.current)) {
        if (timerId != null) window.clearTimeout(timerId);
      }
    };
  }, []);

  const runRefreshFriendWatchlist = useCallback(
    async (uid: string) => {
      if (!enabled || !db) return;
      lastRefreshAtMsRef.current[uid] = Date.now();
      setRefreshingFriendUids((prev) => ({ ...prev, [uid]: true }));
      setIsLoadingOverlap(true);
      setFriendWatchlistErrors((prev) => ({ ...prev, [uid]: undefined }));
      try {
        const data = await fetchFriendWatchlist(uid);
        setFriendWatchlists((prev) => ({ ...prev, [uid]: data }));
      } catch (err) {
        console.error('[Watchlist overlap] Failed to refresh friend watchlist', { uid, err });
        setFriendWatchlistErrors((prev) => ({ ...prev, [uid]: true }));
      } finally {
        setRefreshingFriendUids((prev) => ({ ...prev, [uid]: undefined }));
        setIsLoadingOverlap(false);
      }
    },
    [enabled, db, fetchFriendWatchlist]
  );

  const refreshFriendWatchlist = useCallback(
    async (uid: string) => {
      if (!enabled || !db) return;
      const now = Date.now();
      const lastAt = lastRefreshAtMsRef.current[uid] ?? 0;
      const elapsed = now - lastAt;

      if (elapsed >= REFRESH_THROTTLE_MS) {
        await runRefreshFriendWatchlist(uid);
        return;
      }

      if (refreshTimersRef.current[uid] != null) return;

      const waitMs = REFRESH_THROTTLE_MS - elapsed;
      refreshTimersRef.current[uid] = window.setTimeout(() => {
        refreshTimersRef.current[uid] = undefined;
        void runRefreshFriendWatchlist(uid);
      }, waitMs);
    },
    [enabled, db, runRefreshFriendWatchlist]
  );

  useEffect(() => {
    if (!enabled || !db) return;
    if (!isOverlapModalOpen) return;
    if (friendUids.length === 0) return;
    const missing = friendUids.filter((uid) => !friendWatchlists[uid]);
    if (missing.length === 0) return;

    let cancelled = false;
    const preloadAllFriends = async () => {
      setIsLoadingOverlap(true);
      try {
        const results = await Promise.all(
          missing.map(async (uid) => {
            try {
              const data = await fetchFriendWatchlist(uid);
              return [uid, data] as const;
            } catch (err) {
              console.error('[Watchlist overlap] Failed to load friend watchlist', { uid, err });
              if (!cancelled) setFriendWatchlistErrors((prev) => ({ ...prev, [uid]: true }));
              return [uid, { movies: [] as WatchlistData['movies'], tv: [] as WatchlistData['tv'] }] as const;
            }
          })
        );
        if (cancelled) return;
        setFriendWatchlists((prev) => {
          const next = { ...prev };
          for (const [uid, data] of results) next[uid] = data;
          return next;
        });
      } finally {
        if (!cancelled) setIsLoadingOverlap(false);
      }
    };

    preloadAllFriends();
    return () => {
      cancelled = true;
    };
  }, [enabled, isOverlapModalOpen, friendUids, friendWatchlists, fetchFriendWatchlist]);

  useEffect(() => {
    if (!enabled || !db) return;
    const activeUids = Object.entries(friendModes)
      .filter(([, mode]) => mode === 'overlap' || mode === 'boycott')
      .map(([uid]) => uid);
    if (activeUids.length === 0) return;

    const missingActive = activeUids.filter((uid) => !friendWatchlists[uid]);
    if (missingActive.length === 0) return;

    let cancelled = false;
    const hydrateActiveFriends = async () => {
      setIsLoadingOverlap(true);
      try {
        const results = await Promise.all(
          missingActive.map(async (uid) => {
            try {
              const data = await fetchFriendWatchlist(uid);
              return [uid, data] as const;
            } catch (err) {
              console.error('[Watchlist overlap] Failed to hydrate active friend watchlist', { uid, err });
              if (!cancelled) setFriendWatchlistErrors((prev) => ({ ...prev, [uid]: true }));
              return [uid, { movies: [] as WatchlistData['movies'], tv: [] as WatchlistData['tv'] }] as const;
            }
          })
        );
        if (cancelled) return;
        setFriendWatchlists((prev) => {
          const next = { ...prev };
          for (const [uid, data] of results) next[uid] = data;
          return next;
        });
      } finally {
        if (!cancelled) setIsLoadingOverlap(false);
      }
    };
    hydrateActiveFriends();
    return () => {
      cancelled = true;
    };
  }, [enabled, db, friendModes, friendWatchlists, fetchFriendWatchlist]);

  const overlapMovieIdSet = useMemo(() => {
    if (!enabled) return null;
    const activeEntries = Object.entries(friendModes).filter(([, mode]) => mode === 'overlap' || mode === 'boycott');
    if (activeEntries.length === 0) return null;

    const overlapUids = activeEntries.filter(([, mode]) => mode === 'overlap').map(([uid]) => uid);
    const boycottUids = activeEntries.filter(([, mode]) => mode === 'boycott').map(([uid]) => uid);

    let out: Set<string> | null = null;

    if (overlapUids.length > 0) {
      const sets = overlapUids
        .map((uid) => friendWatchlists[uid])
        .filter(Boolean)
        .map((w) => new Set(w.movies.map((m) => m.id)));
      if (sets.length === 0) return new Set<string>();
      out = new Set<string>(sets[0]);
      for (let i = 1; i < sets.length; i++) {
        for (const id of Array.from(out)) {
          if (!sets[i].has(id)) out.delete(id);
        }
      }
    }

    if (boycottUids.length > 0) {
      const boycottIds = new Set<string>();
      for (const uid of boycottUids) {
        const wl = friendWatchlists[uid];
        if (!wl) continue;
        for (const m of wl.movies) boycottIds.add(m.id);
      }
      const base = out ?? null;
      if (base) {
        for (const id of boycottIds) base.delete(id);
        return base;
      }
      const include = new Set<string>(myMovieIds);
      for (const id of boycottIds) include.delete(id);
      return include;
    }

    return out ?? null;
  }, [enabled, friendModes, friendWatchlists, myMovieIds]);

  const overlapTvIdSet = useMemo(() => {
    if (!enabled) return null;
    const activeEntries = Object.entries(friendModes).filter(([, mode]) => mode === 'overlap' || mode === 'boycott');
    if (activeEntries.length === 0) return null;

    const overlapUids = activeEntries.filter(([, mode]) => mode === 'overlap').map(([uid]) => uid);
    const boycottUids = activeEntries.filter(([, mode]) => mode === 'boycott').map(([uid]) => uid);

    let out: Set<string> | null = null;

    if (overlapUids.length > 0) {
      const sets = overlapUids
        .map((uid) => friendWatchlists[uid])
        .filter(Boolean)
        .map((w) => new Set(w.tv.map((t) => t.id)));
      if (sets.length === 0) return new Set<string>();
      out = new Set<string>(sets[0]);
      for (let i = 1; i < sets.length; i++) {
        for (const id of Array.from(out)) {
          if (!sets[i].has(id)) out.delete(id);
        }
      }
    }

    if (boycottUids.length > 0) {
      const boycottIds = new Set<string>();
      for (const uid of boycottUids) {
        const wl = friendWatchlists[uid];
        if (!wl) continue;
        for (const t of wl.tv) boycottIds.add(t.id);
      }
      const base = out ?? null;
      if (base) {
        for (const id of boycottIds) base.delete(id);
        return base;
      }
      const include = new Set<string>(myTvIds);
      for (const id of boycottIds) include.delete(id);
      return include;
    }

    return out ?? null;
  }, [enabled, friendModes, friendWatchlists, myTvIds]);

  return {
    isOverlapModalOpen,
    setIsOverlapModalOpen,
    friendModes,
    setFriendModes,
    friendModesDraft,
    setFriendModesDraft,
    isLoadingOverlap,
    friendWatchlists,
    friendWatchlistErrors,
    refreshingFriendUids,
    refreshFriendWatchlist,
    overlapMovieIdSet,
    overlapTvIdSet,
  };
}
