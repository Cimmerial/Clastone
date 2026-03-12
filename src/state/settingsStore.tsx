import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type GlobalSettings = {
    topCastCount: number;
    topRoleCount: number;
    personProjectsLimit: number;
    viewMode: 'minimized' | 'detailed' | 'tile';
    boycottTalkShows: boolean;
    excludeSimpsons: boolean;
    showGuideFlag: boolean;
    useSpotlightBackground: boolean;
    censorBigMovie: boolean;
};

type SettingsStore = {
    settings: GlobalSettings;
    updateSettings: (updates: Partial<GlobalSettings>) => void;
};

const SettingsContext = createContext<SettingsStore | null>(null);

function getInitialSettings(): GlobalSettings {
    try {
        const cast = localStorage.getItem('clastone-topCastCount');
        const role = localStorage.getItem('clastone-topRoleCount');
        const ppl = localStorage.getItem('clastone-personProjectsLimit');
        const vm = localStorage.getItem('clastone-viewMode');
        const min = localStorage.getItem('clastone-minimizedEntries');
        const bts = localStorage.getItem('clastone-boycottTalkShows');
        const es = localStorage.getItem('clastone-excludeSimpsons');
        const sgf = localStorage.getItem('clastone-showGuideFlag');
        const usb = localStorage.getItem('clastone-useSpotlightBackground');
        const cbm = localStorage.getItem('clastone-censorBigMovie');

        let viewMode: 'minimized' | 'detailed' | 'tile' = 'minimized';
        if (vm === 'minimized' || vm === 'detailed' || vm === 'tile') {
            viewMode = vm as any;
        } else if (min === 'true') {
            viewMode = 'minimized';
        } else if (min === 'false') {
            viewMode = 'detailed';
        }

        return {
            topCastCount: cast ? Number(cast) : 5,
            topRoleCount: role ? Number(role) : 5,
            personProjectsLimit: ppl ? Number(ppl) : 12,
            viewMode,
            boycottTalkShows: bts === 'true',
            excludeSimpsons: es === 'true',
            showGuideFlag: sgf !== 'false',
            useSpotlightBackground: usb === 'true',
            censorBigMovie: cbm === 'true'
        };
    } catch {
        return {
            topCastCount: 5,
            topRoleCount: 5,
            personProjectsLimit: 12,
            viewMode: 'minimized',
            boycottTalkShows: false,
            excludeSimpsons: false,
            showGuideFlag: true,
            useSpotlightBackground: false,
            censorBigMovie: false
        };
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
                if (updates.topRoleCount !== undefined) localStorage.setItem('clastone-topRoleCount', String(next.topRoleCount));
                if (updates.personProjectsLimit !== undefined) localStorage.setItem('clastone-personProjectsLimit', String(next.personProjectsLimit));
                if (updates.viewMode !== undefined) localStorage.setItem('clastone-viewMode', next.viewMode);
                if (updates.boycottTalkShows !== undefined) localStorage.setItem('clastone-boycottTalkShows', String(next.boycottTalkShows));
                if (updates.excludeSimpsons !== undefined) localStorage.setItem('clastone-excludeSimpsons', String(next.excludeSimpsons));
                if (updates.showGuideFlag !== undefined) localStorage.setItem('clastone-showGuideFlag', String(next.showGuideFlag));
                if (updates.useSpotlightBackground !== undefined) localStorage.setItem('clastone-useSpotlightBackground', String(next.useSpotlightBackground));
                if (updates.censorBigMovie !== undefined) localStorage.setItem('clastone-censorBigMovie', String(next.censorBigMovie));

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
