import { createContext, useContext, useState, useCallback, useMemo } from 'react';

export type SyncState = 'idle' | 'saving' | 'error';

export type SyncStatus = {
    movies: SyncState;
    tv: SyncState;
    watchlist: SyncState;
    settings: SyncState;
    people: SyncState;
    directors: SyncState;
    classes: SyncState;
    lastSaved?: Date;
    lastSavedLabel?: string;
    error?: string;
    pendingMovies: number;
    pendingTv: number;
    pendingWatchlist: number;
    pendingSettings: number;
    pendingPeople: number;
    pendingDirectors: number;
    pendingClasses: number;
    migration: {
        movies: boolean;
        tv: boolean;
        watchlist: boolean;
        people: boolean;
        directors: boolean;
    };
};

type DomainKey = keyof Omit<SyncStatus, 'lastSaved' | 'error' | 'lastSavedLabel' | 'pendingMovies' | 'pendingTv' | 'pendingWatchlist' | 'pendingSettings' | 'pendingClasses' | 'migration'>;

type SyncStatusContextType = {
    status: SyncStatus;
    updateStatus: (domain: DomainKey, state: SyncState, details?: {
        error?: string;
        pendingCount?: number;
        label?: string;
        isMigrated?: boolean;
    }) => void;
    updateMigrationStatus: (domain: 'movies' | 'tv' | 'watchlist' | 'people' | 'directors', isMigrated: boolean) => void;
};

const SyncStatusContext = createContext<SyncStatusContextType | null>(null);

export function SyncStatusProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<SyncStatus>({
        movies: 'idle',
        tv: 'idle',
        watchlist: 'idle',
        settings: 'idle',
        classes: 'idle',
        pendingMovies: 0,
        pendingTv: 0,
        pendingWatchlist: 0,
        pendingSettings: 0,
        pendingClasses: 0,
        people: 'idle',
        pendingPeople: 0,
        directors: 'idle',
        pendingDirectors: 0,
        migration: {
            movies: false,
            tv: false,
            watchlist: false,
            people: false,
            directors: false,
        }
    });

    const updateStatus = useCallback(
        (domain: DomainKey, state: SyncState, details?: {
            error?: string;
            pendingCount?: number;
            label?: string;
            isMigrated?: boolean;
        }) => {
            setStatus((prev) => {
                const next = { ...prev };

                // Update state for the specific domain
                if (domain === 'movies') next.movies = state;
                if (domain === 'tv') next.tv = state;
                if (domain === 'watchlist') next.watchlist = state;
                if (domain === 'settings') next.settings = state;
                if (domain === 'people') next.people = state;
                if (domain === 'directors') next.directors = state;
                if (domain === 'classes') next.classes = state;

                if (details?.pendingCount !== undefined) {
                    if (domain === 'movies') next.pendingMovies = details.pendingCount;
                    if (domain === 'tv') next.pendingTv = details.pendingCount;
                    if (domain === 'watchlist') next.pendingWatchlist = details.pendingCount;
                    if (domain === 'settings') next.pendingSettings = details.pendingCount;
                    if (domain === 'people') next.pendingPeople = details.pendingCount;
                    if (domain === 'directors') next.pendingDirectors = details.pendingCount;
                    if (domain === 'classes') next.pendingClasses = details.pendingCount;
                }

                if (state === 'idle') {
                    next.lastSaved = new Date();
                    if (details?.label) next.lastSavedLabel = details.label;

                    // On successful save, assume it's migrated
                    if (domain === 'movies') next.migration.movies = true;
                    if (domain === 'tv') next.migration.tv = true;
                    if (domain === 'watchlist') next.migration.watchlist = true;
                    if (domain === 'people') next.migration.people = true;
                    if (domain === 'directors') next.migration.directors = true;
                }

                if (details?.isMigrated !== undefined) {
                    if (domain === 'movies') next.migration.movies = details.isMigrated;
                    if (domain === 'tv') next.migration.tv = details.isMigrated;
                    if (domain === 'watchlist') next.migration.watchlist = details.isMigrated;
                    if (domain === 'people') next.migration.people = details.isMigrated;
                    if (domain === 'directors') next.migration.directors = details.isMigrated;
                }

                if (details?.error) {
                    next.error = details.error;
                } else if (state !== 'error') {
                    if (
                        next.movies !== 'error' &&
                        next.tv !== 'error' &&
                        next.watchlist !== 'error' &&
                        next.settings !== 'error' &&
                        next.classes !== 'error'
                    ) {
                        next.error = undefined;
                    }
                }
                return next;
            });
        },
        []
    );

    const updateMigrationStatus = useCallback((domain: 'movies' | 'tv' | 'watchlist' | 'people' | 'directors', isMigrated: boolean) => {
        setStatus(prev => ({
            ...prev,
            migration: {
                ...prev.migration,
                [domain]: isMigrated
            }
        }));
    }, []);

    const value = useMemo(() => ({ status, updateStatus, updateMigrationStatus }), [status, updateStatus, updateMigrationStatus]);

    return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>;
}

export function useSyncStatus() {
    const ctx = useContext(SyncStatusContext);
    if (!ctx) {
        throw new Error('useSyncStatus must be used within SyncStatusProvider');
    }
    return ctx;
}
