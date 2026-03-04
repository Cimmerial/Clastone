import { useMemo, useState } from 'react';
import { useAuth, hasFirebaseConfig } from '../context/AuthContext';
import { useMoviesStore } from '../state/moviesStore';
import './SettingsPage.css';

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const {
    classes,
    byClass,
    addClass,
    renameClassLabel,
    moveClass,
    deleteClass,
    isRankedClass
  } = useMoviesStore();
  const [newRankedLabel, setNewRankedLabel] = useState('');
  const [newUnrankedLabel, setNewUnrankedLabel] = useState('');
  const signedIn = hasFirebaseConfig && user;

  const rankedClasses = useMemo(() => classes.filter((c) => c.isRanked), [classes]);
  const nonRankedClasses = useMemo(() => classes.filter((c) => !c.isRanked), [classes]);

  const canAddRanked = useMemo(() => newRankedLabel.trim().length > 0, [newRankedLabel]);
  const canAddUnranked = useMemo(() => newUnrankedLabel.trim().length > 0, [newUnrankedLabel]);

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-tagline">CLASSES + TAGS (UI ONLY)</p>
        </div>
      </header>

      <div className="settings-grid">
        <div className="settings-card card-surface">
          <h2 className="settings-title">Class Management</h2>
          <p className="settings-muted">
            Classes are per account and saved to Firebase. Ranked classes affect global percentiles;
            unranked ones (BABY / DELICIOUS GARBAGE / UNRANKED) do not.
          </p>

          <h3 className="settings-subtitle">Ranked classes</h3>
          <div className="settings-list">
            {rankedClasses.map((c) => {
              const count = (byClass[c.key] ?? []).length;
              return (
                <div key={c.key} className="settings-list-item">
                  <span className="settings-class-name">
                    {c.label}{' '}
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
                    {c.label}{' '}
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
          <h2 className="settings-title">Sticker Tags</h2>
          <p className="settings-muted">Predefined + custom tags later. For now, visual stub.</p>
          <div className="settings-tags">
            {['BEST_MYSTERY', 'BEST_COMEDY', 'BEST_ANTHOLOGY', 'BEST_SCORE', 'BEST_ACTION'].map(
              (t) => (
                <span key={t} className="chip chip-accent">
                  {t}
                </span>
              )
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
    </section>
  );
}

