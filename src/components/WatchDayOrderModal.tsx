import { useState, useEffect } from 'react';
import { X, ArrowUp, ArrowDown } from 'lucide-react';
import type { FlatWatchEvent } from '../lib/watchRecordChronology';
import { tmdbImagePath } from '../lib/tmdb';
import './WatchDayOrderModal.css';

function formatSortKeyLabel(sortKey: string): string {
  const parts = sortKey.split('-').map((x) => parseInt(x, 10));
  const y = parts[0];
  const m = parts[1] || 1;
  const d = parts[2] || 1;
  if (!Number.isFinite(y) || y <= 0) return sortKey;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type Props = {
  sortKey: string;
  initialRows: FlatWatchEvent[];
  onClose: () => void;
  onSave: (orderedRecordIds: string[]) => void | Promise<void>;
  isSaving?: boolean;
};

export function WatchDayOrderModal({ sortKey, initialRows, onClose, onSave, isSaving }: Props) {
  const [rows, setRows] = useState<FlatWatchEvent[]>(() => [...initialRows]);

  useEffect(() => {
    setRows([...initialRows]);
  }, [sortKey, initialRows]);

  const moveUp = (index: number) => {
    if (index <= 0) return;
    setRows((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveDown = (index: number) => {
    setRows((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const handleSave = () => {
    void onSave(rows.map((r) => String(r.record.id)));
  };

  return (
    <div className="wdo-backdrop" onClick={onClose}>
      <div className="wdo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wdo-header">
          <h3 className="wdo-title">Watch order · {formatSortKeyLabel(sortKey)}</h3>
          <button type="button" className="wdo-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="wdo-hint wdo-hint--top">End of day</p>
        <ul className="wdo-list">
          {rows.map((row, i) => (
            <li key={`${row.item.id}-${row.record.id}`} className="wdo-row">
              <div className="wdo-poster-wrap">
                {row.item.posterPath ? (
                  <img
                    className="wdo-poster"
                    src={tmdbImagePath(row.item.posterPath, 'w92') ?? ''}
                    alt=""
                  />
                ) : (
                  <div className="wdo-poster wdo-poster--empty" />
                )}
              </div>
              <div className="wdo-meta">
                <span className="wdo-title-line">{row.item.title}</span>
                <span className="wdo-badge">{row.isMovie ? 'Movie' : 'TV'}</span>
              </div>
              <div className="wdo-arrows">
                <button
                  type="button"
                  className="wdo-arrow"
                  disabled={i === 0 || isSaving}
                  onClick={() => moveUp(i)}
                  aria-label="Move up"
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="wdo-arrow"
                  disabled={i === rows.length - 1 || isSaving}
                  onClick={() => moveDown(i)}
                  aria-label="Move down"
                >
                  <ArrowDown size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="wdo-hint wdo-hint--bottom">Start of day</p>
        <div className="wdo-footer">
          <button type="button" className="wdo-btn wdo-btn--ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="button" className="wdo-btn wdo-btn--primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save order'}
          </button>
        </div>
      </div>
    </div>
  );
}
