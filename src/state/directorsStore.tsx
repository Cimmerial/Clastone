import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getPersistDebounceMs, subscribePersistDebounce } from '../lib/persistDebounce';
import { pruneItem } from '../lib/firestoreDirectors';
import type { RankedItemBase } from '../components/RankedList';
import type { ClassKey } from '../components/RankedList';
import type { TmdbPersonCache } from '../lib/tmdb';
import { tmdbPersonDetailsFull } from '../lib/tmdb';
import { directorTemplates, mergePersonByClassForTemplate, type PersonTemplateId } from '../lib/classTemplates';

export type DirectorItem = RankedItemBase & {
    title: string; // Actor name
    media_type: 'director';
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

export type DirectorsClassDef = {
    key: string;
    label: string;
    tagline?: string;
    isRanked: boolean;
};

export const defaultDirectorsClasses: DirectorsClassDef[] = [
    { key: 'WORSHIP', label: 'WORSHIP', isRanked: true },
    { key: 'ADORE', label: 'ADORE', isRanked: true },
    { key: 'RESPECT', label: 'RESPECT', isRanked: true },
    { key: 'LIKE', label: 'LIKE', isRanked: true },
    { key: 'INDIFFERENT', label: 'INDIFFERENT', isRanked: true },
    { key: 'KAL-EL_NO', label: 'KAL-EL NO', isRanked: true },
    { key: 'NEMESIS', label: 'NEMESIS', isRanked: true },
    { key: 'UNRANKED', label: 'UNRANKED', isRanked: false },
];

type DirectorsStore = {
    classes: DirectorsClassDef[];
    classOrder: string[];
    byClass: Record<string, DirectorItem[]>;
    addDirectorFromSearch: (incoming: {
        id: string;
        title: string;
        profilePath?: string;
        classKey: string;
        cache?: TmdbPersonCache;
        position?: 'top' | 'middle' | 'bottom';
    }) => void;

    moveItemToClass: (itemId: string, toClassKey: string, options?: { toTop?: boolean; toMiddle?: boolean; atIndex?: number }) => void;
    updateDirectorCache: (itemId: string, cache: Partial<TmdbPersonCache>) => void;
    removeDirectorEntry: (itemId: string) => void;
    getDirectorById: (id: string) => DirectorItem | null;
    forceSync: () => Promise<void>;
    reorderWithinClass: (classKey: string, orderedIds: string[]) => void;
    moveItemWithinClass: (itemId: string, direction: number) => void;
    moveItemInClassOrder: (classKey: string, direction: number) => void;
    renameItemClass: (classKey: string, newLabel: string) => void;
    renameItemClassTagline: (classKey: string, newTagline: string) => void;
    addClass: (label: string, options: { isRanked: boolean }) => void;
    deleteClass: (classKey: string) => void;
    forceRefreshDirector: (itemId: string) => Promise<void>;
    applyDirectorTemplate: (templateId: PersonTemplateId) => void;
};

const DirectorsContext = createContext<DirectorsStore | null>(null);

export function DirectorsProvider({
    children,
    initialByClass,
    initialClasses,
    onPersist
}: {
    children: React.ReactNode;
    initialByClass?: Record<string, DirectorItem[]>;
    initialClasses?: DirectorsClassDef[];
    onPersist?: (payload: {
        byClass: Record<string, DirectorItem[]>;
        classes: DirectorsClassDef[];
        pendingCount?: number;
        dirtyClasses?: string[];
        classesMetadataChanged?: boolean;
    }) => Promise<void>;
}) {
    const initialDirectorClasses = initialClasses ?? defaultDirectorsClasses;
    const [classes, setClasses] = useState<DirectorsClassDef[]>(initialDirectorClasses);
    const classOrder = useMemo(() => classes.map(c => c.key), [classes]);
    const [byClass, setByClass] = useState<Record<string, DirectorItem[]>>(
        () =>
            initialByClass ??
            (Object.fromEntries(initialDirectorClasses.map((c) => [c.key, []])) as Record<string, DirectorItem[]>)
    );


    const [pendingChanges, setPendingChanges] = useState(0);
    const [persistDebounceTick, setPersistDebounceTick] = useState(0);
    const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => subscribePersistDebounce(() => setPersistDebounceTick((t) => t + 1)), []);

    // Track what was last explicitly saved to calculate diffs.
    const lastSavedStateRef = useRef({ byClass, classes });
    const isHydratedRef = useRef(false);

    // We need current values for the strict forceSync
    const currentStateRef = useRef({ byClass, classes });
    currentStateRef.current = { byClass, classes };

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
            console.info(`[DirectorsStore] Debounce finished. Executing onPersist...`);

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
        }, getPersistDebounceMs());

        return () => {
            if (persistTimeoutRef.current) {
                clearTimeout(persistTimeoutRef.current);
                persistTimeoutRef.current = null;
            }
        };
    }, [byClass, classes, onPersist, persistDebounceTick]);

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
                    e.returnValue = 'Saving directors changes...';
                    return e.returnValue;
                }
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [onPersist, pendingChanges]);


    const cleanupDuplicates = useCallback((prev: Record<string, DirectorItem[]>) => {
        const next = { ...prev };
        const seenIds = new Map<string, { classKey: string; index: number; isRanked: boolean }>();
        let hasChanges = false;

        const classDefs = classes;
        const rankedKeys = new Set(classDefs.filter(c => c.isRanked).map(c => c.key));

        for (const classKey of classOrder) {
            const list = next[classKey] ?? [];
            const filteredList: DirectorItem[] = [];

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

    const addDirectorFromSearch = useCallback((incoming: {
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
            let existingItem: DirectorItem | null = null;
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
            const base: DirectorItem = {
                id: incoming.id,
                classKey: incoming.classKey as any,
                title: cache?.name ?? incoming.title,
                media_type: 'director',
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
    }, [classes, classOrder]);


    const moveItemToClass = useCallback((itemId: string, toClassKey: string, options?: { toTop?: boolean; toMiddle?: boolean; atIndex?: number }) => {
        setByClass(prev => {
            const next = { ...prev };
            let item: DirectorItem | null = null;

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
            const updated = { ...item, classKey: toClassKey };
            const targetList = next[toClassKey] ?? [];
            
            if (options?.atIndex !== undefined) {
                const insertIdx = Math.min(options.atIndex, targetList.length);
                const copy = [...targetList];
                copy.splice(insertIdx, 0, updated);
                next[toClassKey] = copy;
            } else if (options?.toTop) {
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


    const updateDirectorCache = useCallback((itemId: string, cache: Partial<TmdbPersonCache>) => {
        setByClass(prev => {
            const next = { ...prev };
            let changed = false;
            for (const k of Object.keys(next)) {
                const list = next[k] ?? [];
                if (!list.some(p => p.id === itemId)) continue;
                next[k] = list.map((item) => (item.id === itemId ? { ...item, ...cache } : item));
                changed = true;
                break;
            }
            return changed ? next : prev;
        });
    }, []);

    const removeDirectorEntry = useCallback((itemId: string) => {
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

    const getDirectorById = useCallback((id: string) => {
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
            const nextClass = { key, label, isRanked: options.isRanked };
            if (!options.isRanked) return [...prev, nextClass];
            const firstUnrankedIdx = prev.findIndex((c) => c.isRanked === false);
            if (firstUnrankedIdx === -1) return [...prev, nextClass];
            return [...prev.slice(0, firstUnrankedIdx), nextClass, ...prev.slice(firstUnrankedIdx)];
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

    const forceRefreshDirector = useCallback(async (itemId: string) => {
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
                const { profilePath: _ignoredProfilePath, ...cacheWithoutProfile } = cache;
                updateDirectorCache(itemId, cacheWithoutProfile);
            }
        } catch (e) {
            console.error('[Clastone] forceRefreshDirector failed', e);
        }
    }, [byClass, updateDirectorCache]);

    const applyDirectorTemplate = useCallback((templateId: PersonTemplateId) => {
        const pack = directorTemplates[templateId];
        setClasses(pack.classes);
        setByClass((prev) => mergePersonByClassForTemplate<DirectorItem>(prev, pack.classes));
    }, []);

    const value = useMemo(() => ({
        classes,
        classOrder,
        byClass,
        addDirectorFromSearch,
        moveItemToClass,
        updateDirectorCache,
        removeDirectorEntry,
        getDirectorById,
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
        forceRefreshDirector,
        applyDirectorTemplate
    }), [classes, classOrder, byClass, addDirectorFromSearch, moveItemToClass, updateDirectorCache, removeDirectorEntry, getDirectorById, onPersist, reorderWithinClass, moveItemWithinClass, moveItemInClassOrder, renameItemClass, renameItemClassTagline, addClass, deleteClass, forceRefreshDirector, applyDirectorTemplate]);

    return <DirectorsContext.Provider value={value}>{children}</DirectorsContext.Provider>;
}

export function useDirectorsStore() {
    const ctx = useContext(DirectorsContext);
    if (!ctx) throw new Error('useDirectorsStore must be used within DirectorsProvider');
    return ctx;
}
