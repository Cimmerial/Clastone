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
    watchlistVisibilityMode: 'ALL' | 'FREE';
    watchlistRecommendedOnly: boolean;
    watchlistUseAllMyServices: boolean;
    watchlistSelectedProviderIds: number[];
    watchlistActorIds: number[];
    watchlistActorNames: Record<number, string>;
    watchlistDirectorIds: number[];
    watchlistDirectorNames: Record<number, string>;
    watchlistGenres: string[];
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
        const wvm = localStorage.getItem('clastone-watchlistVisibilityMode');
        const wro = localStorage.getItem('clastone-watchlistRecommendedOnly');
        const wuas = localStorage.getItem('clastone-watchlistUseAllMyServices');
        const wsp = localStorage.getItem('clastone-watchlistSelectedProviderIds');
        const waids = localStorage.getItem('clastone-watchlistActorIds');
        const wan = localStorage.getItem('clastone-watchlistActorNames');
        const wdids = localStorage.getItem('clastone-watchlistDirectorIds');
        const wdn = localStorage.getItem('clastone-watchlistDirectorNames');
        const wg = localStorage.getItem('clastone-watchlistGenres');
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

        const parseNumArray = (raw: string | null): number[] => {
            if (!raw) return [];
            try {
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed)) return [];
                return parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n));
            } catch {
                return [];
            }
        };
        const parseNameMap = (raw: string | null): Record<number, string> => {
            if (!raw) return {};
            try {
                const parsed = JSON.parse(raw) as Record<string, unknown>;
                const out: Record<number, string> = {};
                for (const [k, v] of Object.entries(parsed ?? {})) {
                    const id = Number(k);
                    if (!Number.isFinite(id) || typeof v !== 'string') continue;
                    out[id] = v;
                }
                return out;
            } catch {
                return {};
            }
        };
        const parseStringArray = (raw: string | null): string[] => {
            if (!raw) return [];
            try {
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed)) return [];
                return parsed.filter((v): v is string => typeof v === 'string');
            } catch {
                return [];
            }
        };

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
            watchlistVisibilityMode: wvm === 'FREE' ? 'FREE' : 'ALL',
            watchlistRecommendedOnly: wro === 'true',
            watchlistUseAllMyServices: wuas !== 'false',
            watchlistSelectedProviderIds: parseNumArray(wsp),
            watchlistActorIds: parseNumArray(waids),
            watchlistActorNames: parseNameMap(wan),
            watchlistDirectorIds: parseNumArray(wdids),
            watchlistDirectorNames: parseNameMap(wdn),
            watchlistGenres: parseStringArray(wg),
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
            watchlistVisibilityMode: 'ALL',
            watchlistRecommendedOnly: false,
            watchlistUseAllMyServices: true,
            watchlistSelectedProviderIds: [],
            watchlistActorIds: [],
            watchlistActorNames: {},
            watchlistDirectorIds: [],
            watchlistDirectorNames: {},
            watchlistGenres: [],
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
                if (updates.watchlistVisibilityMode !== undefined) localStorage.setItem('clastone-watchlistVisibilityMode', next.watchlistVisibilityMode);
                if (updates.watchlistRecommendedOnly !== undefined) localStorage.setItem('clastone-watchlistRecommendedOnly', String(next.watchlistRecommendedOnly));
                if (updates.watchlistUseAllMyServices !== undefined) localStorage.setItem('clastone-watchlistUseAllMyServices', String(next.watchlistUseAllMyServices));
                if (updates.watchlistSelectedProviderIds !== undefined) localStorage.setItem('clastone-watchlistSelectedProviderIds', JSON.stringify(next.watchlistSelectedProviderIds));
                if (updates.watchlistActorIds !== undefined) localStorage.setItem('clastone-watchlistActorIds', JSON.stringify(next.watchlistActorIds));
                if (updates.watchlistActorNames !== undefined) localStorage.setItem('clastone-watchlistActorNames', JSON.stringify(next.watchlistActorNames));
                if (updates.watchlistDirectorIds !== undefined) localStorage.setItem('clastone-watchlistDirectorIds', JSON.stringify(next.watchlistDirectorIds));
                if (updates.watchlistDirectorNames !== undefined) localStorage.setItem('clastone-watchlistDirectorNames', JSON.stringify(next.watchlistDirectorNames));
                if (updates.watchlistGenres !== undefined) localStorage.setItem('clastone-watchlistGenres', JSON.stringify(next.watchlistGenres));
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
