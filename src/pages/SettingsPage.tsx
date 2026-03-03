import { useMemo, useState } from 'react';
import './SettingsPage.css';

type ClassItem = {
  key: string;
  label: string;
};

const initialMovieClasses: ClassItem[] = [
  { key: 'OLYMPUS', label: 'OLYMPUS' },
  { key: 'DAMN_GOOD', label: 'DAMN_GOOD' },
  { key: 'GOOD', label: 'GOOD' },
  { key: 'ALRIGHT', label: 'ALRIGHT' },
  { key: 'MEH', label: 'MEH' },
  { key: 'BAD', label: 'BAD' },
  { key: 'DELICIOUS_GARBAGE', label: 'DELICIOUS_GARBAGE' }
];

export function SettingsPage() {
  const [classes, setClasses] = useState<ClassItem[]>(initialMovieClasses);
  const [newClass, setNewClass] = useState('');

  const canAdd = useMemo(() => newClass.trim().length > 0, [newClass]);

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-tagline">CLASSES + TAGS (UI ONLY)</p>
        </div>
        <p className="page-subtitle">Rename classes, manage tags, update account later.</p>
      </header>

      <div className="settings-grid">
        <div className="settings-card card-surface">
          <h2 className="settings-title">Class Management</h2>
          <p className="settings-muted">UI only for now (Firebase later).</p>

          <div className="settings-add-row">
            <input
              value={newClass}
              onChange={(e) => setNewClass(e.target.value)}
              placeholder="Add custom class…"
              className="settings-input"
            />
            <button
              type="button"
              className="settings-btn"
              disabled={!canAdd}
              onClick={() => {
                const key = newClass.trim().toUpperCase().replace(/\s+/g, '_');
                setClasses((prev) => [...prev, { key, label: key }]);
                setNewClass('');
              }}
            >
              Add
            </button>
          </div>

          <div className="settings-list">
            {classes.map((c) => (
              <div key={c.key} className="settings-list-item">
                <span className="settings-class-name">{c.label}</span>
                <button
                  type="button"
                  className="settings-btn settings-btn-subtle"
                  onClick={() => {
                    const next = prompt('Rename class', c.label);
                    if (!next) return;
                    setClasses((prev) =>
                      prev.map((x) => (x.key === c.key ? { key: x.key, label: next } : x))
                    );
                  }}
                >
                  Rename
                </button>
              </div>
            ))}
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
            Headshot-grid auth and account creation will be added after Firebase + TMDb are wired.
          </p>
          <div className="settings-account-row">
            <span className="settings-account-label">Status</span>
            <span className="settings-account-value">Not signed in (mock)</span>
          </div>
        </div>
      </div>
    </section>
  );
}

