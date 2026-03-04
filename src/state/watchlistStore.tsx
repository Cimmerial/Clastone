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
};

const WatchlistContext = createContext<WatchlistStore | null>(null);

type WatchlistProviderProps = {
  children: React.ReactNode;
  initialMovies?: WatchlistEntry[];
  initialTv?: WatchlistEntry[];
  onPersist?: (payload: { movies: WatchlistEntry[]; tv: WatchlistEntry[] }) => void;
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

  useEffect(() => {
    if (!onPersist) return;
    persistTimeoutRef.current = setTimeout(() => {
      onPersist({ movies, tv });
    }, 400);
    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
      onPersist({ movies, tv });
    };
  }, [movies, tv, onPersist]);

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
      isInWatchlist
    }),
    [movies, tv, addToWatchlist, removeFromWatchlist, reorderWatchlist, isInWatchlist]
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
