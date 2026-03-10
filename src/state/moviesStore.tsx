import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { MovieShowItem, WatchRecord, WatchRecordType } from '../components/EntryRowMovieShow';
import type { ClassKey } from '../components/RankedList';
import type { TmdbMovieCache } from '../lib/tmdb';
import { defaultMovieClassDefs, movieClasses, moviesByClass as initialMoviesByClass, type MovieClassDef } from '../mock/movies';

function dateParts(r: WatchRecord, useEnd = false): { y: number; m: number; d: number } {
  const y = useEnd ? (r.endYear ?? r.year ?? 0) : (r.year ?? 0);
  const m = useEnd ? (r.endMonth ?? r.month ?? 0) : (r.month ?? 0);
  const d = useEnd ? (r.endDay ?? r.day ?? 0) : (r.day ?? 0);
  return { y, m, d };
}

/** Format y, m, d as "Jan 21, 2026" (month name, day, year). */
function formatDateParts(y: number, m: number, d: number): string {
  if (y === 0) return 'Date';
  if (!m && !d) return String(y);
  const monthName = m
    ? new Date(2000, m - 1, 1).toLocaleString('default', { month: 'short' })
    : '';
  if (!d) return monthName ? `${monthName} ${y}` : String(y);
  return monthName ? `${monthName} ${d}, ${y}` : `${d}, ${y}`;
}

export function formatWatchLabel(r: WatchRecord): string {
  const t = r.type ?? 'DATE';
  switch (t) {
    case 'DNF': {
      const { y, m, d } = dateParts(r, false);
      if (y > 0) return `DNF (started ${formatDateParts(y, m, d)})`;
      return 'DNF';
    }
    case 'DNF_LONG_AGO': {
      return `DNF Long Ago (${r.dnfPercent ?? 50}%)`;
    }
    case 'CURRENT': {
      const { y, m, d } = dateParts(r, false);
      if (y > 0) return `Currently watching (started ${formatDateParts(y, m, d)})`;
      return 'Currently watching';
    }
    case 'LONG_AGO':
      return 'Long ago';
    case 'UNKNOWN':
      return 'Unknown';
    case 'RANGE': {
      const start = dateParts(r, false);
      const end = dateParts(r, true);
      if (start.y === 0 && end.y === 0) return 'Range';
      const endStr = formatDateParts(end.y, end.m, end.d);
      if (start.y === end.y && start.m === end.m && start.d === end.d) return endStr;
      const startStr = formatDateParts(start.y, start.m, start.d);
      return `${startStr} – ${endStr}`;
    }
    case 'DATE':
    default: {
      const { y, m, d } = dateParts(r, false);
      return formatDateParts(y, m, d);
    }
  }
}

/** Sort key for a watch record (YYYY-MM-DD style; "0000-00-00" for LONG_AGO/UNKNOWN). Export for profile/recent lists. */
export function getWatchRecordSortKey(r: WatchRecord): string {
  const t = r.type ?? 'DATE';
  if (t === 'DATE') {
    const { y, m, d } = dateParts(r, false);
    return `${y}-${String(m || 0).padStart(2, '0')}-${String(d || 0).padStart(2, '0')}`;
  }
  if (t === 'RANGE') {
    const { y, m, d } = dateParts(r, true);
    return `${y}-${String(m || 0).padStart(2, '0')}-${String(d || 0).padStart(2, '0')}`;
  }
  if ((t === 'DNF' || t === 'CURRENT') && (r.year ?? 0) > 0) {
    const { y, m, d } = dateParts(r, false);
    return `${y}-${String(m || 0).padStart(2, '0')}-${String(d || 0).padStart(2, '0')}`;
  }
  return '0000-00-00';
}

function recordSortKey(r: WatchRecord): string {
  return getWatchRecordSortKey(r);
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
    } else if (t === 'DNF' || t === 'CURRENT') {
      const pct = Math.min(100, Math.max(0, r.dnfPercent ?? 0));
      total += (pct / 100) * runtime;
    }
  }
  return total;
}

/** Total episodes watched from TV watch records (full watch = totalEpisodes, DNF/CURRENT = fraction). */
export function getTotalEpisodesFromRecords(
  records: WatchRecord[],
  totalEpisodes?: number
): number {
  const eps = totalEpisodes ?? 0;
  let total = 0;
  for (const r of records) {
    const t = r.type ?? 'DATE';
    if (t === 'DATE' || t === 'RANGE' || t === 'LONG_AGO' || t === 'UNKNOWN') {
      total += eps;
    } else if (t === 'DNF' || t === 'CURRENT') {
      const pct = Math.min(100, Math.max(0, r.dnfPercent ?? 0));
      total += (pct / 100) * eps;
    }
  }
  return Math.round(total);
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
    } else if (t === 'DNF' || t === 'CURRENT' || t === 'DNF_LONG_AGO') {
      const percent = Math.min(100, Math.max(0, r.dnfPercent ?? 0));
      pctSum += percent;
      totalMins += (percent / 100) * runtime;
    }
  }
  const pct = `${Math.round(pctSum)}%`;
  const watchTime = totalMins > 0 ? formatDuration(totalMins) : '';
  let watchedLabel = `Watched ${n}×`;
  const approxWatches = pctSum / 100;
  if (approxWatches > 1 && approxWatches < 2 && n >= 2) {
    watchedLabel = 'Watched 1-2×';
  }
  const viewingDates =
    `${watchedLabel} · Last: ${lastStr} · ${pct}` + (watchTime ? ` · ${watchTime}` : '');
  return { viewingDates, percentCompleted: pct, watchTime };
}

type MoviesStore = {
  classes: MovieClassDef[];
  classOrder: ClassKey[];
  getClassLabel: (classKey: ClassKey) => string;
  getClassTagline: (classKey: ClassKey) => string | undefined;
  isRankedClass: (classKey: ClassKey) => boolean;
  byClass: Record<ClassKey, MovieShowItem[]>;
  globalRanks: Map<string, { absoluteRank: string; percentileRank: string }>;
  moveWithinClass: (itemId: string, delta: number) => void;
  reorderWithinClass: (classKey: ClassKey, orderedIds: string[]) => void;
  moveToOtherClass: (itemId: string, deltaClass: number) => void;
  moveItemToClass: (itemId: string, toClassKey: ClassKey, options?: { toTop?: boolean; toMiddle?: boolean }) => void;
  addClass: (label: string, options?: { isRanked?: boolean }) => void;
  renameClassLabel: (classKey: ClassKey, newLabel: string) => void;
  renameClassTagline: (classKey: ClassKey, tagline: string) => void;
  moveClass: (classKey: ClassKey, delta: number) => void;
  deleteClass: (classKey: ClassKey) => void;
  addMovieFromSearch: (
    item: Pick<MovieShowItem, 'id' | 'title'> & {
      subtitle?: string;
      classKey: ClassKey;
      firstWatch?: WatchRecord;
      runtimeMinutes?: number;
      posterPath?: string;
      /** Full cache from TMDB so we don't need to re-fetch on load. */
      cache?: TmdbMovieCache;
      /** If false, insert at bottom of class (default true = top). */
      toTop?: boolean;
      toMiddle?: boolean;
    }
  ) => void;
  addWatchToMovie: (itemId: string, watch: WatchRecord, options?: { posterPath?: string }) => void;
  updateMovieWatchRecords: (itemId: string, records: WatchRecord[]) => void;
  setMovieRuntime: (itemId: string, runtimeMinutes: number) => void;
  /** Merge cached TMDB data onto an existing entry (e.g. when adding a watch we fetch details). */
  updateMovieCache: (itemId: string, cache: Partial<TmdbMovieCache>) => void;
  /** Bulk merge cached TMDB data onto multiple entries. */
  updateBatchMovieCache: (updates: Record<string, Partial<TmdbMovieCache>>) => void;
  getMovieById: (id: string) => MovieShowItem | null;
  /** Remove entry entirely from the list (e.g. when user deletes all watches in edit modal). */
  removeMovieEntry: (itemId: string) => void;
  /** Manually trigger a save to Firestore. */
  forceSync: () => Promise<void>;
};

const MoviesContext = createContext<MoviesStore | null>(null);

type MoviesProviderProps = {
  children: React.ReactNode;
  /** Hydrate from Firestore (when user logs in). */
  initialByClass?: Record<ClassKey, MovieShowItem[]>;
  initialClasses?: MovieClassDef[];
  /** Persist to Firestore when byClass changes (debounced). */
  onPersist?: (payload: {
    byClass: Record<ClassKey, MovieShowItem[]>;
    classes: MovieClassDef[];
    pendingCount?: number;
    dirtyClasses?: ClassKey[];
    classesMetadataChanged?: boolean;
  }) => Promise<void>;
};

export function MoviesProvider({ children, initialByClass, initialClasses, onPersist }: MoviesProviderProps) {
  const [classes, setClasses] = useState<MovieClassDef[]>(initialClasses ?? defaultMovieClassDefs);
  const classOrder = useMemo(() => classes.map((c) => c.key), [classes]);
  const [byClass, setByClass] = useState<Record<ClassKey, MovieShowItem[]>>(
    initialByClass ?? initialMoviesByClass
  );
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

    console.info(`[MoviesStore] Local changes detected (Dirty classes: ${dirtyClasses.join(', ')}). Queuing save in 10 seconds...`);

    setPendingChanges((p) => p + 1);

    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);

    // Capture the state *at this moment* to be used in the closure
    const savedByClass = byClass;
    const savedClasses = classes;

    persistTimeoutRef.current = setTimeout(() => {
      console.info(`[MoviesStore] Debounce finished. Executing onPersist...`);
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
      // Don't save on cleanup during active changes; let the new timeout handle it.
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

        console.info(`[MoviesStore] beforeunload triggered. Forcing emergency save of dirty state...`);
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

  // Keep byClass keys in sync with classes list (adds empty arrays for new classes).
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
      // Don't delete unknown keys automatically; that would risk data loss.
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
    setByClass((prev) => {
      const list = prev[classKey] ?? [];
      if (list.length > 0) return prev; // only delete empty
      const next = { ...prev };
      delete next[classKey];
      return next;
    });
    setClasses((prev) => prev.filter((c) => c.key !== classKey));
  }, []);

  const moveWithinClass = useCallback((itemId: string, delta: number) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      for (const classKey of classOrder) {
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
  }, [classOrder]);

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

  const moveToOtherClass = useCallback((itemId: string, deltaClass: number) => {
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
      if (toIndex < 0 || toIndex >= classOrder.length) {
        return prev;
      }

      const toKey = classOrder[toIndex];
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
  }, [classOrder]);

  const moveItemToClass = useCallback((itemId: string, toClassKey: ClassKey, options?: { toTop?: boolean; toMiddle?: boolean }) => {
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
        toTop?: boolean;
        toMiddle?: boolean;
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
          genres: cache?.genres,
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
          [toKey]: newList
        };
      });
    },
    []
  );

  const updateMovieCache = useCallback((itemId: string, cache: Partial<TmdbMovieCache>) => {
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
              ...(cache.directors != null && { directors: cache.directors }),
              ...(cache.genres != null && { genres: cache.genres })
            }
            : m
        );
        return next;
      }
      return prev;
    });
  }, [classOrder]);

  const updateBatchMovieCache = useCallback((updates: Record<string, Partial<TmdbMovieCache>>) => {
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
            ...(cache.directors != null && { directors: cache.directors }),
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

  const addWatchToMovie = useCallback(
    (itemId: string, watch: WatchRecord, options?: { posterPath?: string }) => {
      setByClass((prev) => {
        const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
        for (const classKey of classOrder) {
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
    [classOrder]
  );

  const updateMovieWatchRecords = useCallback((itemId: string, records: WatchRecord[]) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      for (const classKey of classOrder) {
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
  }, [classOrder]);

  const setMovieRuntime = useCallback((itemId: string, runtimeMinutes: number) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      for (const classKey of classOrder) {
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
  }, [classOrder]);

  const getMovieById = useCallback(
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

  const removeMovieEntry = useCallback((itemId: string) => {
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

  const value = useMemo<MoviesStore>(
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
      addMovieFromSearch,
      addWatchToMovie,
      updateMovieWatchRecords,
      setMovieRuntime,
      updateMovieCache,
      updateBatchMovieCache,
      getMovieById,
      removeMovieEntry,
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
    [classes, classOrder, getClassLabel, getClassTagline, isRankedClass, byClass, addClass, renameClassLabel, renameClassTagline, moveClass, deleteClass, moveToOtherClass, moveWithinClass, reorderWithinClass, moveItemToClass, addMovieFromSearch, addWatchToMovie, updateMovieWatchRecords, setMovieRuntime, updateMovieCache, updateBatchMovieCache, getMovieById, removeMovieEntry, onPersist]
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

