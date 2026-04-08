import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { pruneItem } from '../lib/firestoreTvShows';
import type { RankedItemBase } from '../components/RankedList';
import type { ClassKey } from '../components/RankedList';
import type { TmdbMovieCache, TmdbTvCache } from '../lib/tmdb';
import { tmdbMovieDetailsFull } from '../lib/tmdb';
import { sanitizeClassName, sanitizeLabel, sanitizeTagline, isValidLabel, isValidTagline } from '../lib/sanitize';
import { defaultMovieClassDefs, movieClasses, moviesByClass as initialMoviesByClass, type MovieClassDef } from '../mock/movies';
import { tvClasses, tvByClass as initialTvByClass } from '../mock/tvShows';
import type { MovieShowItem, WatchRecord } from '../components/EntryRowMovieShow';
import { formatViewingFromRecords } from './moviesStore';

type TvStore = {
  classes: MovieClassDef[];
  classOrder: ClassKey[];
  getClassLabel: (classKey: ClassKey) => string;
  getClassTagline: (classKey: ClassKey) => string | undefined;
  isRankedClass: (classKey: ClassKey) => boolean;
  byClass: Record<ClassKey, MovieShowItem[]>;
  globalRanks: Map<string, { absoluteRank: string; percentileRank: string }>;

  addClass: (label: string, options?: { isRanked?: boolean }) => void;
  renameClassLabel: (classKey: ClassKey, newLabel: string) => void;
  renameClassTagline: (classKey: ClassKey, tagline: string) => void;
  moveClass: (classKey: ClassKey, delta: number) => void;
  deleteClass: (classKey: ClassKey) => void;
  moveToOtherClass: (itemId: string, deltaClass: number) => void;
  moveWithinClass: (itemId: string, direction: number) => void;
  reorderWithinClass: (classKey: ClassKey, orderedIds: string[]) => void;
  moveItemToClass: (itemId: string, toClassKey: ClassKey, options?: { toTop?: boolean; toMiddle?: boolean; atIndex?: number }) => void;
  
  // TV show methods
  addTvShowFromSearch: (incoming: {
    id: string;
    title: string;
    posterPath?: string;
    classKey: ClassKey;
    cache?: TmdbMovieCache;
    position?: 'top' | 'middle' | 'bottom';
  }) => void;
  updateTvShowCache: (itemId: string, cache: Partial<TmdbMovieCache>) => void;
  removeTvShowEntry: (itemId: string) => void;
  getTvShowById: (id: string) => MovieShowItem | null;
  addWatchToTvShow: (itemId: string, watch: WatchRecord) => void;
  updateTvShowWatchRecords: (itemId: string, watches: WatchRecord[]) => void;
  setTvShowRuntime: (itemId: string, runtimeMinutes: number) => void;
  
  // Show methods (aliases for TV shows)
  addShowFromSearch: (incoming: {
    id: string;
    title: string;
    subtitle?: string;
    classKey: ClassKey;
    firstWatch?: WatchRecord;
    cache?: TmdbTvCache;
    toTop?: boolean;
    toMiddle?: boolean;
  }) => void;
  updateShowCache: (itemId: string, cache: Partial<TmdbTvCache>) => void;
  updateBatchShowCache: (updates: Record<string, Partial<TmdbTvCache>>) => void;
  addWatchToShow: (itemId: string, watch: WatchRecord, options?: { posterPath?: string }) => void;
  updateShowWatchRecords: (itemId: string, records: WatchRecord[]) => void;
  removeShowEntry: (itemId: string) => void;
  getShowById: (id: string) => MovieShowItem | null;
  
  forceSync: () => Promise<void>;
};

type TvProviderProps = {
  children: React.ReactNode;
  initialByClass?: Record<ClassKey, MovieShowItem[]>;
  initialClasses?: MovieClassDef[];
  onPersist?: (payload: {
    byClass: Record<ClassKey, MovieShowItem[]>;
    classes: MovieClassDef[];
    pendingCount?: number;
    dirtyClasses?: ClassKey[];
    classesMetadataChanged?: boolean;
  }) => Promise<void>;
};

const TvContext = createContext<TvStore | null>(null);

export function TvProvider({ children, initialByClass, initialClasses, onPersist }: TvProviderProps) {
  const [classes, setClasses] = useState<MovieClassDef[]>(initialClasses ?? defaultMovieClassDefs);
  const classOrder = useMemo(() => classes.map((c) => c.key), [classes]);
  const [byClass, setByClass] = useState<Record<ClassKey, MovieShowItem[]>>(initialByClass ?? {});
  const [pendingChanges, setPendingChanges] = useState(0);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track what was last explicitly saved to calculate diffs.
  const lastSavedStateRef = useRef({ byClass, classes });
  const isHydratedRef = useRef(false);

  // We need current values for the strict forceSync (to capture everything immediately if needed)
  const currentStateRef = useRef({ byClass, classes });
  currentStateRef.current = { byClass, classes };

  // Debounced persistence logic.
  useEffect(() => {
    // 1. Skip the very first "fresh load" mutation to prevent writing back identical data on mount
    if (!isHydratedRef.current) {
      lastSavedStateRef.current = { byClass, classes };
      isHydratedRef.current = true;
      return;
    }

    if (!onPersist) return;

    // 2. Diffing: figure out what actually changed since the last save
    const dirtyClasses: ClassKey[] = [];
    const classesMetadataChanged = classes !== lastSavedStateRef.current.classes;

    for (const c of classes) {
      // Since React state updates by replacing arrays, a shallow equality check works perfectly
      if (byClass[c.key] !== lastSavedStateRef.current.byClass[c.key]) {
        dirtyClasses.push(c.key);
      }
    }

    // 3. If there are absolutely no changes, early return
    if (dirtyClasses.length === 0 && !classesMetadataChanged) {
      return;
    }

    console.info(`[TvStore] Local changes detected (Dirty classes: ${dirtyClasses.join(', ')}). Queuing save in 10 seconds...`);

    setPendingChanges((p) => p + 1);

    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);

    // Capture the state *at this moment* to be used in the closure
    const savedByClass = byClass;
    const savedClasses = classes;

    persistTimeoutRef.current = setTimeout(() => {
      console.info(`[TvStore] Debounce finished. Executing onPersist...`);
      onPersist({
        byClass: savedByClass,
        classes: savedClasses,
        pendingCount: dirtyClasses.length + (classesMetadataChanged ? 1 : 0),
        dirtyClasses,
        classesMetadataChanged
      });
      lastSavedStateRef.current = { byClass: savedByClass, classes: savedClasses };
      setPendingChanges(0);
      persistTimeoutRef.current = null;
    }, 10000); // 10s debounce

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
        // Force an immediate save of the known dirty state before the window dies
        const dirtyClasses: ClassKey[] = [];
        const classesMetadataChanged = currentStateRef.current.classes !== lastSavedStateRef.current.classes;
        for (const c of currentStateRef.current.classes) {
          if (currentStateRef.current.byClass[c.key] !== lastSavedStateRef.current.byClass[c.key]) {
            dirtyClasses.push(c.key);
          }
        }

        console.info(`[TvStore] beforeunload triggered. Forcing emergency save of dirty state...`);
        onPersist({
          ...currentStateRef.current,
          pendingCount: dirtyClasses.length + (classesMetadataChanged ? 1 : 0),
          dirtyClasses,
          classesMetadataChanged
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

  const globalRanks = useMemo(() => {
    const rankedItems: MovieShowItem[] = [];
    for (const classKey of classOrder) {
      if (!isRankedClass(classKey)) continue;
      const list = byClass[classKey] ?? [];
      for (const item of list) rankedItems.push(item);
    }
    const total = rankedItems.length || 1;
    const map = new Map<string, { absoluteRank: string; percentileRank: string }>();
    rankedItems.forEach((item, index) => {
      map.set(item.id, {
        absoluteRank: `${index + 1} / ${total}`,
        percentileRank: `${Math.round(((total - index) / total) * 100)}%`
      });
    });
    return map;
  }, [byClass, classOrder, isRankedClass]);

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
    const current = currentStateRef.current;
    const list = current.byClass[classKey] ?? [];
    if (list.length > 0) return;

    const nextClasses = current.classes.filter((c) => c.key !== classKey);
    const nextByClass: Record<ClassKey, MovieShowItem[]> = { ...current.byClass };
    delete nextByClass[classKey];

    setByClass(nextByClass);
    setClasses(nextClasses);

    if (onPersist) {
      void onPersist({
        byClass: nextByClass,
        classes: nextClasses,
        classesMetadataChanged: true,
        pendingCount: 1
      })
        .then(() => {
          lastSavedStateRef.current = { byClass: nextByClass, classes: nextClasses };
        })
        .catch(() => {
          // If immediate save fails, user can retry later.
        });
    }
  }, [onPersist]);

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
    (itemId: string, toClassKey: ClassKey, options?: { toTop?: boolean; toMiddle?: boolean; atIndex?: number }) => {
      setByClass((prev) => {
        const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
        let item: MovieShowItem | null = null;
        let fromClassKey: ClassKey | null = null;

        for (const classKey of Object.keys(next)) {
          const list = next[classKey] ?? [];
          const idx = list.findIndex((m) => m.id === itemId);
          if (idx === -1) continue;
          const copy = [...list];
          [item] = copy.splice(idx, 1);
          next[classKey] = copy;
          fromClassKey = classKey;
          break;
        }
        if (!item) return prev;
        
        // Auto-add a long ago 100% watch when moving from UNRANKED to any other class and item has no watches
        let updatedItem = { ...item, classKey: toClassKey as MovieShowItem['classKey'] };
        if (fromClassKey === 'UNRANKED' && fromClassKey !== toClassKey && (!item.watchRecords || item.watchRecords.length === 0)) {
          const autoWatch: WatchRecord = {
            id: crypto.randomUUID(),
            type: 'LONG_AGO',
          };
          updatedItem = {
            ...updatedItem,
            watchRecords: [autoWatch]
          };
          // Update viewing dates and completion percentage
          const { viewingDates, percentCompleted, watchTime } = formatViewingFromRecords(
            [autoWatch],
            updatedItem.runtimeMinutes
          );
          updatedItem.viewingDates = viewingDates;
          updatedItem.percentCompleted = percentCompleted;
          updatedItem.watchTime = watchTime || undefined;
        }
        
        const targetList = next[toClassKey] ?? [];

        if (options?.atIndex !== undefined) {
          const insertIdx = Math.min(options.atIndex, targetList.length);
          const copy = [...targetList];
          copy.splice(insertIdx, 0, updatedItem);
          next[toClassKey] = copy;
        } else if (options?.toTop) {
          next[toClassKey] = [updatedItem, ...targetList];
        } else if (options?.toMiddle) {
          const mid = Math.ceil(targetList.length / 2);
          const copy = [...targetList];
          copy.splice(mid, 0, updatedItem);
          next[toClassKey] = copy;
        } else {
          next[toClassKey] = [...targetList, updatedItem];
        }
        return next;
      });
    },
    [isRankedClass]
  );

  const addTvShowFromSearch = useCallback(
    (incoming: {
      id: string;
      title: string;
      posterPath?: string;
      classKey: ClassKey;
      cache?: TmdbMovieCache;
      position?: 'top' | 'middle' | 'bottom';
    }) => {
      setByClass((prev) => {
        const alreadyExists = Object.values(prev).some((list) => list.some((m) => m.id === incoming.id));
        if (alreadyExists) return prev;

        const cache = incoming.cache;
        const watchRecords: WatchRecord[] = [];
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
          viewingDates: 'Saved',
          percentCompleted,
          watchTime: watchTime || undefined,
          watchRecords,
          runtimeMinutes: cache?.runtimeMinutes,
          genres: cache?.genres,
          posterPath: cache?.posterPath ?? incoming.posterPath,
          topCastNames: cache?.cast?.map((c: any) => c.name) ?? [],
          stickerTags: [],
          tmdbId: cache?.tmdbId,
          backdropPath: cache?.backdropPath,
          overview: cache?.overview,
          releaseDate: cache?.releaseDate,
          cast: cache?.cast,
          directors: cache?.directors
        };

        console.info('[Clastone] addTvShowFromSearch', {
          id: incoming.id,
          title: base.title,
          classKey: incoming.classKey,
          runtimeMinutes: base.runtimeMinutes
        });

        const targetList = prev[incoming.classKey] ?? [];
        const position = incoming.position;

        let newList: MovieShowItem[];
        if (position === 'top') {
          newList = [base, ...targetList];
        } else if (position === 'middle') {
          const mid = Math.ceil(targetList.length / 2);
          newList = [...targetList.slice(0, mid), base, ...targetList.slice(mid)];
        } else {
          newList = [...targetList, base];
        }

        return {
          ...prev,
          [incoming.classKey]: newList
        };
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
        toMiddle?: boolean;
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
          genres: cache?.genres,
          posterPath: cache?.posterPath,
          topCastNames: cache?.cast?.map((c: any) => c.name) ?? [],
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

        console.info('[Clastone] addTvFromSearch', {
          id: incoming.id,
          title: base.title,
          classKey: incoming.classKey,
          runtimeMinutes: base.runtimeMinutes
        });

        const targetList = prev[incoming.classKey] ?? [];
        const toTop = incoming.toTop;
        const toMiddle = incoming.toMiddle;

        let newList: MovieShowItem[];
        if (toTop) {
          newList = [base, ...targetList];
        } else if (toMiddle) {
          const mid = Math.ceil(targetList.length / 2);
          newList = [...targetList.slice(0, mid), base, ...targetList.slice(mid)];
        } else {
          newList = [...targetList, base];
        }

        return {
          ...prev,
          [incoming.classKey]: newList
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
              ...(cache.totalSeasons != null && { totalSeasons: cache.totalSeasons }),
              ...(cache.totalEpisodes != null && { totalEpisodes: cache.totalEpisodes }),
              ...(cache.genres != null && { genres: cache.genres })
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
              topCastNames: cache.cast.map((c: any) => c.name)
            }),
            ...(cache.creators != null && { directors: cache.creators }),
            ...(cache.totalSeasons != null && { totalSeasons: cache.totalSeasons }),
            ...(cache.totalEpisodes != null && { totalEpisodes: cache.totalEpisodes }),
            ...(cache.genres != null && { genres: cache.genres })
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
      globalRanks,
      addClass,
      renameClassLabel,
      renameClassTagline,
      moveClass,
      deleteClass,
      moveWithinClass,
      reorderWithinClass,
      moveToOtherClass,
      moveItemToClass,
      addTvShowFromSearch,
      updateTvShowCache: updateShowCache,
      removeTvShowEntry: removeShowEntry,
      getTvShowById: getShowById,
      addWatchToTvShow: addWatchToShow,
      updateTvShowWatchRecords: updateShowWatchRecords,
      setTvShowRuntime: (itemId: string, runtimeMinutes: number) => {
        // Implementation can be added if needed
        console.log('setTvShowRuntime called', itemId, runtimeMinutes);
      },
      addShowFromSearch,
      updateShowCache,
      updateBatchShowCache,
      addWatchToShow,
      updateShowWatchRecords,
      removeShowEntry,
      getShowById,
      forceSync: async () => {
        if (onPersist) {
          const dirtyClasses: ClassKey[] = [];
          const classesMetadataChanged = currentStateRef.current.classes !== lastSavedStateRef.current.classes;
          for (const c of currentStateRef.current.classes) {
            if (currentStateRef.current.byClass[c.key] !== lastSavedStateRef.current.byClass[c.key]) {
              dirtyClasses.push(c.key);
            }
          }

          if (dirtyClasses.length > 0 || classesMetadataChanged) {
            await onPersist({
              ...currentStateRef.current,
              dirtyClasses,
              classesMetadataChanged
            });
            lastSavedStateRef.current = currentStateRef.current;
          }
        }
      }
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
      addTvShowFromSearch,
      addShowFromSearch,
      addWatchToShow,
      updateShowWatchRecords,
      updateShowCache,
      updateBatchShowCache,
      getShowById,
      removeShowEntry,
      onPersist
    ]
  );

  return <TvContext.Provider value={value}>{children}</TvContext.Provider>;
}

export function useTvStore() {
  const ctx = useContext(TvContext);
  if (!ctx) throw new Error('useTvStore must be used within TvProvider');
  return ctx;
}

