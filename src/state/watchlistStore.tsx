import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getPersistDebounceMs, subscribePersistDebounce } from '../lib/persistDebounce';
import {
  mergeWatchlistWithIncoming,
  type IncomingWatchRecommendation
} from '../lib/mergeWatchlistRecommendations';

export type WatchlistEntry = {
  id: string;
  title: string;
  posterPath?: string;
  releaseDate?: string;
  /** Populated from friends' incoming recommendation docs (synced in Firestore). */
  recommendedBy?: { uid: string; username?: string }[];
};

export type WatchlistType = 'movies' | 'tv';

type WatchlistStore = {
  movies: WatchlistEntry[];
  tv: WatchlistEntry[];
  watchingNextMovieIds: string[];
  watchingNextTvIds: string[];
  setWatchingNextMovieIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  setWatchingNextTvIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  addToWatchlist: (entry: WatchlistEntry, type: WatchlistType) => void;
  removeFromWatchlist: (id: string) => void;
  reorderWatchlist: (type: WatchlistType, orderedIds: string[]) => void;
  isInWatchlist: (id: string) => boolean;
  /** Manually trigger a save to Firestore. */
  forceSync: () => Promise<void>;
  /** Reconcile `recommendedBy` from active incoming recommendation documents. */
  applyIncomingRecommendations: (incoming: IncomingWatchRecommendation[]) => void;
};

const WatchlistContext = createContext<WatchlistStore | null>(null);

type WatchlistProviderProps = {
  children: React.ReactNode;
  initialMovies?: WatchlistEntry[];
  initialTv?: WatchlistEntry[];
  initialWatchingNextMovieIds?: string[];
  initialWatchingNextTvIds?: string[];
  onPersist?: (payload: {
    movies: WatchlistEntry[];
    tv: WatchlistEntry[];
    watchingNextMovieIds: string[];
    watchingNextTvIds: string[];
    pendingCount?: number;
    dirtyMovies?: boolean;
    dirtyTv?: boolean;
  }) => Promise<void>;
  /**
   * Runs before the entry is removed from state (e.g. delete incoming recommendation Firestore docs).
   * Awaited so the realtime listener does not re-merge the row before deletes finish.
   */
  onBeforeRemoveFromWatchlist?: (args: {
    id: string;
    entry: WatchlistEntry | null;
  }) => Promise<void>;
};

export function WatchlistProvider({
  children,
  initialMovies = [],
  initialTv = [],
  initialWatchingNextMovieIds = [],
  initialWatchingNextTvIds = [],
  onPersist,
  onBeforeRemoveFromWatchlist
}: WatchlistProviderProps) {
  const [movies, setMovies] = useState<WatchlistEntry[]>(initialMovies);
  const [tv, setTv] = useState<WatchlistEntry[]>(initialTv);
  const [watchingNextMovieIds, setWatchingNextMovieIds] = useState<string[]>(initialWatchingNextMovieIds);
  const [watchingNextTvIds, setWatchingNextTvIds] = useState<string[]>(initialWatchingNextTvIds);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [persistDebounceTick, setPersistDebounceTick] = useState(0);

  const [pendingChanges, setPendingChanges] = useState(0);

  useEffect(() => subscribePersistDebounce(() => setPersistDebounceTick((t) => t + 1)), []);

  // Track what was last explicitly saved to calculate diffs.
  const lastSavedStateRef = useRef({
    movies,
    tv,
    watchingNextMovieIds,
    watchingNextTvIds
  });
  const isHydratedRef = useRef(false);

  // We need current values for the strict forceSync
  const currentStateRef = useRef({
    movies,
    tv,
    watchingNextMovieIds,
    watchingNextTvIds
  });
  currentStateRef.current = { movies, tv, watchingNextMovieIds, watchingNextTvIds };

  // Batch refresh on mount to move released movies
  useEffect(() => {
    const refreshReleasedMovies = () => {
      const isUnreleased = (releaseDate?: string): boolean => {
        if (!releaseDate) return false;
        const release = new Date(releaseDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return release > today;
      };

      const isUpcomingRelease = (releaseDate?: string): boolean => {
        if (!releaseDate) return true;
        return isUnreleased(releaseDate);
      };

      const sortReleasedFirst = (entries: WatchlistEntry[]): WatchlistEntry[] => {
        const released: WatchlistEntry[] = [];
        const unreleased: WatchlistEntry[] = [];
        
        entries.forEach(entry => {
          if (isUpcomingRelease(entry.releaseDate)) {
            unreleased.push(entry);
          } else {
            released.push(entry);
          }
        });
        
        // Sort unreleased by release date
        const sortedUnreleased = unreleased.sort((a, b) => {
          const aTime = a.releaseDate ? new Date(a.releaseDate).getTime() : Number.NaN;
          const bTime = b.releaseDate ? new Date(b.releaseDate).getTime() : Number.NaN;
          const aKnown = Number.isFinite(aTime);
          const bKnown = Number.isFinite(bTime);
          if (!aKnown && !bKnown) return 0;
          if (!aKnown) return 1;
          if (!bKnown) return -1;
          return aTime - bTime;
        });
        
        return [...released, ...sortedUnreleased];
      };

      setMovies(prev => {
        const next = sortReleasedFirst(prev);
        if (next.length === prev.length && next.every((entry, idx) => entry.id === prev[idx]?.id)) return prev;
        return next;
      });
      setTv(prev => {
        const next = sortReleasedFirst(prev);
        if (next.length === prev.length && next.every((entry, idx) => entry.id === prev[idx]?.id)) return prev;
        return next;
      });
    };

    // Only run on initial mount after hydration
    if (!isHydratedRef.current) {
      refreshReleasedMovies();
    }
  }, []);

  useEffect(() => {
    const allow = new Set(movies.map((m) => m.id));
    setWatchingNextMovieIds((prev) => {
      const next = prev.filter((id) => allow.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [movies]);

  useEffect(() => {
    const allow = new Set(tv.map((t) => t.id));
    setWatchingNextTvIds((prev) => {
      const next = prev.filter((id) => allow.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [tv]);

  useEffect(() => {
    // 1. Skip the very first "fresh load" mutation
    if (!isHydratedRef.current) {
      lastSavedStateRef.current = {
        movies,
        tv,
        watchingNextMovieIds,
        watchingNextTvIds
      };
      isHydratedRef.current = true;
      return;
    }

    if (!onPersist) return;

    // 2. Diffing
    const dirtyMovies = movies !== lastSavedStateRef.current.movies;
    const dirtyTv = tv !== lastSavedStateRef.current.tv;
    const dirtyWtnM = watchingNextMovieIds !== lastSavedStateRef.current.watchingNextMovieIds;
    const dirtyWtnT = watchingNextTvIds !== lastSavedStateRef.current.watchingNextTvIds;

    // 3. Early return if no changes
    if (!dirtyMovies && !dirtyTv && !dirtyWtnM && !dirtyWtnT) {
      return;
    }

    setPendingChanges((p) => p + 1);

    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);

    const savedMovies = movies;
    const savedTv = tv;
    const savedWtnM = watchingNextMovieIds;
    const savedWtnT = watchingNextTvIds;

    persistTimeoutRef.current = setTimeout(() => {
      const touchMoviesDoc = dirtyMovies || dirtyWtnM;
      const touchTvDoc = dirtyTv || dirtyWtnT;
      onPersist({
        movies: savedMovies,
        tv: savedTv,
        watchingNextMovieIds: savedWtnM,
        watchingNextTvIds: savedWtnT,
        pendingCount: (touchMoviesDoc ? 1 : 0) + (touchTvDoc ? 1 : 0),
        dirtyMovies: touchMoviesDoc,
        dirtyTv: touchTvDoc
      });
      lastSavedStateRef.current = {
        movies: savedMovies,
        tv: savedTv,
        watchingNextMovieIds: savedWtnM,
        watchingNextTvIds: savedWtnT
      };
      setPendingChanges(0);
      persistTimeoutRef.current = null;
    }, getPersistDebounceMs());

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, [movies, tv, watchingNextMovieIds, watchingNextTvIds, onPersist, persistDebounceTick]);

  // Handle browser tab closure / refresh.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (persistTimeoutRef.current && onPersist) {
        const dirtyMovies = currentStateRef.current.movies !== lastSavedStateRef.current.movies;
        const dirtyTv = currentStateRef.current.tv !== lastSavedStateRef.current.tv;
        const dirtyWtnM =
          currentStateRef.current.watchingNextMovieIds !== lastSavedStateRef.current.watchingNextMovieIds;
        const dirtyWtnT =
          currentStateRef.current.watchingNextTvIds !== lastSavedStateRef.current.watchingNextTvIds;
        const touchMoviesDoc = dirtyMovies || dirtyWtnM;
        const touchTvDoc = dirtyTv || dirtyWtnT;

        onPersist({
          ...currentStateRef.current,
          pendingCount: (touchMoviesDoc ? 1 : 0) + (touchTvDoc ? 1 : 0),
          dirtyMovies: touchMoviesDoc,
          dirtyTv: touchTvDoc
        });

        if (pendingChanges > 0) {
          e.preventDefault();
          e.returnValue = 'Saving changes...';
          return e.returnValue;
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [onPersist, pendingChanges]);

  const addToWatchlist = useCallback((entry: WatchlistEntry, type: WatchlistType) => {
    if (type === 'movies') {
      setMovies((prev) => {
        if (prev.some((m) => m.id === entry.id)) return prev;
        return [...prev, entry];
      });
    } else {
      setTv((prev) => {
        if (prev.some((t) => t.id === entry.id)) return prev;
        return [...prev, entry];
      });
    }
  }, []);

  const removeFromWatchlist = useCallback(
    (id: string) => {
      const { movies: m, tv: t } = currentStateRef.current;
      const entry = m.find((e) => e.id === id) ?? t.find((e) => e.id === id) ?? null;
      void (async () => {
        try {
          if (onBeforeRemoveFromWatchlist) {
            await onBeforeRemoveFromWatchlist({ id, entry });
          }
        } catch (e) {
          console.warn('[Clastone] onBeforeRemoveFromWatchlist failed', e);
        }
        setMovies((prev) => prev.filter((e) => e.id !== id));
        setTv((prev) => prev.filter((e) => e.id !== id));
        setWatchingNextMovieIds((prev) => prev.filter((x) => x !== id));
        setWatchingNextTvIds((prev) => prev.filter((x) => x !== id));
      })();
    },
    [onBeforeRemoveFromWatchlist]
  );

  const reorderWatchlist = useCallback((type: WatchlistType, orderedIds: string[]) => {
    if (type === 'movies') {
      setMovies((prev) => {
        if (prev.length !== orderedIds.length) return prev;
        const idToEntry = new Map(prev.map((e) => [e.id, e]));
        const reordered: WatchlistEntry[] = [];
        for (const id of orderedIds) {
          const entry = idToEntry.get(id);
          if (!entry) return prev;
          reordered.push(entry);
        }
        return reordered;
      });
    } else {
      setTv((prev) => {
        if (prev.length !== orderedIds.length) return prev;
        const idToEntry = new Map(prev.map((e) => [e.id, e]));
        const reordered: WatchlistEntry[] = [];
        for (const id of orderedIds) {
          const entry = idToEntry.get(id);
          if (!entry) return prev;
          reordered.push(entry);
        }
        return reordered;
      });
    }
  }, []);

  const isInWatchlist = useCallback(
    (id: string) => movies.some((m) => m.id === id) || tv.some((t) => t.id === id),
    [movies, tv]
  );

  const applyIncomingRecommendations = useCallback((incoming: IncomingWatchRecommendation[]) => {
    const { movies: m, tv: t } = currentStateRef.current;
    const merged = mergeWatchlistWithIncoming(m, t, incoming);
    setMovies(merged.movies);
    setTv(merged.tv);
  }, []);

  const value = useMemo<WatchlistStore>(
    () => ({
      movies,
      tv,
      addToWatchlist,
      removeFromWatchlist,
      reorderWatchlist,
      isInWatchlist,
      applyIncomingRecommendations,
      watchingNextMovieIds,
      watchingNextTvIds,
      setWatchingNextMovieIds,
      setWatchingNextTvIds,
      forceSync: async () => {
        if (onPersist) {
          const dirtyMovies = currentStateRef.current.movies !== lastSavedStateRef.current.movies;
          const dirtyTv = currentStateRef.current.tv !== lastSavedStateRef.current.tv;
          const dirtyWtnM =
            currentStateRef.current.watchingNextMovieIds !== lastSavedStateRef.current.watchingNextMovieIds;
          const dirtyWtnT =
            currentStateRef.current.watchingNextTvIds !== lastSavedStateRef.current.watchingNextTvIds;
          const touchMoviesDoc = dirtyMovies || dirtyWtnM;
          const touchTvDoc = dirtyTv || dirtyWtnT;

          if (touchMoviesDoc || touchTvDoc) {
            await onPersist({
              ...currentStateRef.current,
              dirtyMovies: touchMoviesDoc,
              dirtyTv: touchTvDoc
            });
            lastSavedStateRef.current = { ...currentStateRef.current };
          }
        }
      }
    }),
    [
      movies,
      tv,
      watchingNextMovieIds,
      watchingNextTvIds,
      addToWatchlist,
      removeFromWatchlist,
      reorderWatchlist,
      isInWatchlist,
      applyIncomingRecommendations,
      onPersist,
      onBeforeRemoveFromWatchlist,
      pendingChanges
    ]
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlistStore() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) {
    throw new Error('useWatchlistStore must be used within WatchlistProvider');
  }
  return ctx;
}
