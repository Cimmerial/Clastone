import { useEffect, useState } from 'react';
import {
    getThrottlerState,
    subscribeToThrottler,
    setThrottlerPaused,
    clearThrottlerLog,
    type ThrottledRequest
} from '../lib/firebaseThrottler';
import './SettingsPage.css'; // Reuse settings page styling

export function DiagnosticsPage() {
    const [state, setState] = useState(getThrottlerState());

    useEffect(() => {
        const unsubscribe = subscribeToThrottler(() => {
            setState(getThrottlerState());
        });
        return unsubscribe;
    }, []);

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
            </div>
        </section>
    );
}
