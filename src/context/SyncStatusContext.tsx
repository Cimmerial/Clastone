import { createContext, useContext, useState, useCallback, useMemo } from 'react';

export type SyncState = 'idle' | 'saving' | 'error';

export type SyncStatus = {
    movies: SyncState;
    tv: SyncState;
    watchlist: SyncState;
    lastSaved?: Date;
    lastSavedLabel?: string;
    error?: string;
    pendingMovies: number;
    pendingTv: number;
    pendingWatchlist: number;
};

type SyncStatusContextType = {
    status: SyncStatus;
    updateStatus: (domain: keyof Omit<SyncStatus, 'lastSaved' | 'error' | 'lastSavedLabel' | 'pendingMovies' | 'pendingTv' | 'pendingWatchlist'>, state: SyncState, details?: { error?: string; pendingCount?: number; label?: string }) => void;
};

const SyncStatusContext = createContext<SyncStatusContextType | null>(null);

export function SyncStatusProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<SyncStatus>({
        movies: 'idle',
        tv: 'idle',
        watchlist: 'idle',
        pendingMovies: 0,
        pendingTv: 0,
        pendingWatchlist: 0,
    });

    const updateStatus = useCallback(
        (domain: keyof Omit<SyncStatus, 'lastSaved' | 'error' | 'lastSavedLabel' | 'pendingMovies' | 'pendingTv' | 'pendingWatchlist'>, state: SyncState, details?: { error?: string; pendingCount?: number; label?: string }) => {
            setStatus((prev) => {
                const next = { ...prev, [domain]: state };

                if (details?.pendingCount !== undefined) {
                    if (domain === 'movies') next.pendingMovies = details.pendingCount;
                    if (domain === 'tv') next.pendingTv = details.pendingCount;
                    if (domain === 'watchlist') next.pendingWatchlist = details.pendingCount;
                }

                if (state === 'idle') {
                    next.lastSaved = new Date();
                    if (details?.label) next.lastSavedLabel = details.label;
                }

                if (details?.error) {
                    next.error = details.error;
                } else if (state !== 'error') {
                    if (next.movies !== 'error' && next.tv !== 'error' && next.watchlist !== 'error') {
                        next.error = undefined;
                    }
                }
                return next;
            });
        },
        []
    );

    const value = useMemo(() => ({ status, updateStatus }), [status, updateStatus]);

    return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>;
}

export function useSyncStatus() {
    const ctx = useContext(SyncStatusContext);
    if (!ctx) {
        throw new Error('useSyncStatus must be used within SyncStatusProvider');
    }
    return ctx;
}
