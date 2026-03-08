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
  onPersist?: (payload: {
    movies: WatchlistEntry[];
    tv: WatchlistEntry[];
    pendingCount?: number;
    dirtyMovies?: boolean;
    dirtyTv?: boolean;
  }) => Promise<void>;
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

  // Track what was last explicitly saved to calculate diffs.
  const lastSavedStateRef = useRef({ movies, tv });
  const isHydratedRef = useRef(false);

  // We need current values for the strict forceSync
  const currentStateRef = useRef({ movies, tv });
  currentStateRef.current = { movies, tv };

  useEffect(() => {
    // 1. Skip the very first "fresh load" mutation
    if (!isHydratedRef.current) {
      lastSavedStateRef.current = { movies, tv };
      isHydratedRef.current = true;
      return;
    }

    if (!onPersist) return;

    // 2. Diffing
    const dirtyMovies = movies !== lastSavedStateRef.current.movies;
    const dirtyTv = tv !== lastSavedStateRef.current.tv;

    // 3. Early return if no changes
    if (!dirtyMovies && !dirtyTv) {
      return;
    }

    setPendingChanges((p) => p + 1);

    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);

    const savedMovies = movies;
    const savedTv = tv;

    persistTimeoutRef.current = setTimeout(() => {
      onPersist({
        movies: savedMovies,
        tv: savedTv,
        pendingCount: (dirtyMovies ? 1 : 0) + (dirtyTv ? 1 : 0),
        dirtyMovies,
        dirtyTv
      });
      lastSavedStateRef.current = { movies: savedMovies, tv: savedTv };
      setPendingChanges(0);
      persistTimeoutRef.current = null;
    }, 10000); // 10s debounce

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
        const dirtyMovies = currentStateRef.current.movies !== lastSavedStateRef.current.movies;
        const dirtyTv = currentStateRef.current.tv !== lastSavedStateRef.current.tv;

        onPersist({
          ...currentStateRef.current,
          pendingCount: (dirtyMovies ? 1 : 0) + (dirtyTv ? 1 : 0),
          dirtyMovies,
          dirtyTv
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
          const dirtyMovies = currentStateRef.current.movies !== lastSavedStateRef.current.movies;
          const dirtyTv = currentStateRef.current.tv !== lastSavedStateRef.current.tv;

          if (dirtyMovies || dirtyTv) {
            await onPersist({
              ...currentStateRef.current,
              dirtyMovies,
              dirtyTv
            });
            lastSavedStateRef.current = currentStateRef.current;
          }
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
