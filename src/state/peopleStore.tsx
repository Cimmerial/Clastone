import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { pruneItem } from '../lib/firestorePeople';
import type { RankedItemBase } from '../components/RankedList';
import type { ClassKey } from '../components/RankedList';
import type { TmdbPersonCache } from '../lib/tmdb';
import { tmdbPersonDetailsFull } from '../lib/tmdb';
import { useMoviesStore } from './moviesStore';
import { useTvStore } from './tvStore';
import { getTotalMinutesFromRecords, getTotalEpisodesFromRecords } from './moviesStore';

export type PersonItem = RankedItemBase & {
    title: string; // Actor name
    media_type: 'person';
    tmdbId?: number;
    profilePath?: string;
    birthday?: string;
    deathday?: string;
    biography?: string;
    knownForDepartment?: string;
    roles?: Array<{
        id: number;
        title: string;
        mediaType: 'movie' | 'tv';
        character?: string;
        job?: string;
        posterPath?: string;
        popularity: number;
        voteCount?: number;
        releaseDate?: string;
    }>;

    // Watchtime stats (calculated)
    movieMinutes: number;
    showMinutes: number;
    moviesSeen: string[]; // movie element IDs
    showsSeen: string[]; // show element IDs

    firstSeenDate?: string; // YYYY-MM-DD
    lastSeenDate?: string; // YYYY-MM-DD

    percentileRank: string;
    absoluteRank: string;
    rankInClass: string;
};

export type PeopleClassDef = {
    key: string;
    label: string;
    tagline?: string;
    isRanked: boolean;
};

export const defaultPeopleClasses: PeopleClassDef[] = [
    { key: 'WORSHIP', label: 'WORSHIP', isRanked: true },
    { key: 'ADORE', label: 'ADORE', isRanked: true },
    { key: 'RESPECT', label: 'RESPECT', isRanked: true },
    { key: 'LIKE', label: 'LIKE', isRanked: true },
    { key: 'KAL-EL_NO', label: 'KAL-EL NO', isRanked: true },
    { key: 'NEMESIS', label: 'NEMESIS', isRanked: true },
    { key: 'UNRANKED', label: 'UNRANKED', isRanked: false },
];

type PeopleStore = {
    classes: PeopleClassDef[];
    classOrder: string[];
    byClass: Record<string, PersonItem[]>;
    addPersonFromSearch: (incoming: {
        id: string;
        title: string;
        profilePath?: string;
        classKey: string;
        cache?: TmdbPersonCache;
        position?: 'top' | 'middle' | 'bottom';
    }) => void;

    moveItemToClass: (itemId: string, toClassKey: string, options?: { toTop?: boolean; toMiddle?: boolean }) => void;
    updatePersonCache: (itemId: string, cache: Partial<TmdbPersonCache>) => void;
    removePersonEntry: (itemId: string) => void;
    getPersonById: (id: string) => PersonItem | null;
    forceSync: () => Promise<void>;
    reorderWithinClass: (classKey: string, orderedIds: string[]) => void;
    moveItemWithinClass: (itemId: string, direction: number) => void;
    moveItemInClassOrder: (classKey: string, direction: number) => void;
    renameItemClass: (classKey: string, newLabel: string) => void;
    renameItemClassTagline: (classKey: string, newTagline: string) => void;
    addClass: (label: string, options: { isRanked: boolean }) => void;
    deleteClass: (classKey: string) => void;
    forceRefreshPerson: (itemId: string) => Promise<void>;
};

const PeopleContext = createContext<PeopleStore | null>(null);

export function PeopleProvider({
    children,
    initialByClass,
    initialClasses,
    onPersist
}: {
    children: React.ReactNode;
    initialByClass?: Record<string, PersonItem[]>;
    initialClasses?: PeopleClassDef[];
    onPersist?: (payload: {
        byClass: Record<string, PersonItem[]>;
        classes: PeopleClassDef[];
        pendingCount?: number;
        dirtyClasses?: string[];
        classesMetadataChanged?: boolean;
    }) => Promise<void>;
}) {
    const [classes, setClasses] = useState<PeopleClassDef[]>(initialClasses ?? defaultPeopleClasses);
    const classOrder = useMemo(() => classes.map(c => c.key), [classes]);
    const [byClass, setByClass] = useState<Record<string, PersonItem[]>>(initialByClass ?? {});


    const { byClass: moviesByClass } = useMoviesStore();
    const { byClass: tvByClass } = useTvStore();

    const [pendingChanges, setPendingChanges] = useState(0);
    const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Track what was last explicitly saved to calculate diffs.
    const lastSavedStateRef = useRef({ byClass, classes });
    const isHydratedRef = useRef(false);

    // We need current values for the strict forceSync
    const currentStateRef = useRef({ byClass, classes });
    currentStateRef.current = { byClass, classes };

    // Watchtime calculation logic
    useEffect(() => {
        setByClass(prev => {
            const next = { ...prev };
            let changed = false;

            // Extract all movies and shows the user has seen
            const allMovies = Object.values(moviesByClass).flat();
            const allShows = Object.values(tvByClass).flat();

            for (const classKey of Object.keys(next)) {
                const list = next[classKey] ?? [];
                const newList = list.map(person => {
                    if (!person.tmdbId) return person;

                    const roles = person.roles ?? [];
                    const movieCredits = allMovies.filter(m =>
                        roles.some(r => r.mediaType === 'movie' && `tmdb-movie-${r.id}` === m.id) &&
                        (m.watchRecords?.length ?? 0) > 0
                    );
                    const showCredits = allShows.filter(s =>
                        roles.some(r => r.mediaType === 'tv' && `tmdb-tv-${r.id}` === s.id) &&
                        (s.watchRecords?.length ?? 0) > 0
                    );

                    const movieMinutes = movieCredits.reduce((sum, m) => sum + getTotalMinutesFromRecords(m.watchRecords ?? [], m.runtimeMinutes), 0);
                    const showMinutes = showCredits.reduce((sum, s) => {
                        // Using getTotalMinutesFromRecords for shows as well, since s.runtimeMinutes is the total show duration
                        return sum + getTotalMinutesFromRecords(s.watchRecords ?? [], s.runtimeMinutes);
                    }, 0);

                    const moviesSeen = movieCredits.map(m => m.id);
                    const showsSeen = showCredits.map(s => s.id);

                    const allRecords = [
                        ...movieCredits.flatMap(m => m.watchRecords ?? []),
                        ...showCredits.flatMap(s => s.watchRecords ?? [])
                    ].filter(r => (r.year ?? 0) > 0);

                    // Sort chronologically
                    allRecords.sort((a, b) => {
                        const aVal = (a.year || 0) * 10000 + (a.month || 0) * 100 + (a.day || 0);
                        const bVal = (b.year || 0) * 10000 + (b.month || 0) * 100 + (b.day || 0);
                        return aVal - bVal;
                    });

                    const first = allRecords[0];
                    const last = allRecords[allRecords.length - 1];

                    const firstSeenDate = first ? `${first.year}-${String(first.month || 1).padStart(2, '0')}-${String(first.day || 1).padStart(2, '0')}` : undefined;
                    const lastSeenDate = last ? `${last.year}-${String(last.month || 1).padStart(2, '0')}-${String(last.day || 1).padStart(2, '0')}` : undefined;

                    if (
                        person.movieMinutes !== movieMinutes ||
                        person.showMinutes !== showMinutes ||
                        person.moviesSeen.length !== moviesSeen.length ||
                        person.showsSeen.length !== showsSeen.length ||
                        person.firstSeenDate !== firstSeenDate ||
                        person.lastSeenDate !== lastSeenDate
                    ) {
                        changed = true;
                        return {
                            ...person,
                            movieMinutes,
                            showMinutes,
                            moviesSeen,
                            showsSeen,
                            firstSeenDate,
                            lastSeenDate
                        };
                    }
                    return person;
                });

                if (changed) {
                    next[classKey] = newList;
                }
            }

            return changed ? next : prev;
        });
    }, [moviesByClass, tvByClass]);


    // Debounced persistence logic
    useEffect(() => {
        // 1. Skip the very first "fresh load" mutation
        if (!isHydratedRef.current) {
            setByClass(prev => cleanupDuplicates(prev));
            lastSavedStateRef.current = { byClass, classes };
            isHydratedRef.current = true;
            return;
        }

        if (!onPersist) return;

        // 2. Diffing
        const dirtyClasses: string[] = [];
        const classesMetadataChanged = classes !== lastSavedStateRef.current.classes;

        for (const c of classes) {
            if (byClass[c.key] !== lastSavedStateRef.current.byClass[c.key]) {
                dirtyClasses.push(c.key);
            }
        }

        // 3. Early return if no changes
        if (dirtyClasses.length === 0 && !classesMetadataChanged) {
            return;
        }

        setPendingChanges((p) => p + 1);

        if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);

        const savedByClass = byClass;
        const savedClasses = classes;

        persistTimeoutRef.current = setTimeout(() => {
            console.info(`[PeopleStore] Debounce finished. Executing onPersist...`);

            // 1. Calculate the pruned version of the data that will be saved
            const prunedByClass = { ...savedByClass };
            dirtyClasses.forEach(key => {
                if (prunedByClass[key]) {
                    prunedByClass[key] = prunedByClass[key].map(pruneItem);
                }
            });

            // 2. Persist to Firestore
            onPersist({
                byClass: savedByClass,
                classes: savedClasses,
                pendingCount: dirtyClasses.length + (classesMetadataChanged ? 1 : 0),
                dirtyClasses,
                classesMetadataChanged
            });

            // 3. Update local state to the pruned version so StorageVisualizer reflects "true" size
            // AND update the ref with the exact pruned version so the next diff check finds NO changes.
            setByClass(prunedByClass);
            lastSavedStateRef.current = { byClass: prunedByClass, classes: savedClasses };

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

    // Handle browser tab closure / refresh
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (persistTimeoutRef.current && onPersist) {
                const dirtyClasses: string[] = [];
                const classesMetadataChanged = currentStateRef.current.classes !== lastSavedStateRef.current.classes;
                for (const c of currentStateRef.current.classes) {
                    if (currentStateRef.current.byClass[c.key] !== lastSavedStateRef.current.byClass[c.key]) {
                        dirtyClasses.push(c.key);
                    }
                }

                onPersist({
                    ...currentStateRef.current,
                    pendingCount: dirtyClasses.length + (classesMetadataChanged ? 1 : 0),
                    dirtyClasses,
                    classesMetadataChanged
                });

                if (pendingChanges > 0) {
                    e.preventDefault();
                    e.returnValue = 'Saving people changes...';
                    return e.returnValue;
                }
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [onPersist, pendingChanges]);


    const cleanupDuplicates = useCallback((prev: Record<string, PersonItem[]>) => {
        const next = { ...prev };
        const seenIds = new Map<string, { classKey: string; index: number; isRanked: boolean }>();
        let hasChanges = false;

        const classDefs = classes;
        const rankedKeys = new Set(classDefs.filter(c => c.isRanked).map(c => c.key));

        for (const classKey of classOrder) {
            const list = next[classKey] ?? [];
            const filteredList: PersonItem[] = [];

            for (let i = 0; i < list.length; i++) {
                const item = list[i];
                const existing = seenIds.get(item.id);
                const isRanked = rankedKeys.has(classKey);

                if (existing) {
                    hasChanges = true;
                    // Logic: Ranked > Unranked, higher Rank > lower Rank
                    let keepNew = false;
                    if (isRanked && !existing.isRanked) {
                        keepNew = true;
                    } else if (isRanked && existing.isRanked) {
                        const oldClassIdx = classOrder.indexOf(existing.classKey);
                        const newClassIdx = classOrder.indexOf(classKey);
                        if (newClassIdx < oldClassIdx) {
                            keepNew = true;
                        } else if (newClassIdx === oldClassIdx && i < existing.index) {
                            keepNew = true;
                        }
                    }

                    if (keepNew) {
                        // Remove old one from its class
                        next[existing.classKey] = next[existing.classKey].filter(it => it.id !== item.id);
                        filteredList.push(item);
                        seenIds.set(item.id, { classKey, index: i, isRanked });
                    }
                    // Else: discard this one (the old one was better)
                } else {
                    filteredList.push(item);
                    seenIds.set(item.id, { classKey, index: i, isRanked });
                }
            }
            next[classKey] = filteredList;
        }
        return hasChanges ? next : prev;
    }, [classOrder, classes]);


    const addPersonFromSearch = useCallback((incoming: {
        id: string;
        title: string;
        profilePath?: string;
        classKey: string;
        cache?: TmdbPersonCache;
        position?: 'top' | 'middle' | 'bottom';
    }) => {
        setByClass(prev => {
            const rankedKeys = new Set(classes.filter(c => c.isRanked).map(c => c.key));
            const isTargetRanked = rankedKeys.has(incoming.classKey);

            // Find existing
            let existingItem: PersonItem | null = null;
            let existingClass: string | null = null;
            for (const k of Object.keys(prev)) {
                const found = prev[k].find(p => p.id === incoming.id);
                if (found) {
                    existingItem = found;
                    existingClass = k;
                    break;
                }
            }

            if (existingItem && existingClass) {
                const isExistingRanked = rankedKeys.has(existingClass);
                let shouldMove = false;

                if (isTargetRanked && !isExistingRanked) {
                    shouldMove = true;
                } else if (isTargetRanked && isExistingRanked) {
                    const oldClassIdx = classOrder.indexOf(existingClass);
                    const newClassIdx = classOrder.indexOf(incoming.classKey);
                    if (newClassIdx < oldClassIdx) shouldMove = true;
                } else if (!isTargetRanked && !isExistingRanked) {
                    // Both unranked, move to newest selection
                    shouldMove = true;
                }

                if (!shouldMove) return prev;

                // Remove from old, add to new
                const next = { ...prev };
                next[existingClass] = next[existingClass].filter(it => it.id !== incoming.id);

                const target = next[incoming.classKey] ?? [];
                existingItem.classKey = incoming.classKey as any;
                if (incoming.position === 'top') {
                    next[incoming.classKey] = [existingItem, ...target];
                } else if (incoming.position === 'middle') {
                    const mid = Math.ceil(target.length / 2);
                    next[incoming.classKey] = [...target.slice(0, mid), existingItem, ...target.slice(mid)];
                } else {
                    next[incoming.classKey] = [...target, existingItem];
                }
                return next;
            }

            const cache = incoming.cache;
            const base: PersonItem = {
                id: incoming.id,
                classKey: incoming.classKey as any,
                title: cache?.name ?? incoming.title,
                media_type: 'person',
                tmdbId: cache?.tmdbId,
                profilePath: cache?.profilePath ?? incoming.profilePath,
                birthday: cache?.birthday,
                deathday: cache?.deathday,
                biography: cache?.biography,
                knownForDepartment: cache?.knownForDepartment,
                roles: cache?.roles,
                movieMinutes: 0,
                showMinutes: 0,
                moviesSeen: [],
                showsSeen: [],
                percentileRank: '—',
                absoluteRank: '—',
                rankInClass: 'Unranked'
            };

            const next = { ...prev };
            const target = next[incoming.classKey] ?? [];
            if (incoming.position === 'top') {
                next[incoming.classKey] = [base, ...target];
            } else if (incoming.position === 'middle') {
                const mid = Math.ceil(target.length / 2);
                next[incoming.classKey] = [...target.slice(0, mid), base, ...target.slice(mid)];
            } else {
                next[incoming.classKey] = [...target, base];
            }
            return next;
        });
    }, []);


    const moveItemToClass = useCallback((itemId: string, toClassKey: string, options?: { toTop?: boolean; toMiddle?: boolean }) => {
        setByClass(prev => {
            const next = { ...prev };
            let item: PersonItem | null = null;
            for (const k of Object.keys(next)) {
                const idx = next[k]?.findIndex(p => p.id === itemId) ?? -1;
                if (idx !== -1) {
                    [item] = next[k].splice(idx, 1);
                    break;
                }
            }
            if (!item) return prev;
            item.classKey = toClassKey as any;
            const target = next[toClassKey] ?? [];
            if (options?.toTop) {
                next[toClassKey] = [item, ...target];
            } else if (options?.toMiddle) {
                const mid = Math.ceil(target.length / 2);
                next[toClassKey] = [...target.slice(0, mid), item, ...target.slice(mid)];
            } else {
                next[toClassKey] = [...target, item];
            }
            return next;
        });
    }, []);

    const updatePersonCache = useCallback((itemId: string, cache: Partial<TmdbPersonCache>) => {
        setByClass(prev => {
            const next = { ...prev };
            for (const k of Object.keys(next)) {
                const idx = next[k]?.findIndex(p => p.id === itemId) ?? -1;
                if (idx !== -1) {
                    next[k][idx] = { ...next[k][idx], ...cache };
                    return next;
                }
            }
            return prev;
        });
    }, []);

    const removePersonEntry = useCallback((itemId: string) => {
        setByClass(prev => {
            const next = { ...prev };
            for (const k of Object.keys(next)) {
                const idx = next[k]?.findIndex(p => p.id === itemId) ?? -1;
                if (idx !== -1) {
                    next[k].splice(idx, 1);
                    return next;
                }
            }
            return prev;
        });
    }, []);

    const getPersonById = useCallback((id: string) => {
        for (const k of Object.keys(byClass)) {
            const found = byClass[k].find(p => p.id === id);
            if (found) return found;
        }
        return null;
    }, [byClass]);

    const reorderWithinClass = useCallback((classKey: string, orderedIds: string[]) => {
        setByClass(prev => {
            const list = prev[classKey];
            if (!list) return prev;
            const next = { ...prev };
            next[classKey] = orderedIds.map(id => list.find(item => item.id === id)!);
            return next;
        });
    }, []);

    const moveItemWithinClass = useCallback((itemId: string, direction: number) => {
        setByClass(prev => {
            const next = { ...prev };
            for (const k of Object.keys(next)) {
                const list = next[k];
                const idx = list.findIndex(p => p.id === itemId);
                if (idx !== -1) {
                    const newIdx = idx + direction;
                    if (newIdx < 0 || newIdx >= list.length) return prev;
                    const newList = [...list];
                    const [item] = newList.splice(idx, 1);
                    newList.splice(newIdx, 0, item);
                    next[k] = newList;
                    return next;
                }
            }
            return prev;
        });
    }, []);

    const moveItemInClassOrder = useCallback((classKey: string, direction: number) => {
        setClasses(prev => {
            const idx = prev.findIndex(c => c.key === classKey);
            if (idx === -1) return prev;
            const newIdx = idx + direction;
            if (newIdx < 0 || newIdx >= prev.length) return prev;
            const next = [...prev];
            const [item] = next.splice(idx, 1);
            next.splice(newIdx, 0, item);
            return next;
        });
    }, []);

    const renameItemClass = useCallback((classKey: string, newLabel: string) => {
        setClasses(prev => prev.map(c => c.key === classKey ? { ...c, label: newLabel } : c));
    }, []);

    const renameItemClassTagline = useCallback((classKey: string, newTagline: string) => {
        setClasses(prev => prev.map(c => c.key === classKey ? { ...c, tagline: newTagline } : c));
    }, []);

    const addClass = useCallback((label: string, options: { isRanked: boolean }) => {
        setClasses(prev => {
            const key = label.toUpperCase().replace(/\s+/g, '_');
            if (prev.some(c => c.key === key)) return prev;
            return [...prev, { key, label, isRanked: options.isRanked }];
        });
    }, []);

    const deleteClass = useCallback((classKey: string) => {
        setClasses(prev => prev.filter(c => c.key !== classKey));
        setByClass(prev => {
            const next = { ...prev };
            delete next[classKey];
            return next;
        });
    }, []);

    const forceRefreshPerson = useCallback(async (itemId: string) => {
        let tmdbId: number | undefined;
        for (const k of Object.keys(byClass)) {
            const found = byClass[k].find(p => p.id === itemId);
            if (found) {
                tmdbId = found.tmdbId;
                break;
            }
        }
        if (!tmdbId) return;

        try {
            const cache = await tmdbPersonDetailsFull(tmdbId);
            if (cache) {
                updatePersonCache(itemId, cache);
            }
        } catch (e) {
            console.error('[Clastone] forceRefreshPerson failed', e);
        }
    }, [byClass, updatePersonCache]);

    const value = useMemo(() => ({
        classes,
        classOrder,
        byClass,
        addPersonFromSearch,
        moveItemToClass,
        updatePersonCache,
        removePersonEntry,
        getPersonById,
        forceSync: async () => {
            if (onPersist) {
                const dirtyClasses: string[] = [];
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
        },
        reorderWithinClass,
        moveItemWithinClass,
        moveItemInClassOrder,
        renameItemClass,
        renameItemClassTagline,
        addClass,
        deleteClass,
        forceRefreshPerson
    }), [classes, classOrder, byClass, addPersonFromSearch, moveItemToClass, updatePersonCache, removePersonEntry, getPersonById, onPersist, reorderWithinClass, moveItemWithinClass, moveItemInClassOrder, renameItemClass, renameItemClassTagline, addClass, deleteClass, forceRefreshPerson]);

    return <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>;
}

export function usePeopleStore() {
    const ctx = useContext(PeopleContext);
    if (!ctx) throw new Error('usePeopleStore must be used within PeopleProvider');
    return ctx;
}
