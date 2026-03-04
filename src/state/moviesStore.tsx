import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { MovieShowItem, WatchRecord } from '../components/EntryRowMovieShow';
import type { ClassKey } from '../components/RankedList';
import { movieClasses, moviesByClass as initialMoviesByClass } from '../mock/movies';

function formatWatchDate(r: WatchRecord): string {
  const parts: string[] = [String(r.year)];
  if (r.month != null) parts.unshift(String(r.month).padStart(2, '0'));
  if (r.day != null) parts.unshift(String(r.day).padStart(2, '0'));
  return parts.join('-');
}

function sortRecordsByDate(records: WatchRecord[]): WatchRecord[] {
  return [...records].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if ((a.month ?? 0) !== (b.month ?? 0)) return (b.month ?? 0) - (a.month ?? 0);
    return (b.day ?? 0) - (a.day ?? 0);
  });
}

export function formatViewingFromRecords(
  records: WatchRecord[],
  runtimeMinutes?: number
): { viewingDates: string; percentCompleted: string; watchTime: string } {
  if (records.length === 0) {
    return { viewingDates: 'No watches', percentCompleted: '', watchTime: '' };
  }
  const sorted = sortRecordsByDate(records);
  const n = sorted.length;
  const lastStr = formatWatchDate(sorted[0]);
  const pct = `${n * 100}%`;
  const totalMins = runtimeMinutes != null ? n * runtimeMinutes : null;
  const watchTime = totalMins != null ? `${Math.round(totalMins)}m total` : '';
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
      firstWatch?: { year: number; month?: number; day?: number };
      runtimeMinutes?: number;
    }
  ) => void;
  addWatchToMovie: (
    itemId: string,
    watch: { year: number; month?: number; day?: number }
  ) => void;
  updateMovieWatchRecords: (itemId: string, records: WatchRecord[]) => void;
  setMovieRuntime: (itemId: string, runtimeMinutes: number) => void;
  getMovieById: (id: string) => MovieShowItem | null;
};

const MoviesContext = createContext<MoviesStore | null>(null);

export function MoviesProvider({ children }: { children: React.ReactNode }) {
  const [byClass, setByClass] = useState<Record<ClassKey, MovieShowItem[]>>(initialMoviesByClass);

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
        firstWatch?: { year: number; month?: number; day?: number };
        runtimeMinutes?: number;
      }
    ) => {
      setByClass((prev) => {
        const alreadyExists = Object.values(prev).some((list) =>
          list.some((m) => m.id === incoming.id)
        );
        if (alreadyExists) return prev;

        const toKey = incoming.classKey;
        const watchRecords: WatchRecord[] = incoming.firstWatch
          ? [
              {
                id: crypto.randomUUID(),
                year: incoming.firstWatch.year,
                month: incoming.firstWatch.month,
                day: incoming.firstWatch.day
              }
            ]
          : [];
        const { viewingDates, percentCompleted, watchTime } = formatViewingFromRecords(
          watchRecords,
          incoming.runtimeMinutes
        );
        const base: MovieShowItem = {
          id: incoming.id,
          classKey: toKey,
          percentileRank: '—',
          absoluteRank: '—',
          rankInClass: `Unranked`,
          title: incoming.title,
          viewingDates: watchRecords.length > 0 ? viewingDates : incoming.subtitle ?? 'Recorded watch',
          percentCompleted,
          watchTime: watchTime || undefined,
          watchRecords,
          runtimeMinutes: incoming.runtimeMinutes,
          topCastNames: [],
          stickerTags: []
        };

        const targetList = prev[toKey] ?? [];
        return { ...prev, [toKey]: [base, ...targetList] };
      });
    },
    []
  );

  const addWatchToMovie = useCallback((itemId: string, watch: { year: number; month?: number; day?: number }) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      for (const classKey of movieClasses) {
        const list = next[classKey] ?? [];
        const idx = list.findIndex((m) => m.id === itemId);
        if (idx === -1) continue;
        const item = list[idx];
        const records = [...(item.watchRecords ?? []), { id: crypto.randomUUID(), ...watch }];
        const { viewingDates, percentCompleted, watchTime } = formatViewingFromRecords(
          records,
          item.runtimeMinutes
        );
        next[classKey] = list.map((m, i) =>
          i === idx
            ? {
                ...m,
                watchRecords: records,
                viewingDates,
                percentCompleted,
                watchTime: watchTime || m.watchTime
              }
            : m
        );
        return next;
      }
      return prev;
    });
  }, []);

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
      getMovieById
    }),
    [byClass, moveToOtherClass, moveWithinClass, addMovieFromSearch, addWatchToMovie, updateMovieWatchRecords, setMovieRuntime, getMovieById]
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

