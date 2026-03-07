import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type WatchlistEntry = {
  id: string;
  title: string;
  posterPath?: string;
  releaseDate?: string;
};

export type WatchlistType = 'movies' | 'tv';

type WatchlistStore = {
  movies: WatchlistEntry[];
  tv: WatchlistEntry[];
  addToWatchlist: (entry: WatchlistEntry, type: WatchlistType) => void;
  removeFromWatchlist: (id: string) => void;
  reorderWatchlist: (type: WatchlistType, orderedIds: string[]) => void;
  isInWatchlist: (id: string) => boolean;
  /** Manually trigger a save to Firestore. */
  forceSync: () => Promise<void>;
};

const WatchlistContext = createContext<WatchlistStore | null>(null);

type WatchlistProviderProps = {
  children: React.ReactNode;
  initialMovies?: WatchlistEntry[];
  initialTv?: WatchlistEntry[];
  onPersist?: (payload: { movies: WatchlistEntry[]; tv: WatchlistEntry[]; pendingCount?: number }) => Promise<void>;
};

export function WatchlistProvider({
  children,
  initialMovies = [],
  initialTv = [],
  onPersist
}: WatchlistProviderProps) {
  const [movies, setMovies] = useState<WatchlistEntry[]>(initialMovies);
  const [tv, setTv] = useState<WatchlistEntry[]>(initialTv);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pendingChanges, setPendingChanges] = useState(0);
  const lastStateRef = useRef({ movies, tv });
  lastStateRef.current = { movies, tv };

  useEffect(() => {
    if (!onPersist) return;
    setPendingChanges((p) => p + 1);
    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);

    persistTimeoutRef.current = setTimeout(() => {
      onPersist({ ...lastStateRef.current, pendingCount: pendingChanges });
      setPendingChanges(0);
      persistTimeoutRef.current = null;
    }, 600);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, [movies, tv, onPersist]);

  // Handle browser tab closure / refresh.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (persistTimeoutRef.current && onPersist) {
        onPersist({ ...lastStateRef.current, pendingCount: pendingChanges });
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

  const removeFromWatchlist = useCallback((id: string) => {
    setMovies((prev) => prev.filter((m) => m.id !== id));
    setTv((prev) => prev.filter((t) => t.id !== id));
  }, []);

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

  const value = useMemo<WatchlistStore>(
    () => ({
      movies,
      tv,
      addToWatchlist,
      removeFromWatchlist,
      reorderWatchlist,
      isInWatchlist,
      forceSync: async () => {
        if (onPersist) {
          await onPersist({ ...lastStateRef.current, pendingCount: pendingChanges });
        }
      }
    }),
    [movies, tv, addToWatchlist, removeFromWatchlist, reorderWatchlist, isInWatchlist, onPersist, pendingChanges]
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
