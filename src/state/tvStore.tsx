import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { MovieShowItem, WatchRecord } from '../components/EntryRowMovieShow';
import type { ClassKey } from '../components/RankedList';
import type { MovieClassDef } from '../mock/movies';
import { defaultMovieClassDefs } from '../mock/movies';
import { formatViewingFromRecords } from './moviesStore';
import type { TmdbTvCache } from '../lib/tmdb';

type TvStore = {
  classes: MovieClassDef[];
  classOrder: ClassKey[];
  getClassLabel: (classKey: ClassKey) => string;
  isRankedClass: (classKey: ClassKey) => boolean;
  byClass: Record<ClassKey, MovieShowItem[]>;

  addClass: (label: string, options?: { isRanked?: boolean }) => void;
  renameClassLabel: (classKey: ClassKey, newLabel: string) => void;
  moveClass: (classKey: ClassKey, delta: number) => void;
  deleteClass: (classKey: ClassKey) => void;

  moveWithinClass: (itemId: string, delta: number) => void;
  moveToOtherClass: (itemId: string, deltaClass: number) => void;
  moveItemToClass: (itemId: string, toClassKey: ClassKey, options?: { toTop?: boolean }) => void;

  addShowFromSearch: (
    item: Pick<MovieShowItem, 'id' | 'title'> & {
      subtitle?: string;
      classKey: ClassKey;
      firstWatch?: WatchRecord;
      cache?: TmdbTvCache;
    }
  ) => void;
  addWatchToShow: (itemId: string, watch: WatchRecord, options?: { posterPath?: string }) => void;
  updateShowWatchRecords: (itemId: string, records: WatchRecord[]) => void;
  updateShowCache: (itemId: string, cache: Partial<TmdbTvCache>) => void;
  getShowById: (id: string) => MovieShowItem | null;
};

type TvProviderProps = {
  children: React.ReactNode;
  initialByClass?: Record<ClassKey, MovieShowItem[]>;
  initialClasses?: MovieClassDef[];
  onPersist?: (payload: { byClass: Record<ClassKey, MovieShowItem[]>; classes: MovieClassDef[] }) => void;
};

const TvContext = createContext<TvStore | null>(null);

export function TvProvider({ children, initialByClass, initialClasses, onPersist }: TvProviderProps) {
  const [classes, setClasses] = useState<MovieClassDef[]>(initialClasses ?? defaultMovieClassDefs);
  const classOrder = useMemo(() => classes.map((c) => c.key), [classes]);
  const [byClass, setByClass] = useState<Record<ClassKey, MovieShowItem[]>>(initialByClass ?? {});
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!onPersist) return;
    persistTimeoutRef.current = setTimeout(() => {
      onPersist({ byClass, classes });
    }, 400);
    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
      onPersist({ byClass, classes });
    };
  }, [byClass, classes, onPersist]);

  // Ensure keys exist for all classes.
  useEffect(() => {
    setByClass((prev) => {
      let changed = false;
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      for (const c of classes) {
        if (!(c.key in next)) {
          next[c.key] = [];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [classes]);

  const getClassLabel = useCallback(
    (classKey: ClassKey) => classes.find((c) => c.key === classKey)?.label ?? classKey.replace(/_/g, ' '),
    [classes]
  );

  const isRankedClass = useCallback(
    (classKey: ClassKey) => classes.find((c) => c.key === classKey)?.isRanked ?? true,
    [classes]
  );

  const addClass = useCallback((label: string, options?: { isRanked?: boolean }) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const key = trimmed.toUpperCase().replace(/\s+/g, '_');
    setClasses((prev) => {
      if (prev.some((c) => c.key === key)) return prev;
      return [...prev, { key, label: trimmed.toUpperCase(), isRanked: options?.isRanked ?? true }];
    });
  }, []);

  const renameClassLabel = useCallback((classKey: ClassKey, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setClasses((prev) => prev.map((c) => (c.key === classKey ? { ...c, label: trimmed } : c)));
  }, []);

  const moveClass = useCallback((classKey: ClassKey, delta: number) => {
    setClasses((prev) => {
      const idx = prev.findIndex((c) => c.key === classKey);
      if (idx === -1) return prev;
      const nextIdx = idx + delta;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, moved);
      return copy;
    });
  }, []);

  const deleteClass = useCallback((classKey: ClassKey) => {
    setByClass((prev) => {
      const list = prev[classKey] ?? [];
      if (list.length > 0) return prev;
      const next = { ...prev };
      delete next[classKey];
      return next;
    });
    setClasses((prev) => prev.filter((c) => c.key !== classKey));
  }, []);

  const moveWithinClass = useCallback(
    (itemId: string, delta: number) => {
      setByClass((prev) => {
        const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
        for (const classKey of classOrder) {
          const list = next[classKey];
          if (!list) continue;
          const index = list.findIndex((m) => m.id === itemId);
          if (index === -1) continue;
          const newIndex = index + delta;
          if (newIndex < 0 || newIndex >= list.length) return prev;
          const copy = [...list];
          const [moved] = copy.splice(index, 1);
          copy.splice(newIndex, 0, moved);
          next[classKey] = copy;
          return next;
        }
        return prev;
      });
    },
    [classOrder]
  );

  const moveToOtherClass = useCallback(
    (itemId: string, deltaClass: number) => {
      setByClass((prev) => {
        const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
        let fromKey: ClassKey | null = null;
        let item: MovieShowItem | null = null;

        for (const classKey of classOrder) {
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
        const fromIndex = classOrder.indexOf(fromKey);
        const toIndex = fromIndex + deltaClass;
        if (toIndex < 0 || toIndex >= classOrder.length) return prev;

        const toKey = classOrder[toIndex];
        const targetList = next[toKey] ?? [];
        const updated = { ...item, classKey: toKey as MovieShowItem['classKey'] };
        if (deltaClass > 0) next[toKey] = [updated, ...targetList];
        else next[toKey] = [...targetList, updated];
        return next;
      });
    },
    [classOrder]
  );

  const moveItemToClass = useCallback(
    (itemId: string, toClassKey: ClassKey, options?: { toTop?: boolean }) => {
      setByClass((prev) => {
        const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
        let fromKey: ClassKey | null = null;
        let item: MovieShowItem | null = null;

        for (const classKey of Object.keys(next)) {
          const list = next[classKey] ?? [];
          const idx = list.findIndex((m) => m.id === itemId);
          if (idx === -1) continue;
          fromKey = classKey;
          const copy = [...list];
          [item] = copy.splice(idx, 1);
          next[classKey] = copy;
          break;
        }
        if (!item) return prev;
        const updated = { ...item, classKey: toClassKey as MovieShowItem['classKey'] };
        const targetList = next[toClassKey] ?? [];
        next[toClassKey] = options?.toTop ? [updated, ...targetList] : [...targetList, updated];
        return next;
      });
    },
    []
  );

  const addShowFromSearch = useCallback(
    (
      incoming: Pick<MovieShowItem, 'id' | 'title'> & {
        subtitle?: string;
        classKey: ClassKey;
        firstWatch?: WatchRecord;
        cache?: TmdbTvCache;
      }
    ) => {
      setByClass((prev) => {
        const alreadyExists = Object.values(prev).some((list) => list.some((m) => m.id === incoming.id));
        if (alreadyExists) return prev;

        const cache = incoming.cache;
        const watchRecords: WatchRecord[] = incoming.firstWatch
          ? [{ ...incoming.firstWatch, id: incoming.firstWatch.id || crypto.randomUUID() }]
          : [];
        const { viewingDates, percentCompleted, watchTime } = formatViewingFromRecords(
          watchRecords,
          cache?.runtimeMinutes
        );

        const base: MovieShowItem = {
          id: incoming.id,
          classKey: incoming.classKey,
          percentileRank: '—',
          absoluteRank: '—',
          rankInClass: `Unranked`,
          title: cache?.title ?? incoming.title,
          viewingDates: watchRecords.length > 0 ? viewingDates : incoming.subtitle ?? 'Saved',
          percentCompleted,
          watchTime: watchTime || undefined,
          watchRecords,
          runtimeMinutes: cache?.runtimeMinutes,
          posterPath: cache?.posterPath,
          topCastNames: cache?.cast?.map((c) => c.name) ?? [],
          stickerTags: [],
          tmdbId: cache?.tmdbId,
          backdropPath: cache?.backdropPath,
          overview: cache?.overview,
          releaseDate: cache?.releaseDate,
          cast: cache?.cast,
          directors: cache?.creators,
          totalSeasons: cache?.totalSeasons,
          totalEpisodes: cache?.totalEpisodes
        };

        const targetList = prev[incoming.classKey] ?? [];
        return { ...prev, [incoming.classKey]: [base, ...targetList] };
      });
    },
    []
  );

  const addWatchToShow = useCallback((itemId: string, watch: WatchRecord, options?: { posterPath?: string }) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      for (const classKey of classOrder) {
        const list = next[classKey] ?? [];
        const idx = list.findIndex((m) => m.id === itemId);
        if (idx === -1) continue;
        const item = list[idx];
        const newRecord: WatchRecord = { ...watch, id: watch.id || crypto.randomUUID() };
        const records = [...(item.watchRecords ?? []), newRecord];
        const { viewingDates, percentCompleted, watchTime } = formatViewingFromRecords(records, item.runtimeMinutes);
        const posterPath =
          options?.posterPath != null && !item.posterPath ? options.posterPath : item.posterPath;
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
  }, [classOrder]);

  const updateShowWatchRecords = useCallback((itemId: string, records: WatchRecord[]) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      for (const classKey of classOrder) {
        const list = next[classKey] ?? [];
        const idx = list.findIndex((m) => m.id === itemId);
        if (idx === -1) continue;
        const item = list[idx];
        const { viewingDates, percentCompleted, watchTime } = formatViewingFromRecords(records, item.runtimeMinutes);
        next[classKey] = list.map((m, i) =>
          i === idx ? { ...m, watchRecords: records, viewingDates, percentCompleted, watchTime: watchTime || undefined } : m
        );
        return next;
      }
      return prev;
    });
  }, [classOrder]);

  const updateShowCache = useCallback((itemId: string, cache: Partial<TmdbTvCache>) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      for (const classKey of classOrder) {
        const list = next[classKey] ?? [];
        const idx = list.findIndex((m) => m.id === itemId);
        if (idx === -1) continue;
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
                ...(cache.creators != null && { directors: cache.creators }),
                ...(cache.totalSeasons != null && { totalSeasons: cache.totalSeasons }),
                ...(cache.totalEpisodes != null && { totalEpisodes: cache.totalEpisodes })
              }
            : m
        );
        return next;
      }
      return prev;
    });
  }, [classOrder]);

  const getShowById = useCallback(
    (id: string): MovieShowItem | null => {
      for (const classKey of classOrder) {
        const list = byClass[classKey] ?? [];
        const found = list.find((m) => m.id === id);
        if (found) return found;
      }
      return null;
    },
    [byClass, classOrder]
  );

  const value = useMemo<TvStore>(
    () => ({
      classes,
      classOrder,
      getClassLabel,
      isRankedClass,
      byClass,
      addClass,
      renameClassLabel,
      moveClass,
      deleteClass,
      moveWithinClass,
      moveToOtherClass,
      moveItemToClass,
      addShowFromSearch,
      addWatchToShow,
      updateShowWatchRecords,
      updateShowCache,
      getShowById
    }),
    [
      classes,
      classOrder,
      getClassLabel,
      isRankedClass,
      byClass,
      addClass,
      renameClassLabel,
      moveClass,
      deleteClass,
      moveWithinClass,
      moveToOtherClass,
      moveItemToClass,
      addShowFromSearch,
      addWatchToShow,
      updateShowWatchRecords,
      updateShowCache,
      getShowById
    ]
  );

  return <TvContext.Provider value={value}>{children}</TvContext.Provider>;
}

export function useTvStore() {
  const ctx = useContext(TvContext);
  if (!ctx) throw new Error('useTvStore must be used within TvProvider');
  return ctx;
}

