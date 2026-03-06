import { useMemo, useState } from 'react';
import { useAuth, hasFirebaseConfig } from '../context/AuthContext';
import { RandomQuote } from '../components/RandomQuote';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
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
  const {
    classes,
    byClass,
    addClass,
    renameClassLabel,
    renameClassTagline,
    moveClass,
    deleteClass,
    isRankedClass
  } = useMoviesStore();
  const {
    classes: tvClasses,
    byClass: tvByClass,
    addClass: addTvClass,
    renameClassLabel: renameTvClassLabel,
    renameClassTagline: renameTvClassTagline,
    moveClass: moveTvClass,
    deleteClass: deleteTvClass,
    isRankedClass: isRankedTvClass
  } = useTvStore();
  const [newRankedLabel, setNewRankedLabel] = useState('');
  const [newUnrankedLabel, setNewUnrankedLabel] = useState('');
  const [newRankedLabelTv, setNewRankedLabelTv] = useState('');
  const [newUnrankedLabelTv, setNewUnrankedLabelTv] = useState('');
  const signedIn = hasFirebaseConfig && user;
  const [topCastCount, setTopCastCount] = useState(getTopCastCount);

  const rankedClasses = useMemo(() => classes.filter((c) => c.isRanked), [classes]);
  const nonRankedClasses = useMemo(() => classes.filter((c) => !c.isRanked), [classes]);
  const rankedTvClasses = useMemo(() => tvClasses.filter((c) => c.isRanked), [tvClasses]);
  const nonRankedTvClasses = useMemo(() => tvClasses.filter((c) => !c.isRanked), [tvClasses]);

  const canAddRanked = useMemo(() => newRankedLabel.trim().length > 0, [newRankedLabel]);
  const canAddUnranked = useMemo(() => newUnrankedLabel.trim().length > 0, [newUnrankedLabel]);
  const canAddRankedTv = useMemo(() => newRankedLabelTv.trim().length > 0, [newRankedLabelTv]);
  const canAddUnrankedTv = useMemo(() => newUnrankedLabelTv.trim().length > 0, [newUnrankedLabelTv]);

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
            <span>Top Cast Portraits: <strong>{topCastCount}</strong></span>
            <input
              type="range"
              min={3}
              max={10}
              value={topCastCount}
              className="settings-slider"
              onChange={(e) => {
                const v = Number(e.target.value);
                setTopCastCount(v);
                try { localStorage.setItem('clastone-topCastCount', String(v)); } catch { /* ignore */ }
              }}
            />
            <span className="settings-slider-range">3 – 10</span>
          </label>
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
    </section>
  );
}

