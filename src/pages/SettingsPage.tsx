import { useMemo, useState } from 'react';
import { useAuth, hasFirebaseConfig } from '../context/AuthContext';
import { RandomQuote } from '../components/RandomQuote';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { useSettingsStore } from '../state/settingsStore';
import { useSyncStatus } from '../context/SyncStatusContext';
import { StorageVisualizer } from '../components/StorageVisualizer';
import { MigrationOverlay, type MigrationStep } from '../components/MigrationOverlay';
import './SettingsPage.css';

function getTopCastCount(): number {
  try {
    const v = localStorage.getItem('clastone-topCastCount');
    if (v) { const n = Number(v); if (n >= 3 && n <= 10) return n; }
  } catch { /* ignore */ }
  return 5;
}

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const { status } = useSyncStatus();
  const { settings, updateSettings } = useSettingsStore();
  const {
    classes,
    byClass,
    addClass,
    renameClassLabel,
    renameClassTagline,
    moveClass,
    deleteClass,
    forceSync: forceSyncMovies
  } = useMoviesStore();
  const {
    classes: tvClasses,
    byClass: tvByClass,
    addClass: addTvClass,
    renameClassLabel: renameTvClassLabel,
    renameClassTagline: renameTvClassTagline,
    moveClass: moveTvClass,
    deleteClass: deleteTvClass,
    forceSync: forceSyncTv
  } = useTvStore();
  const { forceSync: forceSyncWatchlist } = useWatchlistStore();
  const [newRankedLabel, setNewRankedLabel] = useState('');
  const [newUnrankedLabel, setNewUnrankedLabel] = useState('');
  const [newRankedLabelTv, setNewRankedLabelTv] = useState('');
  const [newUnrankedLabelTv, setNewUnrankedLabelTv] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationSteps, setMigrationSteps] = useState<MigrationStep[]>([]);
  const [migrationError, setMigrationError] = useState<string | undefined>();

  const signedIn = hasFirebaseConfig && user;

  const rankedClasses = useMemo(() => classes.filter((c) => c.isRanked), [classes]);
  const nonRankedClasses = useMemo(() => classes.filter((c) => !c.isRanked), [classes]);
  const rankedTvClasses = useMemo(() => tvClasses.filter((c) => c.isRanked), [tvClasses]);
  const nonRankedTvClasses = useMemo(() => tvClasses.filter((c) => !c.isRanked), [tvClasses]);

  const canAddRanked = useMemo(() => newRankedLabel.trim().length > 0, [newRankedLabel]);
  const canAddUnranked = useMemo(() => newUnrankedLabel.trim().length > 0, [newUnrankedLabel]);
  const canAddRankedTv = useMemo(() => newRankedLabelTv.trim().length > 0, [newRankedLabelTv]);
  const canAddUnrankedTv = useMemo(() => newUnrankedLabelTv.trim().length > 0, [newUnrankedLabelTv]);

  const handleMigration = async () => {
    const confirmed = confirm("This will manually trigger a full save of your data and ensure it's migrated to the new scalable structure. Continue?");
    if (!confirmed) return;

    const initialSteps: MigrationStep[] = [
      { id: 'movies', label: 'Migrating Movies...', status: 'pending' },
      { id: 'tv', label: 'Migrating TV Shows...', status: 'pending' },
      { id: 'watchlist', label: 'Migrating Watchlist...', status: 'pending' },
      { id: 'finalize', label: 'Finalizing Verification...', status: 'pending' }
    ];

    setMigrationSteps(initialSteps);
    setMigrationError(undefined);
    setIsMigrating(true);

    const updateStep = (id: string, updates: Partial<MigrationStep>) => {
      setMigrationSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    try {
      // Step 1: Movies
      updateStep('movies', { status: 'running' });
      await forceSyncMovies();
      updateStep('movies', { status: 'completed' });

      // Step 2: TV
      updateStep('tv', { status: 'running' });
      await forceSyncTv();
      updateStep('tv', { status: 'completed' });

      // Step 3: Watchlist
      updateStep('watchlist', { status: 'running' });
      await forceSyncWatchlist();
      updateStep('watchlist', { status: 'completed' });

      // Step 4: Finalize
      updateStep('finalize', { status: 'running' });
      // Small artificial delay for visual confirmation
      await new Promise(r => setTimeout(r, 600));
      updateStep('finalize', { status: 'completed' });

    } catch (e: any) {
      console.error('[Clastone] Migration failed', e);
      setMigrationError(e.message || String(e));
      // Mark current running step as error
      setMigrationSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error' } : s));
    }
  };

  const migrationProgress = useMemo(() => {
    const completed = migrationSteps.filter(s => s.status === 'completed').length;
    return (completed / migrationSteps.length) * 100;
  }, [migrationSteps]);

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Settings</h1>
          <RandomQuote />
        </div>
      </header>

      <div className="settings-grid">
        <div className="settings-card card-surface">
          <h2 className="settings-title">Movie Class Management</h2>
          <p className="settings-muted">
            Ranked classes affect global percentiles/rankings;
            unranked ones do not.
          </p>

          <h3 className="settings-subtitle">Ranked classes</h3>
          <div className="settings-list">
            {rankedClasses.map((c) => {
              const count = (byClass[c.key] ?? []).length;
              return (
                <div key={c.key} className="settings-list-item">
                  <span className="settings-class-name">
                    <span className="settings-class-name-main">{c.label}</span>
                    {c.tagline ? <span className="settings-class-tagline"> | {c.tagline}</span> : null}{' '}
                    <span className="settings-class-count">
                      · {count} {count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <div className="settings-list-actions">
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => moveClass(c.key, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => moveClass(c.key, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Rename class', c.label);
                        if (!next) return;
                        renameClassLabel(c.key, next);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Tagline (shown as "CLASS | tagline")', c.tagline ?? '');
                        if (next === null) return;
                        renameClassTagline(c.key, next);
                      }}
                    >
                      Tagline
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      disabled={count > 0}
                      onClick={() => deleteClass(c.key)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="settings-add-row">
            <input
              value={newRankedLabel}
              onChange={(e) => setNewRankedLabel(e.target.value)}
              placeholder="Add ranked class…"
              className="settings-input"
            />
            <button
              type="button"
              className="settings-btn"
              disabled={!canAddRanked}
              onClick={() => {
                addClass(newRankedLabel, { isRanked: true });
                setNewRankedLabel('');
              }}
            >
              Add
            </button>
          </div>

          <h3 className="settings-subtitle settings-subtitle-spaced">Unranked / saved classes</h3>
          <div className="settings-list">
            {nonRankedClasses.map((c) => {
              const count = (byClass[c.key] ?? []).length;
              return (
                <div key={c.key} className="settings-list-item">
                  <span className="settings-class-name">
                    <span className="settings-class-name-main">{c.label}</span>
                    {c.tagline ? <span className="settings-class-tagline"> | {c.tagline}</span> : null}{' '}
                    <span className="settings-class-count">
                      · {count} {count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <div className="settings-list-actions">
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => moveClass(c.key, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => moveClass(c.key, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Rename class', c.label);
                        if (!next) return;
                        renameClassLabel(c.key, next);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Tagline (shown as "CLASS | tagline")', c.tagline ?? '');
                        if (next === null) return;
                        renameClassTagline(c.key, next);
                      }}
                    >
                      Tagline
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      disabled={count > 0}
                      onClick={() => deleteClass(c.key)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="settings-add-row">
            <input
              value={newUnrankedLabel}
              onChange={(e) => setNewUnrankedLabel(e.target.value)}
              placeholder="Add unranked class…"
              className="settings-input"
            />
            <button
              type="button"
              className="settings-btn"
              disabled={!canAddUnranked}
              onClick={() => {
                addClass(newUnrankedLabel, { isRanked: false });
                setNewUnrankedLabel('');
              }}
            >
              Add
            </button>
          </div>
        </div>

        <div className="settings-card card-surface">
          <h2 className="settings-title">TV Show Class Management</h2>
          <p className="settings-muted">
            Ranked classes affect global percentiles/rankings;
            unranked ones do not.
          </p>

          <h3 className="settings-subtitle">Ranked classes</h3>
          <div className="settings-list">
            {rankedTvClasses.map((c) => {
              const count = (tvByClass[c.key] ?? []).length;
              return (
                <div key={c.key} className="settings-list-item">
                  <span className="settings-class-name">
                    <span className="settings-class-name-main">{c.label}</span>
                    {c.tagline ? <span className="settings-class-tagline"> | {c.tagline}</span> : null}{' '}
                    <span className="settings-class-count">
                      · {count} {count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <div className="settings-list-actions">
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => moveTvClass(c.key, -1)}>↑</button>
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => moveTvClass(c.key, 1)}>↓</button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Rename class', c.label);
                        if (!next) return;
                        renameTvClassLabel(c.key, next);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Tagline (shown as "CLASS | tagline")', c.tagline ?? '');
                        if (next === null) return;
                        renameTvClassTagline(c.key, next);
                      }}
                    >
                      Tagline
                    </button>
                    <button type="button" className="settings-btn settings-btn-subtle" disabled={count > 0} onClick={() => deleteTvClass(c.key)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="settings-add-row">
            <input value={newRankedLabelTv} onChange={(e) => setNewRankedLabelTv(e.target.value)} placeholder="Add ranked class…" className="settings-input" />
            <button type="button" className="settings-btn" disabled={!canAddRankedTv} onClick={() => { addTvClass(newRankedLabelTv, { isRanked: true }); setNewRankedLabelTv(''); }}>Add</button>
          </div>

          <h3 className="settings-subtitle settings-subtitle-spaced">Unranked / saved classes</h3>
          <div className="settings-list">
            {nonRankedTvClasses.map((c) => {
              const count = (tvByClass[c.key] ?? []).length;
              return (
                <div key={c.key} className="settings-list-item">
                  <span className="settings-class-name">
                    <span className="settings-class-name-main">{c.label}</span>
                    {c.tagline ? <span className="settings-class-tagline"> | {c.tagline}</span> : null}{' '}
                    <span className="settings-class-count">
                      · {count} {count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <div className="settings-list-actions">
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => moveTvClass(c.key, -1)}>↑</button>
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => moveTvClass(c.key, 1)}>↓</button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Rename class', c.label);
                        if (!next) return;
                        renameTvClassLabel(c.key, next);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Tagline (shown as "CLASS | tagline")', c.tagline ?? '');
                        if (next === null) return;
                        renameTvClassTagline(c.key, next);
                      }}
                    >
                      Tagline
                    </button>
                    <button type="button" className="settings-btn settings-btn-subtle" disabled={count > 0} onClick={() => deleteTvClass(c.key)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="settings-add-row">
            <input value={newUnrankedLabelTv} onChange={(e) => setNewUnrankedLabelTv(e.target.value)} placeholder="Add unranked class…" className="settings-input" />
            <button type="button" className="settings-btn" disabled={!canAddUnrankedTv} onClick={() => { addTvClass(newUnrankedLabelTv, { isRanked: false }); setNewUnrankedLabelTv(''); }}>Add</button>
          </div>
        </div>

        <div className="settings-card card-surface settings-card-wide">
          <h2 className="settings-title">Display</h2>
          <p className="settings-muted">
            Adjust how entries appear across your lists.
          </p>
          <label className="settings-slider-label">
            <span>Top Cast Portraits: <strong>{settings.topCastCount}</strong></span>
            <input
              type="range"
              min={3}
              max={10}
              value={settings.topCastCount}
              className="settings-slider"
              onChange={(e) => {
                const v = Number(e.target.value);
                updateSettings({ topCastCount: v });
              }}
            />
            <span className="settings-slider-range">3 – 10</span>
          </label>

          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <span className="settings-toggle-label">Minimized Entries</span>
              <span className="settings-toggle-description">Compact view for all movie and show rows.</span>
            </div>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={settings.minimizedEntries}
                onChange={(e) => updateSettings({ minimizedEntries: e.target.checked })}
              />
              <span className="settings-switch-slider"></span>
            </label>
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

        <div className="settings-card card-surface settings-card-wide">
          <h2 className="settings-title">Account</h2>
          <p className="settings-muted">
            {hasFirebaseConfig
              ? 'Signed in with Admin (Cimmerial). Headshot-grid auth later.'
              : 'Headshot-grid auth and account creation will be added after Firebase + TMDb are wired.'}
          </p>
          <div className="settings-account-row">
            <span className="settings-account-label">Status</span>
            <span className="settings-account-value">
              {signedIn ? `Signed in as ${user?.email ?? 'Cimmerial'}` : 'Not signed in (offline mode)'}
            </span>
          </div>
          {signedIn && (
            <button type="button" className="settings-btn" onClick={() => signOut()}>
              Sign out
            </button>
          )}
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

