import { useEffect, useState, useMemo } from 'react';
import {
    getThrottlerState,
    subscribeToThrottler,
    setThrottlerPaused,
    clearThrottlerLog,
    type ThrottledRequest
} from '../lib/firebaseThrottler';
import { Check, AlertTriangle } from 'lucide-react';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import { useSyncStatus } from '../context/SyncStatusContext';
import { useAuth } from '../context/AuthContext';
import { StorageVisualizer } from '../components/StorageVisualizer';
import { MigrationOverlay, type MigrationStep } from '../components/MigrationOverlay';
import './SettingsPage.css'; // Reuse settings page styling

export function DiagnosticsPage() {
    const { isAdmin } = useAuth();
    const [state, setState] = useState(getThrottlerState());
    const { status } = useSyncStatus();

    const {
        classes,
        byClass,
        forceSync: forceSyncMovies
    } = useMoviesStore();
    const {
        classes: tvClasses,
        byClass: tvByClass,
        forceSync: forceSyncTv
    } = useTvStore();
    const {
        classes: peopleClasses,
        byClass: peopleByClass,
        forceSync: forceSyncPeople
    } = usePeopleStore();
    const {
        classes: directorClasses,
        byClass: directorByClass,
        forceSync: forceSyncDirectors
    } = useDirectorsStore();
    const { movies: watchlistMovies, tv: watchlistTv, forceSync: forceSyncWatchlist } = useWatchlistStore();

    const [isMigrating, setIsMigrating] = useState(false);
    const [migrationSteps, setMigrationSteps] = useState<MigrationStep[]>([]);
    const [migrationProgress, setMigrationProgress] = useState(0);
    const [migrationError, setMigrationError] = useState<string | undefined>();

    useEffect(() => {
        const unsubscribe = subscribeToThrottler(() => {
            setState(getThrottlerState());
        });
        return unsubscribe;
    }, []);

    const handleMigration = async () => {
        const confirmed = confirm("This will manually trigger a full save of your data and ensure it's migrated to the new scalable structure. Continue?");
        if (!confirmed) return;

        const initialSteps: MigrationStep[] = [
            { id: 'movies', label: 'Migrating Movies...', status: 'pending' },
            { id: 'tv', label: 'Migrating TV Shows...', status: 'pending' },
            { id: 'watchlist', label: 'Migrating Watchlist...', status: 'pending' },
            { id: 'people', label: 'Migrating Actors...', status: 'pending' },
            { id: 'directors', label: 'Migrating Directors...', status: 'pending' },
        ];
        setMigrationSteps(initialSteps);
        setIsMigrating(true);
        setMigrationProgress(0);
        setMigrationError(undefined);

        try {
            const updateStep = (id: string, status: MigrationStep['status']) => {
                setMigrationSteps(prev => prev.map(s => s.id === id ? { ...s, status } : s));
            };

            updateStep('movies', 'running');
            await forceSyncMovies();
            updateStep('movies', 'completed');
            setMigrationProgress(20);

            updateStep('tv', 'running');
            await forceSyncTv();
            updateStep('tv', 'completed');
            setMigrationProgress(40);

            updateStep('watchlist', 'running');
            await forceSyncWatchlist();
            updateStep('watchlist', 'completed');
            setMigrationProgress(60);

            updateStep('people', 'running');
            await forceSyncPeople();
            updateStep('people', 'completed');
            setMigrationProgress(80);

            updateStep('directors', 'running');
            await forceSyncDirectors();
            updateStep('directors', 'completed');
            setMigrationProgress(100);

        } catch (err: any) {
            setMigrationError(err.message || 'Migration failed');
        }
    };

    const { queue, requestLog, isPaused } = state;
    const recentRequests = useMemo(() => requestLog.slice(0, 80), [requestLog]);

    const appStorageDiagnostics = useMemo(() => {
        const encodeSize = (value: unknown): number => {
            const serialized = JSON.stringify(value);
            return serialized ? new TextEncoder().encode(serialized).length : 0;
        };

        const byDomain = {
            movies: encodeSize({ classes, byClass }),
            tv: encodeSize({ classes: tvClasses, byClass: tvByClass }),
            people: encodeSize({ classes: peopleClasses, byClass: peopleByClass }),
            directors: encodeSize({ classes: directorClasses, byClass: directorByClass }),
            watchlist: encodeSize({ movies: watchlistMovies, tv: watchlistTv }),
            writeQueueBuffer: encodeSize(queue)
        };

        const total = Object.values(byDomain).reduce((sum, value) => sum + value, 0);
        const formatBytes = (bytes: number): string => {
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        };

        return {
            byDomain,
            total,
            formatBytes
        };
    }, [
        classes,
        byClass,
        tvClasses,
        tvByClass,
        peopleClasses,
        peopleByClass,
        directorClasses,
        directorByClass,
        watchlistMovies,
        watchlistTv,
        queue
    ]);

    return (
        <section>
            <header className="page-heading">
                <div>
                    <h1 className="page-title">Diagnostics</h1>
                    <p className="page-subtitle" style={{ color: 'var(--text-muted)' }}>Monitor and control settings.</p>
                </div>
            </header>

            <div className="settings-grid">
                {isAdmin && (
                    <div className="settings-card card-surface">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem', gap: '0.75rem' }}>
                            <h2 className="settings-title" style={{ margin: 0 }}>Firebase Write Queue</h2>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    type="button"
                                    className={`settings-btn ${isPaused ? 'settings-btn-primary' : ''}`}
                                    onClick={() => setThrottlerPaused(!isPaused)}
                                >
                                    {isPaused ? 'Resume Queue' : 'Pause Queue'}
                                </button>
                                <button
                                    type="button"
                                    className="settings-btn settings-btn-subtle"
                                    onClick={clearThrottlerLog}
                                >
                                    Clear Log
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: '1fr 1fr', marginBottom: '1rem' }}>
                            <div className="settings-account-row" style={{ flex: 1 }}>
                                <span className="settings-account-label">Items in Queue</span>
                                <span className="settings-account-value">{queue.length}</span>
                            </div>
                            <div className="settings-account-row" style={{ flex: 1 }}>
                                <span className="settings-account-label">Recent Logged Requests</span>
                                <span className="settings-account-value">{requestLog.length}</span>
                            </div>
                        </div>

                        <p className="settings-muted" style={{ marginBottom: '0.8rem' }}>
                            Recent throttled requests in this session. The queue enforces a 1-second gap between writes.
                        </p>

                        <div style={{ overflowX: 'auto', maxHeight: '42vh', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
                                    <tr>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Time</th>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Type</th>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Path</th>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {requestLog.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No requests logged yet in this session.</td>
                                        </tr>
                                    ) : (
                                        recentRequests.map((req) => (
                                            <tr key={req.id} style={{ borderBottom: '1px solid var(--border-color)', opacity: req.status === 'Sent' ? 0.7 : 1 }}>
                                                <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{new Date(req.timestamp).toLocaleTimeString()}</td>
                                                <td style={{ padding: '0.5rem' }}>
                                                    <span style={{
                                                        padding: '0.2rem 0.4rem',
                                                        borderRadius: '4px',
                                                        background: req.type === 'writeBatch' ? 'var(--primary-color)' : 'var(--bg-surface-hover)',
                                                        color: req.type === 'writeBatch' ? 'var(--text-on-primary)' : 'var(--text-primary)',
                                                        fontSize: '0.8rem'
                                                    }}>
                                                        {req.type}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.5rem', wordBreak: 'break-all' }}>
                                                    <div>{req.path}</div>
                                                </td>
                                                <td style={{ padding: '0.5rem' }}>
                                                    <span style={{
                                                        color: req.status === 'Queued' ? 'var(--warning-color, #f59e0b)' :
                                                            req.status === 'Sent' ? 'var(--success-color, #10b981)' :
                                                                'var(--danger-color, #ef4444)'
                                                    }}>
                                                        {req.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                {isAdmin && (
                    <div className="settings-card card-surface">
                        <h2 className="settings-title">Total App Storage (Estimate)</h2>
                        <p className="settings-muted" style={{ marginBottom: '1rem' }}>
                            Client-side estimate of serialized app payload size. Use Google Cloud Console for billing-accurate Firestore totals.
                        </p>

                        <div style={{ display: 'grid', gap: '0.6rem' }}>
                            <div className="settings-account-row">
                                <span className="settings-account-label">Estimated Total</span>
                                <span className="settings-account-value">{appStorageDiagnostics.formatBytes(appStorageDiagnostics.total)}</span>
                            </div>
                            <div className="settings-account-row">
                                <span className="settings-account-label">Movies</span>
                                <span className="settings-account-value">{appStorageDiagnostics.formatBytes(appStorageDiagnostics.byDomain.movies)}</span>
                            </div>
                            <div className="settings-account-row">
                                <span className="settings-account-label">TV Shows</span>
                                <span className="settings-account-value">{appStorageDiagnostics.formatBytes(appStorageDiagnostics.byDomain.tv)}</span>
                            </div>
                            <div className="settings-account-row">
                                <span className="settings-account-label">Actors</span>
                                <span className="settings-account-value">{appStorageDiagnostics.formatBytes(appStorageDiagnostics.byDomain.people)}</span>
                            </div>
                            <div className="settings-account-row">
                                <span className="settings-account-label">Directors</span>
                                <span className="settings-account-value">{appStorageDiagnostics.formatBytes(appStorageDiagnostics.byDomain.directors)}</span>
                            </div>
                            <div className="settings-account-row">
                                <span className="settings-account-label">Watchlist</span>
                                <span className="settings-account-value">{appStorageDiagnostics.formatBytes(appStorageDiagnostics.byDomain.watchlist)}</span>
                            </div>
                            <div className="settings-account-row">
                                <span className="settings-account-label">Queue Buffer</span>
                                <span className="settings-account-value">{appStorageDiagnostics.formatBytes(appStorageDiagnostics.byDomain.writeQueueBuffer)}</span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="settings-card card-surface settings-card-wide">
                    <h2 className="settings-title">Storage & Migration</h2>
                    <div className="settings-migration-status">
                        <div className={`migration-indicator ${status.migration.movies ? 'migrated' : 'pending'}`}>
                            Movies: {status.migration.movies ? <><Check size={14} /> Migrated</> : <><AlertTriangle size={14} /> Pending Migration</>}
                        </div>
                        <div className={`migration-indicator ${status.migration.tv ? 'migrated' : 'pending'}`}>
                            TV Shows: {status.migration.tv ? <><Check size={14} /> Migrated</> : <><AlertTriangle size={14} /> Pending Migration</>}
                        </div>
                        <div className={`migration-indicator ${status.migration.watchlist ? 'migrated' : 'pending'}`}>
                            Watchlist: {status.migration.watchlist ? <><Check size={14} /> Migrated</> : <><AlertTriangle size={14} /> Pending Migration</>}
                        </div>
                        <div className={`migration-indicator ${status.migration.people ? 'migrated' : 'pending'}`}>
                            Actors: {status.migration.people ? <><Check size={14} /> Migrated</> : <><AlertTriangle size={14} /> Pending Migration</>}
                        </div>
                        <div className={`migration-indicator ${status.migration.directors ? 'migrated' : 'pending'}`}>
                            Directors: {status.migration.directors ? <><Check size={14} /> Migrated</> : <><AlertTriangle size={14} /> Pending Migration</>}
                        </div>
                    </div>

                    <div className="settings-storage-grid">
                        <StorageVisualizer
                            label="Movies"
                            classes={classes}
                            byClass={byClass}
                        />
                        <StorageVisualizer
                            label="TV Shows"
                            classes={tvClasses}
                            byClass={tvByClass}
                        />
                        <StorageVisualizer
                            label="Actors"
                            classes={peopleClasses}
                            byClass={peopleByClass}
                        />
                        <StorageVisualizer
                            label="Directors"
                            classes={directorClasses}
                            byClass={directorByClass}
                        />
                    </div>

                    <div className="settings-migration-actions">
                        {(!status.migration.movies || !status.migration.tv || !status.migration.watchlist) ? (
                            <button
                                type="button"
                                className="settings-btn settings-btn-primary"
                                onClick={handleMigration}
                                id="migrate-verify-btn"
                            >
                                Migrate and Verify Storage
                            </button>
                        ) : (
                            <div className="migration-complete-msg">
                                <span className="check-icon"><Check size={16} /></span> All data is successfully migrated.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isMigrating && (
                <MigrationOverlay
                    steps={migrationSteps}
                    progress={migrationProgress}
                    isComplete={migrationProgress === 100}
                    error={migrationError}
                    onClose={() => setIsMigrating(false)}
                />
            )}
        </section>
    );
}
