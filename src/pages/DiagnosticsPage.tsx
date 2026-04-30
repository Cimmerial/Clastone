import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
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
import { db } from '../lib/firebase';
import './SettingsPage.css'; // Reuse settings page styling

type GlobalUserStorageRow = {
    userId: string;
    username: string;
    movieBytes: number;
    tvBytes: number;
    peopleBytes: number;
    directorsBytes: number;
    watchlistBytes: number;
    totalBytes: number;
};

type GlobalStorageState = {
    loading: boolean;
    error: string | null;
    rows: GlobalUserStorageRow[];
    totals: {
        movieBytes: number;
        tvBytes: number;
        peopleBytes: number;
        directorsBytes: number;
        watchlistBytes: number;
        totalBytes: number;
    } | null;
};

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
    const { forceSync: forceSyncWatchlist } = useWatchlistStore();

    const [isMigrating, setIsMigrating] = useState(false);
    const [migrationSteps, setMigrationSteps] = useState<MigrationStep[]>([]);
    const [migrationProgress, setMigrationProgress] = useState(0);
    const [migrationError, setMigrationError] = useState<string | undefined>();
    const [globalStorage, setGlobalStorage] = useState<GlobalStorageState>({
        loading: false,
        error: null,
        rows: [],
        totals: null
    });

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

    const formatBytes = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    const estimateGlobalStorage = async () => {
        if (!db) {
            setGlobalStorage((prev) => ({
                ...prev,
                error: 'Firebase is not configured.'
            }));
            return;
        }

        const encodeSize = (value: unknown): number => {
            const serialized = JSON.stringify(value);
            return serialized ? new TextEncoder().encode(serialized).length : 0;
        };

        setGlobalStorage({
            loading: true,
            error: null,
            rows: [],
            totals: null
        });

        try {
            const usersSnap = await getDocs(collection(db, 'users'));
            const rows: GlobalUserStorageRow[] = [];

            for (const userDoc of usersSnap.docs) {
                const userId = userDoc.id;
                const usernameRaw = userDoc.data()?.username;
                const username = typeof usernameRaw === 'string' && usernameRaw.trim().length > 0
                    ? usernameRaw.trim()
                    : userId;

                const [movieSnap, tvSnap, peopleSnap, directorsSnap, watchlistSnap] = await Promise.all([
                    getDocs(collection(db, 'users', userId, 'movieData')),
                    getDocs(collection(db, 'users', userId, 'tvData')),
                    getDocs(collection(db, 'users', userId, 'peopleData')),
                    getDocs(collection(db, 'users', userId, 'directorsData')),
                    getDocs(collection(db, 'users', userId, 'watchlistData')),
                ]);

                const movieBytes = encodeSize(movieSnap.docs.map((d) => d.data()));
                const tvBytes = encodeSize(tvSnap.docs.map((d) => d.data()));
                const peopleBytes = encodeSize(peopleSnap.docs.map((d) => d.data()));
                const directorsBytes = encodeSize(directorsSnap.docs.map((d) => d.data()));
                const watchlistBytes = encodeSize(watchlistSnap.docs.map((d) => d.data()));
                const totalBytes = movieBytes + tvBytes + peopleBytes + directorsBytes + watchlistBytes;

                rows.push({
                    userId,
                    username,
                    movieBytes,
                    tvBytes,
                    peopleBytes,
                    directorsBytes,
                    watchlistBytes,
                    totalBytes
                });
            }

            rows.sort((a, b) => b.totalBytes - a.totalBytes);

            const totals = rows.reduce(
                (acc, row) => {
                    acc.movieBytes += row.movieBytes;
                    acc.tvBytes += row.tvBytes;
                    acc.peopleBytes += row.peopleBytes;
                    acc.directorsBytes += row.directorsBytes;
                    acc.watchlistBytes += row.watchlistBytes;
                    acc.totalBytes += row.totalBytes;
                    return acc;
                },
                {
                    movieBytes: 0,
                    tvBytes: 0,
                    peopleBytes: 0,
                    directorsBytes: 0,
                    watchlistBytes: 0,
                    totalBytes: 0
                }
            );

            setGlobalStorage({
                loading: false,
                error: null,
                rows,
                totals
            });
        } catch (error: unknown) {
            setGlobalStorage({
                loading: false,
                error: error instanceof Error ? error.message : String(error),
                rows: [],
                totals: null
            });
        }
    };

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
                    <div className="settings-card card-surface settings-card-wide">
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
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Origin</th>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Details</th>
                                        <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {requestLog.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No requests logged yet in this session.</td>
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
                                                <td style={{ padding: '0.5rem', maxWidth: '260px', wordBreak: 'break-word', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {String(req.metadata?.origin ?? 'n/a')}
                                                </td>
                                                <td style={{ padding: '0.5rem', maxWidth: '460px' }}>
                                                    {req.type === 'writeBatch' ? (
                                                        <details>
                                                            <summary style={{ cursor: 'pointer' }}>
                                                                {req.metadata?.operationCount ?? '?'} ops
                                                                {req.metadata?.opBreakdown
                                                                    ? ` (set:${req.metadata.opBreakdown.set ?? 0}, update:${req.metadata.opBreakdown.update ?? 0}, delete:${req.metadata.opBreakdown.delete ?? 0})`
                                                                    : ''}
                                                                {req.metadata?.storeName ? ` • ${String(req.metadata.storeName)}` : ''}
                                                            </summary>
                                                            <div style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                {(req.metadata?.operations ?? []).slice(0, 80).map((op: any, idx: number) => (
                                                                    <div key={`${req.id}-op-${idx}`}>
                                                                        {op.type} • {op.docPath}
                                                                        {typeof op.fieldCount === 'number' ? ` • fields:${op.fieldCount}` : ''}
                                                                    </div>
                                                                ))}
                                                                {(req.metadata?.operations?.length ?? 0) > 80 ? (
                                                                    <div>... {req.metadata.operations.length - 80} more</div>
                                                                ) : null}
                                                            </div>
                                                        </details>
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                            {req.metadata?.operation ?? req.type}
                                                            {req.metadata?.fieldCount ? ` • fields:${req.metadata.fieldCount}` : ''}
                                                            {req.metadata?.storeName ? ` • ${String(req.metadata.storeName)}` : ''}
                                                        </span>
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
                )}
                {isAdmin && (
                    <div className="settings-card card-surface settings-card-wide">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
                            <h2 className="settings-title" style={{ margin: 0 }}>Global Storage Estimate (All Users)</h2>
                            <button
                                type="button"
                                className="settings-btn settings-btn-subtle"
                                onClick={() => void estimateGlobalStorage()}
                                disabled={globalStorage.loading}
                            >
                                {globalStorage.loading ? 'Loading...' : 'Load Global Storage'}
                            </button>
                        </div>
                        <p className="settings-muted" style={{ marginBottom: '0.85rem' }}>
                            Aggregates Firestore payload size estimates across all users for movie/tv/actor/director/watchlist subcollections.
                        </p>

                        {globalStorage.error ? (
                            <p className="settings-muted" style={{ color: 'var(--danger-color, #ef4444)' }}>
                                {globalStorage.error}
                            </p>
                        ) : null}

                        {globalStorage.totals ? (
                            <>
                                <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: '1rem' }}>
                                    <div className="settings-account-row">
                                        <span className="settings-account-label">Users Scanned</span>
                                        <span className="settings-account-value">{globalStorage.rows.length}</span>
                                    </div>
                                    <div className="settings-account-row">
                                        <span className="settings-account-label">Estimated Total</span>
                                        <span className="settings-account-value">{formatBytes(globalStorage.totals.totalBytes)}</span>
                                    </div>
                                    <div className="settings-account-row">
                                        <span className="settings-account-label">Movies</span>
                                        <span className="settings-account-value">{formatBytes(globalStorage.totals.movieBytes)}</span>
                                    </div>
                                    <div className="settings-account-row">
                                        <span className="settings-account-label">TV Shows</span>
                                        <span className="settings-account-value">{formatBytes(globalStorage.totals.tvBytes)}</span>
                                    </div>
                                    <div className="settings-account-row">
                                        <span className="settings-account-label">Actors</span>
                                        <span className="settings-account-value">{formatBytes(globalStorage.totals.peopleBytes)}</span>
                                    </div>
                                    <div className="settings-account-row">
                                        <span className="settings-account-label">Directors</span>
                                        <span className="settings-account-value">{formatBytes(globalStorage.totals.directorsBytes)}</span>
                                    </div>
                                    <div className="settings-account-row">
                                        <span className="settings-account-label">Watchlist</span>
                                        <span className="settings-account-value">{formatBytes(globalStorage.totals.watchlistBytes)}</span>
                                    </div>
                                </div>

                                <div style={{ overflowX: 'auto', maxHeight: '42vh', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
                                            <tr>
                                                <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Username</th>
                                                <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Total</th>
                                                <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Movies</th>
                                                <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>TV</th>
                                                <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Actors</th>
                                                <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Directors</th>
                                                <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Watchlist</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {globalStorage.rows.map((row) => (
                                                <tr key={row.userId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '0.5rem' }}>{row.username}</td>
                                                    <td style={{ padding: '0.5rem' }}>{formatBytes(row.totalBytes)}</td>
                                                    <td style={{ padding: '0.5rem' }}>{formatBytes(row.movieBytes)}</td>
                                                    <td style={{ padding: '0.5rem' }}>{formatBytes(row.tvBytes)}</td>
                                                    <td style={{ padding: '0.5rem' }}>{formatBytes(row.peopleBytes)}</td>
                                                    <td style={{ padding: '0.5rem' }}>{formatBytes(row.directorsBytes)}</td>
                                                    <td style={{ padding: '0.5rem' }}>{formatBytes(row.watchlistBytes)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : (
                            !globalStorage.loading && (
                                <p className="settings-muted" style={{ marginBottom: 0 }}>
                                    Click &ldquo;Load Global Storage&rdquo; to fetch all users and estimate combined payload sizes.
                                </p>
                            )
                        )}
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
