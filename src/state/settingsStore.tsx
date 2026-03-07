import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type GlobalSettings = {
    topCastCount: number;
    minimizedEntries: boolean;
    showCast: boolean;
    showDirectors: boolean;
};

type SettingsStore = {
    settings: GlobalSettings;
    updateSettings: (updates: Partial<GlobalSettings>) => void;
};

const SettingsContext = createContext<SettingsStore | null>(null);

function getInitialSettings(): GlobalSettings {
    try {
        const cast = localStorage.getItem('clastone-topCastCount');
        const min = localStorage.getItem('clastone-minimizedEntries');
        const sc = localStorage.getItem('clastone-showCast');
        const sd = localStorage.getItem('clastone-showDirectors');

        return {
            topCastCount: cast ? Number(cast) : 5,
            minimizedEntries: min === 'true',
            showCast: sc !== 'false', // Default to true
            showDirectors: sd !== 'false' // Default to true
        };
    } catch {
        return { topCastCount: 5, minimizedEntries: false, showCast: true, showDirectors: true };
    }
}

export function SettingsProvider({
    children,
    initialSettings,
    onPersist
}: {
    children: React.ReactNode;
    initialSettings?: GlobalSettings;
    onPersist?: (settings: GlobalSettings, pendingCount: number) => void;
}) {
    const [settings, setSettings] = useState<GlobalSettings>(initialSettings ?? getInitialSettings());
    const [pendingChanges, setPendingChanges] = useState(0);
    const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastStateRef = useRef(settings);
    lastStateRef.current = settings;

    useEffect(() => {
        if (!onPersist) return;

        // Increment pending changes on every update (except initial mount).
        // We'll reset it to 0 after save.
        setPendingChanges(p => p + 1);

        if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);

        persistTimeoutRef.current = setTimeout(() => {
            onPersist(lastStateRef.current, pendingChanges);
            setPendingChanges(0);
            persistTimeoutRef.current = null;
        }, 1500);

        return () => {
            if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
        };
    }, [settings, onPersist]);

    // Handle browser tab closure.
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (pendingChanges > 0 && onPersist) {
                onPersist(lastStateRef.current, pendingChanges);
                e.preventDefault();
                e.returnValue = 'Saving settings...';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [onPersist, pendingChanges]);

    const updateSettings = useCallback((updates: Partial<GlobalSettings>) => {
        setSettings(prev => {
            const next = { ...prev, ...updates };
            // Save to local storage as backup and for non-auth users.
            try {
                if (updates.topCastCount !== undefined) localStorage.setItem('clastone-topCastCount', String(next.topCastCount));
                if (updates.minimizedEntries !== undefined) localStorage.setItem('clastone-minimizedEntries', String(next.minimizedEntries));
                if (updates.showCast !== undefined) localStorage.setItem('clastone-showCast', String(next.showCast));
                if (updates.showDirectors !== undefined) localStorage.setItem('clastone-showDirectors', String(next.showDirectors));
            } catch { /* ignore */ }
            return next;
        });
    }, []);

    const value = useMemo(() => ({ settings, updateSettings }), [settings, updateSettings]);

    return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettingsStore() {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new Error('useSettingsStore must be used within SettingsProvider');
    return ctx;
}
