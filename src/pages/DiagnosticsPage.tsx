import { useEffect, useState, useMemo } from 'react';
import {
    getThrottlerState,
    subscribeToThrottler,
    setThrottlerPaused,
    clearThrottlerLog,
    type ThrottledRequest
} from '../lib/firebaseThrottler';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import { useSyncStatus } from '../context/SyncStatusContext';
import { StorageVisualizer } from '../components/StorageVisualizer';
import { MigrationOverlay, type MigrationStep } from '../components/MigrationOverlay';
import './SettingsPage.css'; // Reuse settings page styling

export function DiagnosticsPage() {
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
    const { forceSync: forceSyncWatchlist } = useWatchlistStore();

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

    return (
        <section>
            <header className="page-heading">
                <div>
                    <h1 className="page-title">Diagnostics</h1>
                    <p className="page-subtitle" style={{ color: 'var(--text-muted)' }}>Monitor and control Firebase write operations.</p>
                </div>
            </header>

            <div className="settings-grid">
                <div className="settings-card card-surface settings-card-wide">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
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

                    <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
                        <div className="settings-account-row" style={{ flex: 1 }}>
                            <span className="settings-account-label">Items in Queue</span>
                            <span className="settings-account-value">{queue.length}</span>
                        </div>
                        <div className="settings-account-row" style={{ flex: 1 }}>
                            <span className="settings-account-label">Total Authenticated Written Today</span>
                            <span className="settings-account-value" style={{ color: 'var(--text-muted)' }}>Check Google Cloud Console for true values.</span>
                        </div>
                    </div>

                    <p className="settings-muted" style={{ marginBottom: '1rem' }}>
                        Recent requests (last 200). Note that the throttler enforces a Strict 1 second delay between writes to avoid quota bursts.
                    </p>

                    <div style={{ overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
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
                                    requestLog.map((req) => (
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
                                                {req.metadata && (
                                                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', background: 'var(--bg-surface-hover)', padding: '0.5rem', borderRadius: '4px' }}>
                                                        {req.metadata.storeName && <div><strong>Store:</strong> {req.metadata.storeName}</div>}
                                                        {req.metadata.metadataChanged !== undefined && <div><strong>Metadata Changed:</strong> {req.metadata.metadataChanged ? 'Yes' : 'No'}</div>}
                                                        {req.metadata.dirtyClasses !== undefined && <div><strong>Dirty Classes:</strong> {req.metadata.dirtyClasses ? req.metadata.dirtyClasses.join(', ') || '(Empty Full Sync)' : 'None'}</div>}
                                                        {req.metadata.dirtyMovies !== undefined && <div><strong>Dirty Movies:</strong> {req.metadata.dirtyMovies ? 'Yes' : 'No'}</div>}
                                                        {req.metadata.dirtyTv !== undefined && <div><strong>Dirty TV:</strong> {req.metadata.dirtyTv ? 'Yes' : 'No'}</div>}
                                                    </div>
                                                )}
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

                <div className="settings-card card-surface settings-card-wide">
                    <h2 className="settings-title">Storage & Migration</h2>
                    <p className="settings-muted">
                        Visualize your Firestore storage usage and manually trigger a migration to the new scalable structure.
                    </p>

                    <div className="settings-migration-status">
                        <div className={`migration-indicator ${status.migration.movies ? 'migrated' : 'pending'}`}>
                            Movies: {status.migration.movies ? '✓ Migrated' : '⚠ Pending Migration'}
                        </div>
                        <div className={`migration-indicator ${status.migration.tv ? 'migrated' : 'pending'}`}>
                            TV Shows: {status.migration.tv ? '✓ Migrated' : '⚠ Pending Migration'}
                        </div>
                        <div className={`migration-indicator ${status.migration.watchlist ? 'migrated' : 'pending'}`}>
                            Watchlist: {status.migration.watchlist ? '✓ Migrated' : '⚠ Pending Migration'}
                        </div>
                        <div className={`migration-indicator ${status.migration.people ? 'migrated' : 'pending'}`}>
                            Actors: {status.migration.people ? '✓ Migrated' : '⚠ Pending Migration'}
                        </div>
                        <div className={`migration-indicator ${status.migration.directors ? 'migrated' : 'pending'}`}>
                            Directors: {status.migration.directors ? '✓ Migrated' : '⚠ Pending Migration'}
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
                                <span className="check-icon">✓</span> All data is successfully migrated to the new scalable structure.
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
