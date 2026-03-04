import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { MovieShowItem, WatchRecord, WatchRecordType } from '../components/EntryRowMovieShow';
import type { ClassKey } from '../components/RankedList';
import type { TmdbMovieCache } from '../lib/tmdb';
import { movieClasses, moviesByClass as initialMoviesByClass } from '../mock/movies';

function dateParts(r: WatchRecord, useEnd = false): { y: number; m: number; d: number } {
  const y = useEnd ? (r.endYear ?? r.year ?? 0) : (r.year ?? 0);
  const m = useEnd ? (r.endMonth ?? r.month ?? 0) : (r.month ?? 0);
  const d = useEnd ? (r.endDay ?? r.day ?? 0) : (r.day ?? 0);
  return { y, m, d };
}

function formatWatchLabel(r: WatchRecord): string {
  const t = r.type ?? 'DATE';
  switch (t) {
    case 'DNF': {
      const { y, m, d } = dateParts(r, false);
      if (y > 0) return `DNF (started ${[y, m || null, d || null].filter(Boolean).join('-')})`;
      return 'DNF';
    }
    case 'LONG_AGO':
      return 'Long ago';
    case 'UNKNOWN':
      return 'Unknown';
    case 'RANGE': {
      const start = dateParts(r, false);
      const end = dateParts(r, true);
      if (start.y === 0 && end.y === 0) return 'Range';
      const endStr = [end.y, end.m || null, end.d || null].filter(Boolean).join('-');
      if (start.y === end.y && start.m === end.m && start.d === end.d) return endStr;
      const startStr = [start.y, start.m || null, start.d || null].filter(Boolean).join('-');
      return `${startStr} – ${endStr}`;
    }
    case 'DATE':
    default: {
      const { y, m, d } = dateParts(r, false);
      if (y === 0) return 'Date';
      const parts = [String(y)];
      if (m) parts.unshift(String(m).padStart(2, '0'));
      if (d) parts.unshift(String(d).padStart(2, '0'));
      return parts.join('-');
    }
  }
}

/** Sort key for "most recent first": dated/DNF (by start) first, LONG_AGO/UNKNOWN last. */
function recordSortKey(r: WatchRecord): string {
  const t = r.type ?? 'DATE';
  if (t === 'DATE') {
    const { y, m, d } = dateParts(r, false);
    return `${y}-${String(m || 0).padStart(2, '0')}-${String(d || 0).padStart(2, '0')}`;
  }
  if (t === 'RANGE') {
    const { y, m, d } = dateParts(r, true);
    return `${y}-${String(m || 0).padStart(2, '0')}-${String(d || 0).padStart(2, '0')}`;
  }
  if (t === 'DNF' && (r.year ?? 0) > 0) {
    const { y, m, d } = dateParts(r, false);
    return `${y}-${String(m || 0).padStart(2, '0')}-${String(d || 0).padStart(2, '0')}`;
  }
  return '0000-00-00';
}

function sortRecordsByRecency(records: WatchRecord[]): WatchRecord[] {
  return [...records].sort((a, b) => recordSortKey(b).localeCompare(recordSortKey(a)));
}

export function formatDuration(totalMinutes: number): string {
  const m = Math.round(totalMinutes);
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m total`;
  if (min === 0) return `${h}h total`;
  return `${h}h ${min}m total`;
}

/** Total watch minutes from records + runtime (for class totals). */
export function getTotalMinutesFromRecords(
  records: WatchRecord[],
  runtimeMinutes?: number
): number {
  const runtime = runtimeMinutes ?? 0;
  let total = 0;
  for (const r of records) {
    const t = r.type ?? 'DATE';
    if (t === 'DATE' || t === 'RANGE' || t === 'LONG_AGO' || t === 'UNKNOWN') {
      total += runtime;
    } else if (t === 'DNF') {
      const pct = Math.min(100, Math.max(0, r.dnfPercent ?? 0));
      total += (pct / 100) * runtime;
    }
  }
  return total;
}

export function formatViewingFromRecords(
  records: WatchRecord[],
  runtimeMinutes?: number
): { viewingDates: string; percentCompleted: string; watchTime: string } {
  if (records.length === 0) {
    return { viewingDates: 'No watches', percentCompleted: '', watchTime: '' };
  }
  const sorted = sortRecordsByRecency(records);
  const n = sorted.length;
  const lastStr = formatWatchLabel(sorted[0]);
  const runtime = runtimeMinutes ?? 0;
  let pctSum = 0;
  let totalMins = 0;
  for (const r of records) {
    const t = r.type ?? 'DATE';
    if (t === 'DATE' || t === 'RANGE') {
      pctSum += 100;
      totalMins += runtime;
    } else if (t === 'LONG_AGO' || t === 'UNKNOWN') {
      pctSum += 100;
      totalMins += runtime;
    } else if (t === 'DNF') {
      const percent = Math.min(100, Math.max(0, r.dnfPercent ?? 0));
      pctSum += percent;
      totalMins += (percent / 100) * runtime;
    }
  }
  const pct = `${Math.round(pctSum)}%`;
  const watchTime = totalMins > 0 ? formatDuration(totalMins) : '';
  const viewingDates =
    `Watched ${n}× · Last: ${lastStr} · ${pct}` + (watchTime ? ` · ${watchTime}` : '');
  return { viewingDates, percentCompleted: pct, watchTime };
}

type MoviesStore = {
  classOrder: ClassKey[];
  byClass: Record<ClassKey, MovieShowItem[]>;
  moveWithinClass: (itemId: string, delta: number) => void;
  moveToOtherClass: (itemId: string, deltaClass: number) => void;
  addMovieFromSearch: (
    item: Pick<MovieShowItem, 'id' | 'title'> & {
      subtitle?: string;
      classKey: ClassKey;
      firstWatch?: WatchRecord;
      runtimeMinutes?: number;
      posterPath?: string;
      /** Full cache from TMDB so we don't need to re-fetch on load. */
      cache?: TmdbMovieCache;
    }
  ) => void;
  addWatchToMovie: (itemId: string, watch: WatchRecord, options?: { posterPath?: string }) => void;
  updateMovieWatchRecords: (itemId: string, records: WatchRecord[]) => void;
  setMovieRuntime: (itemId: string, runtimeMinutes: number) => void;
  /** Merge cached TMDB data onto an existing entry (e.g. when adding a watch we fetch details). */
  updateMovieCache: (itemId: string, cache: Partial<TmdbMovieCache>) => void;
  getMovieById: (id: string) => MovieShowItem | null;
};

const MoviesContext = createContext<MoviesStore | null>(null);

type MoviesProviderProps = {
  children: React.ReactNode;
  /** Hydrate from Firestore (when user logs in). */
  initialByClass?: Record<ClassKey, MovieShowItem[]>;
  /** Persist to Firestore when byClass changes (debounced). */
  onPersist?: (byClass: Record<ClassKey, MovieShowItem[]>) => void;
};

export function MoviesProvider({ children, initialByClass, onPersist }: MoviesProviderProps) {
  const [byClass, setByClass] = useState<Record<ClassKey, MovieShowItem[]>>(
    initialByClass ?? initialMoviesByClass
  );
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!onPersist) return;
    persistTimeoutRef.current = setTimeout(() => {
      onPersist(byClass);
    }, 400);
    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
      onPersist(byClass);
    };
  }, [byClass, onPersist]);

  const moveWithinClass = useCallback((itemId: string, delta: number) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      for (const classKey of movieClasses) {
        const list = next[classKey];
        if (!list) continue;
        const index = list.findIndex((m) => m.id === itemId);
        if (index === -1) continue;
        const newIndex = index + delta;
        if (newIndex < 0 || newIndex >= list.length) {
          return prev;
        }
        const copy = [...list];
        const [moved] = copy.splice(index, 1);
        copy.splice(newIndex, 0, moved);
        next[classKey] = copy;
        return next;
      }
      return prev;
    });
  }, []);

  const moveToOtherClass = useCallback((itemId: string, deltaClass: number) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      let fromKey: ClassKey | null = null;
      let item: MovieShowItem | null = null;

      for (const classKey of movieClasses) {
        const list = next[classKey];
        if (!list) continue;
        const index = list.findIndex((m) => m.id === itemId);
        if (index !== -1) {
          fromKey = classKey;
          const copy = [...list];
          [item] = copy.splice(index, 1);
          next[classKey] = copy;
          break;
        }
      }

      if (!fromKey || !item) return prev;

      const fromIndex = movieClasses.indexOf(fromKey);
      const toIndex = fromIndex + deltaClass;
      if (toIndex < 0 || toIndex >= movieClasses.length) {
        return prev;
      }

      const toKey = movieClasses[toIndex];
      const targetList = next[toKey] ?? [];
      const updated = { ...item, classKey: toKey as MovieShowItem['classKey'] };

      // Moving to "lower" class (downwards in the list) -> insert at top.
      // Moving to "higher" class (upwards) -> append to bottom.
      if (deltaClass > 0) {
        next[toKey] = [updated, ...targetList];
      } else {
        next[toKey] = [...targetList, updated];
      }
      return next;
    });
  }, []);

  const addMovieFromSearch = useCallback(
    (
      incoming: Pick<MovieShowItem, 'id' | 'title'> & {
        subtitle?: string;
        classKey: ClassKey;
        firstWatch?: WatchRecord;
        runtimeMinutes?: number;
        posterPath?: string;
        cache?: TmdbMovieCache;
      }
    ) => {
      setByClass((prev) => {
        const alreadyExists = Object.values(prev).some((list) =>
          list.some((m) => m.id === incoming.id)
        );
        if (alreadyExists) return prev;

        const cache = incoming.cache;
        const toKey = incoming.classKey;
        const watchRecords: WatchRecord[] = incoming.firstWatch
          ? [{ ...incoming.firstWatch, id: incoming.firstWatch.id || crypto.randomUUID() }]
          : [];
        const runtime = cache?.runtimeMinutes ?? incoming.runtimeMinutes;
        const { viewingDates, percentCompleted, watchTime } = formatViewingFromRecords(
          watchRecords,
          runtime
        );
        const base: MovieShowItem = {
          id: incoming.id,
          classKey: toKey,
          percentileRank: '—',
          absoluteRank: '—',
          rankInClass: `Unranked`,
          title: cache?.title ?? incoming.title,
          viewingDates: watchRecords.length > 0 ? viewingDates : incoming.subtitle ?? 'Recorded watch',
          percentCompleted,
          watchTime: watchTime || undefined,
          watchRecords,
          runtimeMinutes: runtime,
          posterPath: cache?.posterPath ?? incoming.posterPath,
          topCastNames: cache?.cast?.map((c) => c.name) ?? [],
          stickerTags: [],
          tmdbId: cache?.tmdbId,
          backdropPath: cache?.backdropPath,
          overview: cache?.overview,
          releaseDate: cache?.releaseDate,
          cast: cache?.cast,
          directors: cache?.directors
        };

        const targetList = prev[toKey] ?? [];
        return { ...prev, [toKey]: [base, ...targetList] };
      });
    },
    []
  );

  const updateMovieCache = useCallback((itemId: string, cache: Partial<TmdbMovieCache>) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      for (const classKey of movieClasses) {
        const list = next[classKey] ?? [];
        const idx = list.findIndex((m) => m.id === itemId);
        if (idx === -1) continue;
        const item = list[idx];
        next[classKey] = list.map((m, i) =>
          i === idx
            ? {
                ...m,
                ...(cache.title != null && { title: cache.title }),
                ...(cache.posterPath != null && { posterPath: cache.posterPath }),
                ...(cache.backdropPath != null && { backdropPath: cache.backdropPath }),
                ...(cache.overview != null && { overview: cache.overview }),
                ...(cache.releaseDate != null && { releaseDate: cache.releaseDate }),
                ...(cache.runtimeMinutes != null && { runtimeMinutes: cache.runtimeMinutes }),
                ...(cache.tmdbId != null && { tmdbId: cache.tmdbId }),
                ...(cache.cast != null && {
                  cast: cache.cast,
                  topCastNames: cache.cast.map((c) => c.name)
                }),
                ...(cache.directors != null && { directors: cache.directors })
              }
            : m
        );
        return next;
      }
      return prev;
    });
  }, []);

  const addWatchToMovie = useCallback(
    (itemId: string, watch: WatchRecord, options?: { posterPath?: string }) => {
      setByClass((prev) => {
        const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
        for (const classKey of movieClasses) {
          const list = next[classKey] ?? [];
          const idx = list.findIndex((m) => m.id === itemId);
          if (idx === -1) continue;
          const item = list[idx];
          const newRecord: WatchRecord = { ...watch, id: watch.id || crypto.randomUUID() };
          const records = [...(item.watchRecords ?? []), newRecord];
          const { viewingDates, percentCompleted, watchTime } = formatViewingFromRecords(
            records,
            item.runtimeMinutes
          );
          const posterPath = options?.posterPath != null && !item.posterPath ? options.posterPath : item.posterPath;
          next[classKey] = list.map((m, i) =>
            i === idx
              ? {
                  ...m,
                  watchRecords: records,
                  viewingDates,
                  percentCompleted,
                  watchTime: watchTime || m.watchTime,
                  ...(posterPath != null ? { posterPath } : {})
                }
              : m
          );
          return next;
        }
        return prev;
      });
    },
    []
  );

  const updateMovieWatchRecords = useCallback((itemId: string, records: WatchRecord[]) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      for (const classKey of movieClasses) {
        const list = next[classKey] ?? [];
        const idx = list.findIndex((m) => m.id === itemId);
        if (idx === -1) continue;
        const item = list[idx];
        const { viewingDates, percentCompleted, watchTime } = formatViewingFromRecords(
          records,
          item.runtimeMinutes
        );
        next[classKey] = list.map((m, i) =>
          i === idx
            ? { ...m, watchRecords: records, viewingDates, percentCompleted, watchTime: watchTime || undefined }
            : m
        );
        return next;
      }
      return prev;
    });
  }, []);

  const setMovieRuntime = useCallback((itemId: string, runtimeMinutes: number) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      for (const classKey of movieClasses) {
        const list = next[classKey] ?? [];
        const idx = list.findIndex((m) => m.id === itemId);
        if (idx === -1) continue;
        const item = list[idx];
        const records = item.watchRecords ?? [];
        const { viewingDates, percentCompleted, watchTime } = formatViewingFromRecords(
          records,
          runtimeMinutes
        );
        next[classKey] = list.map((m, i) =>
          i === idx
            ? { ...m, runtimeMinutes, viewingDates, percentCompleted, watchTime: watchTime || undefined }
            : m
        );
        return next;
      }
      return prev;
    });
  }, []);

  const getMovieById = useCallback(
    (id: string): MovieShowItem | null => {
      for (const classKey of movieClasses) {
        const list = byClass[classKey] ?? [];
        const found = list.find((m) => m.id === id);
        if (found) return found;
      }
      return null;
    },
    [byClass]
  );

  const value = useMemo<MoviesStore>(
    () => ({
      classOrder: movieClasses,
      byClass,
      moveWithinClass,
      moveToOtherClass,
      addMovieFromSearch,
      addWatchToMovie,
      updateMovieWatchRecords,
      setMovieRuntime,
      updateMovieCache,
      getMovieById
    }),
    [byClass, moveToOtherClass, moveWithinClass, addMovieFromSearch, addWatchToMovie, updateMovieWatchRecords, setMovieRuntime, updateMovieCache, getMovieById]
  );

  return <MoviesContext.Provider value={value}>{children}</MoviesContext.Provider>;
}

export function useMoviesStore() {
  const ctx = useContext(MoviesContext);
  if (!ctx) {
    throw new Error('useMoviesStore must be used within MoviesProvider');
  }
  return ctx;
}

