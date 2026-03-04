import { useState } from 'react';
import type { MovieShowItem, WatchRecord, WatchRecordType } from './EntryRowMovieShow';
import './EntrySettingsModal.css';

export type WatchDateType = 'RANGE' | 'SINGLE' | 'DNF' | 'LONG_AGO' | 'UNKNOWN';

export type WatchEntry = {
  id: string;
  type: WatchDateType;
  start?: string;
  end?: string;
  date?: string;
};

const WATCH_TYPES: { value: WatchRecordType; label: string }[] = [
  { value: 'DATE', label: 'Watch date' },
  { value: 'RANGE', label: 'Start / end date' },
  { value: 'DNF', label: 'DNF' },
  { value: 'LONG_AGO', label: 'Long ago' },
  { value: 'UNKNOWN', label: 'Unknown' }
];

type Props = {
  item: MovieShowItem;
  onClose: () => void;
  onSave: (records: WatchRecord[]) => void;
};

function newEmptyRecord(): WatchRecord {
  return {
    id: crypto.randomUUID(),
    type: 'DATE',
    year: new Date().getFullYear(),
    month: undefined,
    day: undefined
  };
}

function normalizeRecord(r: WatchRecord): WatchRecord {
  return { ...r, type: r.type ?? 'DATE' };
}

export function EntrySettingsModal({ item, onClose, onSave }: Props) {
  const initial: WatchRecord[] =
    item.watchRecords && item.watchRecords.length > 0
      ? item.watchRecords.map(normalizeRecord)
      : [newEmptyRecord()];
  const [records, setRecords] = useState<WatchRecord[]>(initial);

  const updateRecord = (id: string, patch: Partial<WatchRecord>) => {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRecord = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSave = () => {
    const valid = records.filter((r) => {
      if (r.type === 'DATE' || r.type === 'RANGE') return (r.year ?? 0) > 0 && !Number.isNaN(r.year ?? 0);
      return true;
    });
    onSave(valid.length > 0 ? valid : [newEmptyRecord()]);
    onClose();
  };

  return (
    <div className="entry-modal-backdrop" onClick={onClose}>
      <div className="entry-modal card-surface" onClick={(e) => e.stopPropagation()}>
        <header className="entry-modal-header">
          <h2 className="entry-modal-title">Edit watches</h2>
          <button type="button" className="entry-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <p className="entry-modal-subtitle">{item.title}</p>

        <div className="entry-modal-rows">
          {records.map((row) => (
            <div key={row.id} className="entry-modal-row entry-modal-row-watch">
              <label className="entry-modal-field entry-modal-field-type">
                <span>Type</span>
                <select
                  value={row.type ?? 'DATE'}
                  onChange={(e) => updateRecord(row.id, { type: e.target.value as WatchRecordType })}
                >
                  {WATCH_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {(row.type === 'DATE' || row.type === 'RANGE') && (
                <>
                  <label className="entry-modal-field">
                    <span>{row.type === 'RANGE' ? 'Start year' : 'Year'}</span>
                    <input
                      type="number"
                      value={row.year ?? ''}
                      onChange={(e) =>
                        updateRecord(row.id, { year: Number(e.target.value) || 0 })
                      }
                      placeholder="2024"
                    />
                  </label>
                  <label className="entry-modal-field">
                    <span>Month</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={row.month ?? ''}
                      onChange={(e) =>
                        updateRecord(row.id, {
                          month: e.target.value ? Number(e.target.value) : undefined
                        })
                      }
                      placeholder="—"
                    />
                  </label>
                  <label className="entry-modal-field">
                    <span>Day</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={row.day ?? ''}
                      onChange={(e) =>
                        updateRecord(row.id, {
                          day: e.target.value ? Number(e.target.value) : undefined
                        })
                      }
                      placeholder="—"
                    />
                  </label>
                </>
              )}

              {row.type === 'RANGE' && (
                <>
                  <span className="entry-modal-field-sep">→</span>
                  <label className="entry-modal-field">
                    <span>End year</span>
                    <input
                      type="number"
                      value={row.endYear ?? ''}
                      onChange={(e) =>
                        updateRecord(row.id, {
                          endYear: e.target.value ? Number(e.target.value) : undefined
                        })
                      }
                      placeholder="—"
                    />
                  </label>
                  <label className="entry-modal-field">
                    <span>Month</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={row.endMonth ?? ''}
                      onChange={(e) =>
                        updateRecord(row.id, {
                          endMonth: e.target.value ? Number(e.target.value) : undefined
                        })
                      }
                      placeholder="—"
                    />
                  </label>
                  <label className="entry-modal-field">
                    <span>Day</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={row.endDay ?? ''}
                      onChange={(e) =>
                        updateRecord(row.id, {
                          endDay: e.target.value ? Number(e.target.value) : undefined
                        })
                      }
                      placeholder="—"
                    />
                  </label>
                </>
              )}

              {row.type === 'DNF' && (
                <>
                  <label className="entry-modal-field">
                    <span>Started year</span>
                    <input
                      type="number"
                      value={row.year ?? ''}
                      onChange={(e) =>
                        updateRecord(row.id, { year: e.target.value ? Number(e.target.value) : undefined })
                      }
                      placeholder="2024"
                    />
                  </label>
                  <label className="entry-modal-field">
                    <span>Month</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={row.month ?? ''}
                      onChange={(e) =>
                        updateRecord(row.id, {
                          month: e.target.value ? Number(e.target.value) : undefined
                        })
                      }
                      placeholder="—"
                    />
                  </label>
                  <label className="entry-modal-field">
                    <span>Day</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={row.day ?? ''}
                      onChange={(e) =>
                        updateRecord(row.id, {
                          day: e.target.value ? Number(e.target.value) : undefined
                        })
                      }
                      placeholder="—"
                    />
                  </label>
                  <label className="entry-modal-field entry-modal-field-slider">
                    <span>Got through: {(row.dnfPercent ?? 0)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={row.dnfPercent ?? 0}
                      onChange={(e) =>
                        updateRecord(row.id, { dnfPercent: Number(e.target.value) })
                      }
                    />
                  </label>
                </>
              )}

              {(row.type === 'LONG_AGO' || row.type === 'UNKNOWN') && (
                <span className="entry-modal-type-label">
                  {row.type === 'LONG_AGO' ? 'Long ago' : 'Unknown'}
                </span>
              )}

              <button
                type="button"
                className="entry-modal-remove"
                onClick={() => removeRecord(row.id)}
                aria-label="Remove watch"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="entry-modal-add"
          onClick={() => setRecords((prev) => [...prev, newEmptyRecord()])}
        >
          Add watch
        </button>

        <div className="entry-modal-footer">
          <button type="button" className="entry-modal-btn" onClick={handleSave}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
