import { useState } from 'react';
import { MovieShowItem } from './EntryRowMovieShow';
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
};

export function EntrySettingsModal({ item, onClose }: Props) {
  const initial: WatchEntry[] =
    item.watchHistory && item.watchHistory.length > 0
      ? item.watchHistory
      : [
          {
            id: 'w1',
            type: 'RANGE',
            start: '2024-01-10',
            end: '2024-01-12'
          }
        ];

  const [rows, setRows] = useState<WatchEntry[]>(initial);

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
            aria-label="Close settings"
          >
            ✕
          </button>
        </header>

        <p className="entry-modal-subtitle">{item.title}</p>

        <div className="entry-modal-rows">
          {rows.map((row) => (
            <div key={row.id} className="entry-modal-row">
              <select
                className="entry-modal-select"
                value={row.type}
                onChange={(e) => {
                  const nextType = e.target.value as WatchDateType;
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, type: nextType } : r
                    )
                  );
                }}
              >
                <option value="RANGE">Start + finish</option>
                <option value="SINGLE">Single date</option>
                <option value="DNF">DNF</option>
                <option value="LONG_AGO">Long ago</option>
                <option value="UNKNOWN">Unknown</option>
              </select>

              {row.type === 'RANGE' && (
                <>
                  <input
                    className="entry-modal-input"
                    type="date"
                    value={row.start ?? ''}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.id === row.id ? { ...r, start: e.target.value } : r
                        )
                      )
                    }
                  />
                  <input
                    className="entry-modal-input"
                    type="date"
                    value={row.end ?? ''}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.id === row.id ? { ...r, end: e.target.value } : r
                        )
                      )
                    }
                  />
                </>
              )}

              {row.type === 'SINGLE' && (
                <input
                  className="entry-modal-input"
                  type="date"
                  value={row.date ?? ''}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.id === row.id ? { ...r, date: e.target.value } : r
                      )
                    )
                  }
                />
              )}
            </div>
          ))}
        </div>

        <div className="entry-modal-footer">
          <button
            type="button"
            className="entry-modal-btn"
            onClick={onClose}
          >
            Done (mock only)
          </button>
        </div>
      </div>
    </div>
  );
}

