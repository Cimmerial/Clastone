import { useState } from 'react';
import type { MovieShowItem, WatchRecord } from './EntryRowMovieShow';
import './EntrySettingsModal.css';

export type WatchDateType = 'RANGE' | 'SINGLE' | 'DNF' | 'LONG_AGO' | 'UNKNOWN';

export type WatchEntry = {
  id: string;
  type: WatchDateType;
  start?: string;
  end?: string;
  date?: string;
};

type Props = {
  item: MovieShowItem;
  onClose: () => void;
  onSave: (records: WatchRecord[]) => void;
};

function newEmptyRecord(): WatchRecord {
  return { id: crypto.randomUUID(), year: new Date().getFullYear(), month: undefined, day: undefined };
}

export function EntrySettingsModal({ item, onClose, onSave }: Props) {
  const initial: WatchRecord[] =
    item.watchRecords && item.watchRecords.length > 0 ? item.watchRecords : [newEmptyRecord()];
  const [records, setRecords] = useState<WatchRecord[]>(initial);

  const updateRecord = (id: string, patch: Partial<WatchRecord>) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const removeRecord = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSave = () => {
    const valid = records.filter((r) => r.year > 0 && !Number.isNaN(r.year));
    onSave(valid.length > 0 ? valid : [newEmptyRecord()]);
    onClose();
  };

  return (
    <div className="entry-modal-backdrop" onClick={onClose}>
      <div
        className="entry-modal card-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="entry-modal-header">
          <h2 className="entry-modal-title">Edit watches</h2>
          <button
            type="button"
            className="entry-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <p className="entry-modal-subtitle">{item.title}</p>

        <div className="entry-modal-rows">
          {records.map((row) => (
            <div key={row.id} className="entry-modal-row entry-modal-row-watch">
              <label className="entry-modal-field">
                <span>Year</span>
                <input
                  type="number"
                  value={row.year || ''}
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
