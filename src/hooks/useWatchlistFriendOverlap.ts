import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { loadWatchlist, type WatchlistData } from '../lib/firestoreWatchlist';

/**
 * Shared state for “watchlist ∩ all selected friends’ watchlists” (same rules as Watchlist page).
 * When `enabled` is false, overlap sets stay null and no Firestore loads run.
 */
export function useWatchlistFriendOverlap(enabled: boolean, myMovieIds: string[], myTvIds: string[]) {
  const [isOverlapModalOpen, setIsOverlapModalOpen] = useState(false);
  const [overlapFriendUids, setOverlapFriendUids] = useState<string[]>([]);
  const [overlapFriendUidsDraft, setOverlapFriendUidsDraft] = useState<string[]>([]);
  const [isLoadingOverlap, setIsLoadingOverlap] = useState(false);
  const [friendWatchlists, setFriendWatchlists] = useState<Record<string, WatchlistData>>({});
  const [friendWatchlistErrors, setFriendWatchlistErrors] = useState<Record<string, true | undefined>>({});

  useEffect(() => {
    if (!enabled || !db) return;
    const active = isOverlapModalOpen ? overlapFriendUidsDraft : overlapFriendUids;
    if (active.length === 0) return;

    const missing = active.filter((uid) => !friendWatchlists[uid]);
    if (missing.length === 0) return;

    let cancelled = false;
    const loadMissing = async () => {
      setIsLoadingOverlap(true);
      try {
        const results = await Promise.all(
          missing.map(async (uid) => {
            try {
              const res = await loadWatchlist(db!, uid);
              return [
                uid,
                {
                  movies: Array.from(res.movies ?? []) as WatchlistData['movies'],
                  tv: Array.from(res.tv ?? []) as WatchlistData['tv'],
                },
              ] as const;
            } catch (err) {
              console.error('[Watchlist overlap] Failed to load friend watchlist', { uid, err });
              setFriendWatchlistErrors((prev) => ({ ...prev, [uid]: true }));
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

    loadMissing();
    return () => {
      cancelled = true;
    };
  }, [enabled, overlapFriendUids, overlapFriendUidsDraft, isOverlapModalOpen, friendWatchlists]);

  const overlapMovieIdSet = useMemo(() => {
    if (!enabled || overlapFriendUids.length === 0) return null;
    const sets = overlapFriendUids
      .map((uid) => friendWatchlists[uid])
      .filter(Boolean)
      .map((w) => new Set(w.movies.map((m) => m.id)));
    if (sets.length === 0) return new Set<string>();
    const out = new Set<string>(sets[0]);
    for (let i = 1; i < sets.length; i++) {
      for (const id of Array.from(out)) {
        if (!sets[i].has(id)) out.delete(id);
      }
    }
    return out;
  }, [enabled, overlapFriendUids, friendWatchlists]);

  const overlapTvIdSet = useMemo(() => {
    if (!enabled || overlapFriendUids.length === 0) return null;
    const sets = overlapFriendUids
      .map((uid) => friendWatchlists[uid])
      .filter(Boolean)
      .map((w) => new Set(w.tv.map((t) => t.id)));
    if (sets.length === 0) return new Set<string>();
    const out = new Set<string>(sets[0]);
    for (let i = 1; i < sets.length; i++) {
      for (const id of Array.from(out)) {
        if (!sets[i].has(id)) out.delete(id);
      }
    }
    return out;
  }, [enabled, overlapFriendUids, friendWatchlists]);

  return {
    isOverlapModalOpen,
    setIsOverlapModalOpen,
    overlapFriendUids,
    setOverlapFriendUids,
    overlapFriendUidsDraft,
    setOverlapFriendUidsDraft,
    isLoadingOverlap,
    friendWatchlists,
    friendWatchlistErrors,
    overlapMovieIdSet,
    overlapTvIdSet,
  };
}
