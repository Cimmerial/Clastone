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
  getClassTagline: (classKey: ClassKey) => string | undefined;
  isRankedClass: (classKey: ClassKey) => boolean;
  byClass: Record<ClassKey, MovieShowItem[]>;

  addClass: (label: string, options?: { isRanked?: boolean }) => void;
  renameClassLabel: (classKey: ClassKey, newLabel: string) => void;
  renameClassTagline: (classKey: ClassKey, tagline: string) => void;
  moveClass: (classKey: ClassKey, delta: number) => void;
  deleteClass: (classKey: ClassKey) => void;

  moveWithinClass: (itemId: string, delta: number) => void;
  reorderWithinClass: (classKey: ClassKey, orderedIds: string[]) => void;
  moveToOtherClass: (itemId: string, deltaClass: number) => void;
  moveItemToClass: (itemId: string, toClassKey: ClassKey, options?: { toTop?: boolean; toMiddle?: boolean }) => void;

  addShowFromSearch: (
    item: Pick<MovieShowItem, 'id' | 'title'> & {
      subtitle?: string;
      classKey: ClassKey;
      firstWatch?: WatchRecord;
      cache?: TmdbTvCache;
      toTop?: boolean;
    }
  ) => void;
  addWatchToShow: (itemId: string, watch: WatchRecord, options?: { posterPath?: string }) => void;
  updateShowWatchRecords: (itemId: string, records: WatchRecord[]) => void;
  updateShowCache: (itemId: string, cache: Partial<TmdbTvCache>) => void;
  /** Bulk merge cached TMDB data onto multiple entries. */
  updateBatchShowCache: (updates: Record<string, Partial<TmdbTvCache>>) => void;
  getShowById: (id: string) => MovieShowItem | null;
  removeShowEntry: (itemId: string) => void;
};

type TvProviderProps = {
  children: React.ReactNode;
  initialByClass?: Record<ClassKey, MovieShowItem[]>;
  initialClasses?: MovieClassDef[];
  onPersist?: (payload: { byClass: Record<ClassKey, MovieShowItem[]>; classes: MovieClassDef[]; pendingCount?: number }) => void;
};

const TvContext = createContext<TvStore | null>(null);

export function TvProvider({ children, initialByClass, initialClasses, onPersist }: TvProviderProps) {
  const [classes, setClasses] = useState<MovieClassDef[]>(initialClasses ?? defaultMovieClassDefs);
  const classOrder = useMemo(() => classes.map((c) => c.key), [classes]);
  const [byClass, setByClass] = useState<Record<ClassKey, MovieShowItem[]>>(initialByClass ?? {});
  const [pendingChanges, setPendingChanges] = useState(0);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStateRef = useRef({ byClass, classes });
  lastStateRef.current = { byClass, classes };

  // Debounced persistence logic.
  useEffect(() => {
    if (!onPersist) return;
    setPendingChanges((p) => p + 1);
    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);

    persistTimeoutRef.current = setTimeout(() => {
      onPersist({ ...lastStateRef.current, pendingCount: pendingChanges });
      setPendingChanges(0);
      persistTimeoutRef.current = null;
    }, 1500);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, [byClass, classes, onPersist]);

  // Handle browser tab closure / refresh.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (persistTimeoutRef.current && onPersist) {
        onPersist(lastStateRef.current);
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

  const getClassTagline = useCallback(
    (classKey: ClassKey) => classes.find((c) => c.key === classKey)?.tagline?.trim() || undefined,
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
      return [...prev, { key, label: trimmed.toUpperCase(), tagline: undefined, isRanked: options?.isRanked ?? true }];
    });
  }, []);

  const renameClassLabel = useCallback((classKey: ClassKey, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setClasses((prev) => prev.map((c) => (c.key === classKey ? { ...c, label: trimmed } : c)));
  }, []);

  const renameClassTagline = useCallback((classKey: ClassKey, tagline: string) => {
    setClasses((prev) =>
      prev.map((c) => (c.key === classKey ? { ...c, tagline: tagline.trim() || undefined } : c))
    );
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

  const reorderWithinClass = useCallback((classKey: ClassKey, orderedIds: string[]) => {
    setByClass((prev) => {
      const list = prev[classKey] ?? [];
      if (list.length !== orderedIds.length) return prev;
      const idToItem = new Map(list.map((m) => [m.id, m]));
      const reordered: MovieShowItem[] = [];
      for (const id of orderedIds) {
        const item = idToItem.get(id);
        if (!item) return prev;
        reordered.push(item);
      }
      return { ...prev, [classKey]: reordered };
    });
  }, []);

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
    (itemId: string, toClassKey: ClassKey, options?: { toTop?: boolean; toMiddle?: boolean }) => {
      setByClass((prev) => {
        const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
        let item: MovieShowItem | null = null;

        for (const classKey of Object.keys(next)) {
          const list = next[classKey] ?? [];
          const idx = list.findIndex((m) => m.id === itemId);
          if (idx === -1) continue;
          const copy = [...list];
          [item] = copy.splice(idx, 1);
          next[classKey] = copy;
          break;
        }
        if (!item) return prev;
        const updated = { ...item, classKey: toClassKey as MovieShowItem['classKey'] };
        const targetList = next[toClassKey] ?? [];
        if (options?.toTop) {
          next[toClassKey] = [updated, ...targetList];
        } else if (options?.toMiddle) {
          const mid = Math.ceil(targetList.length / 2);
          const copy = [...targetList];
          copy.splice(mid, 0, updated);
          next[toClassKey] = copy;
        } else {
          next[toClassKey] = [...targetList, updated];
        }
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
        toTop?: boolean;
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

        console.info('[Clastone] addShowFromSearch', {
          id: incoming.id,
          title: base.title,
          classKey: incoming.classKey,
          runtimeMinutes: base.runtimeMinutes
        });

        const targetList = prev[incoming.classKey] ?? [];
        const toTop = incoming.toTop !== false;
        return {
          ...prev,
          [incoming.classKey]: toTop ? [base, ...targetList] : [...targetList, base]
        };
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

  const updateBatchShowCache = useCallback((updates: Record<string, Partial<TmdbTvCache>>) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      let changedGlobal = false;
      for (const classKey of classOrder) {
        const list = next[classKey] ?? [];
        let changedClass = false;
        const newList = list.map((m) => {
          const cache = updates[m.id];
          if (!cache) return m;
          changedClass = true;
          changedGlobal = true;
          return {
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
          };
        });
        if (changedClass) {
          next[classKey] = newList;
        }
      }
      return changedGlobal ? next : prev;
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

  const removeShowEntry = useCallback((itemId: string) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      for (const classKey of classOrder) {
        const list = next[classKey] ?? [];
        const idx = list.findIndex((m) => m.id === itemId);
        if (idx === -1) continue;
        next[classKey] = list.filter((m) => m.id !== itemId);
        return next;
      }
      return prev;
    });
  }, [classOrder]);

  const value = useMemo<TvStore>(
    () => ({
      classes,
      classOrder,
      getClassLabel,
      getClassTagline,
      isRankedClass,
      byClass,
      addClass,
      renameClassLabel,
      renameClassTagline,
      moveClass,
      deleteClass,
      moveWithinClass,
      reorderWithinClass,
      moveToOtherClass,
      moveItemToClass,
      addShowFromSearch,
      addWatchToShow,
      updateShowWatchRecords,
      updateShowCache,
      updateBatchShowCache,
      getShowById,
      removeShowEntry
    }),
    [
      classes,
      classOrder,
      getClassLabel,
      getClassTagline,
      isRankedClass,
      byClass,
      addClass,
      renameClassLabel,
      renameClassTagline,
      moveClass,
      deleteClass,
      moveWithinClass,
      reorderWithinClass,
      moveToOtherClass,
      moveItemToClass,
      addShowFromSearch,
      addWatchToShow,
      updateShowWatchRecords,
      updateShowCache,
      updateBatchShowCache,
      getShowById,
      removeShowEntry
    ]
  );

  return <TvContext.Provider value={value}>{children}</TvContext.Provider>;
}

export function useTvStore() {
  const ctx = useContext(TvContext);
  if (!ctx) throw new Error('useTvStore must be used within TvProvider');
  return ctx;
}

