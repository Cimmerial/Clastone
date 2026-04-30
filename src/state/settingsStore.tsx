import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
export type GlobalSettings = {
    topCastCount: number;
    topRoleCount: number;
    personProjectsLimit: number;
    infoModalProjectSort: 'default' | 'seen-watchlisted-unseen' | 'new-old';
    viewMode: 'minimized' | 'detailed' | 'tile' | 'compact';
    tileViewSize: 'small' | 'default' | 'big';
    boycottTalkShows: boolean;
    excludeSimpsons: boolean;
    excludeSelfRoles: boolean;
    useSpotlightBackground: boolean;
    collectionSeenBorderMode: boolean;
    watchRegion: string;
    myWatchProviderIds: number[];
    showExampleProfile: boolean;
    showHomeHeroIntro: boolean;
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
        const imps = localStorage.getItem('clastone-infoModalProjectSort');
        const vm = localStorage.getItem('clastone-viewMode');
        const tvs = localStorage.getItem('clastone-tileViewSize');
        const min = localStorage.getItem('clastone-minimizedEntries');
        const bts = localStorage.getItem('clastone-boycottTalkShows');
        const es = localStorage.getItem('clastone-excludeSimpsons');
        const esr = localStorage.getItem('clastone-excludeSelfRoles');
        const usb = localStorage.getItem('clastone-useSpotlightBackground');
        const csbm = localStorage.getItem('clastone-collectionSeenBorderMode');
        const wr = localStorage.getItem('clastone-watchRegion');
        const wps = localStorage.getItem('clastone-myWatchProviderIds');
        const sep = localStorage.getItem('clastone-showExampleProfile');
        const shhi = localStorage.getItem('clastone-showHomeHeroIntro');

        let viewMode: 'minimized' | 'detailed' | 'tile' | 'compact' = 'tile';
        if (vm === 'tile' || vm === 'compact') {
            viewMode = vm as any;
        } else if (vm === 'detailed' || vm === 'minimized') {
            // Migrate old "Simple" mode to Tile mode.
            viewMode = 'tile';
        } else if (min === 'true') {
            viewMode = 'tile';
        } else if (min === 'false') {
            viewMode = 'tile';
        }

        let tileViewSize: 'small' | 'default' | 'big' = 'default';
        if (tvs === 'small' || tvs === 'default' || tvs === 'big') {
            tileViewSize = tvs as any;
        }

        let myWatchProviderIds: number[] = [];
        if (wps) {
            try {
                const parsed = JSON.parse(wps);
                if (Array.isArray(parsed)) {
                    myWatchProviderIds = parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n));
                }
            } catch {
                myWatchProviderIds = [];
            }
        }

        return {
            topCastCount: cast ? Number(cast) : 5,
            topRoleCount: role ? Number(role) : 5,
            personProjectsLimit: ppl ? Number(ppl) : 12,
            infoModalProjectSort:
                imps === 'seen-watchlisted-unseen' || imps === 'new-old' || imps === 'default'
                    ? imps
                    : 'default',
            viewMode,
            tileViewSize,
            boycottTalkShows: bts === 'true',
            excludeSimpsons: es === 'true',
            excludeSelfRoles: esr === 'true',
            useSpotlightBackground: usb === 'true',
            collectionSeenBorderMode: csbm === 'true',
            watchRegion: (wr && /^[A-Z]{2}$/.test(wr)) ? wr : 'US',
            myWatchProviderIds,
            showExampleProfile: sep !== 'false',
            showHomeHeroIntro: shhi !== 'false'
        };
    } catch {
        return {
            topCastCount: 5,
            topRoleCount: 5,
            personProjectsLimit: 12,
            infoModalProjectSort: 'default',
            viewMode: 'tile',
            tileViewSize: 'default',
            boycottTalkShows: false,
            excludeSimpsons: false,
            excludeSelfRoles: false,
            useSpotlightBackground: false,
            collectionSeenBorderMode: false,
            watchRegion: 'US',
            myWatchProviderIds: [],
            showExampleProfile: true,
            showHomeHeroIntro: true
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
    const [settings, setSettings] = useState<GlobalSettings>(() => {
        const defaults = getInitialSettings();
        if (!initialSettings) return defaults;
        const merged = { ...defaults, ...initialSettings };
        if (merged.viewMode === 'detailed' || merged.viewMode === 'minimized') {
            merged.viewMode = 'tile';
        }
        return merged;
    });
    const [pendingChanges, setPendingChanges] = useState(0);
    const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hydratedRef = useRef(false);
    const lastStateRef = useRef(settings);
    lastStateRef.current = settings;

    useEffect(() => {
        if (!onPersist) return;
        if (!hydratedRef.current) {
            hydratedRef.current = true;
            return;
        }

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
            if (next.viewMode === 'detailed' || next.viewMode === 'minimized') {
                next.viewMode = 'tile';
            }
            // Save to local storage as backup and for non-auth users.
            try {
                if (updates.topCastCount !== undefined) localStorage.setItem('clastone-topCastCount', String(next.topCastCount));
                if (updates.topRoleCount !== undefined) localStorage.setItem('clastone-topRoleCount', String(next.topRoleCount));
                if (updates.personProjectsLimit !== undefined) localStorage.setItem('clastone-personProjectsLimit', String(next.personProjectsLimit));
                if (updates.infoModalProjectSort !== undefined) localStorage.setItem('clastone-infoModalProjectSort', next.infoModalProjectSort);
                if (updates.viewMode !== undefined) localStorage.setItem('clastone-viewMode', next.viewMode);
                if (updates.tileViewSize !== undefined) localStorage.setItem('clastone-tileViewSize', next.tileViewSize);
                if (updates.boycottTalkShows !== undefined) localStorage.setItem('clastone-boycottTalkShows', String(next.boycottTalkShows));
                if (updates.excludeSimpsons !== undefined) localStorage.setItem('clastone-excludeSimpsons', String(next.excludeSimpsons));
                if (updates.excludeSelfRoles !== undefined) localStorage.setItem('clastone-excludeSelfRoles', String(next.excludeSelfRoles));
                if (updates.useSpotlightBackground !== undefined) localStorage.setItem('clastone-useSpotlightBackground', String(next.useSpotlightBackground));
                if (updates.collectionSeenBorderMode !== undefined) localStorage.setItem('clastone-collectionSeenBorderMode', String(next.collectionSeenBorderMode));
                if (updates.watchRegion !== undefined) localStorage.setItem('clastone-watchRegion', next.watchRegion);
                if (updates.myWatchProviderIds !== undefined) localStorage.setItem('clastone-myWatchProviderIds', JSON.stringify(next.myWatchProviderIds));
                if (updates.showExampleProfile !== undefined) localStorage.setItem('clastone-showExampleProfile', String(next.showExampleProfile));
                if (updates.showHomeHeroIntro !== undefined) localStorage.setItem('clastone-showHomeHeroIntro', String(next.showHomeHeroIntro));

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
