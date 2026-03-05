import { useMemo, useState } from 'react';
import type { MovieShowItem, WatchRecord, WatchRecordType } from './EntryRowMovieShow';
import { ThemedDropdown, type ThemedDropdownOption } from './ThemedDropdown';
import {
  getYearOptions,
  MONTH_OPTIONS,
  DAY_OPTIONS,
  applyDatePreset,
  DATE_PRESET_OPTIONS
} from '../lib/dateDropdowns';
import './EntrySettingsModal.css';

export type WatchDateType = 'RANGE' | 'SINGLE' | 'DNF' | 'LONG_AGO' | 'UNKNOWN';

export type WatchEntry = {
  id: string;
  type: WatchDateType;
  start?: string;
  end?: string;
  date?: string;
};

const WATCH_TYPES: ThemedDropdownOption<WatchRecordType>[] = [
  { value: 'DATE', label: 'Watch date' },
  { value: 'RANGE', label: 'Start / end date' },
  { value: 'DNF', label: 'DNF' },
  { value: 'CURRENT', label: 'Currently watching' },
  { value: 'LONG_AGO', label: 'Long ago' },
  { value: 'UNKNOWN', label: 'Unknown' }
];

type Props = {
  item: MovieShowItem;
  onClose: () => void;
  onSave: (records: WatchRecord[]) => void;
  /** When user deletes all watches and saves, call this to remove the entry from the list entirely. */
  onRemoveEntry?: (itemId: string) => void;
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

export function EntrySettingsModal({ item, onClose, onSave, onRemoveEntry }: Props) {
  const releaseYear = useMemo(() => {
    const s = item.releaseDate?.trim().slice(0, 4);
    if (s && /^\d{4}$/.test(s)) return parseInt(s, 10);
    return undefined;
  }, [item.releaseDate]);

  const yearOptions = useMemo(() => getYearOptions(releaseYear), [releaseYear]);

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
      if (r.type === 'DNF' || r.type === 'CURRENT') return (r.year ?? 0) > 0 && !Number.isNaN(r.year ?? 0);
      return true;
    });
    if (valid.length === 0 && onRemoveEntry) {
      onRemoveEntry(item.id);
      onClose();
      return;
    }
    onSave(valid.length > 0 ? valid : [newEmptyRecord()]);
    onClose();
  };

  const formatMinutesIn = (mins: number): string => {
    const m = Math.max(0, Math.round(mins));
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (h <= 0) return `${mm}m in`;
    if (mm === 0) return `${h}h in`;
    return `${h}h ${mm}m in`;
  };

  const progressLabel = (pct: number): string => {
    const runtime = item.runtimeMinutes;
    const totalEpisodes = item.totalEpisodes;
    const totalSeasons = item.totalSeasons;
    if (totalEpisodes && totalEpisodes > 0) {
      const ep = Math.max(1, Math.min(totalEpisodes, Math.round((pct / 100) * totalEpisodes)));
      if (totalSeasons && totalSeasons > 0) {
        const epsPerSeason = Math.ceil(totalEpisodes / totalSeasons);
        const season = Math.max(1, Math.min(totalSeasons, Math.ceil(ep / epsPerSeason)));
        const epInSeason = Math.max(1, ep - (season - 1) * epsPerSeason);
        return `≈ S${season}E${epInSeason}`;
      }
      return `≈ E${ep}`;
    }
    if (runtime && runtime > 0) {
      return formatMinutesIn((pct / 100) * runtime);
    }
    return '';
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
                <ThemedDropdown<WatchRecordType>
                  value={row.type ?? 'DATE'}
                  options={WATCH_TYPES}
                  onChange={(v) => updateRecord(row.id, { type: v })}
                />
              </label>

              {(row.type === 'DATE' || row.type === 'RANGE') && (
                <>
                  <label className="entry-modal-field">
                    <span>{row.type === 'RANGE' ? 'Start year' : 'Year'}</span>
                    <ThemedDropdown
                      value={row.year != null ? String(row.year) : ''}
                      options={yearOptions}
                      onChange={(v) => updateRecord(row.id, { year: v ? Number(v) : undefined })}
                    />
                  </label>
                  <label className="entry-modal-field">
                    <span>Month</span>
                    <ThemedDropdown
                      value={row.month != null ? String(row.month) : ''}
                      options={MONTH_OPTIONS}
                      onChange={(v) =>
                        updateRecord(row.id, { month: v ? Number(v) : undefined })
                      }
                    />
                  </label>
                  <label className="entry-modal-field">
                    <span>Day</span>
                    <ThemedDropdown
                      value={row.day != null ? String(row.day) : ''}
                      options={DAY_OPTIONS}
                      onChange={(v) =>
                        updateRecord(row.id, { day: v ? Number(v) : undefined })
                      }
                    />
                  </label>
                  <div className="entry-modal-preset-wrap">
                    <ThemedDropdown
                      value=""
                      options={DATE_PRESET_OPTIONS as ThemedDropdownOption<string>[]}
                      triggerLabel="≡"
                      placeholder="Preset"
                      onChange={(preset) => {
                        if (preset !== 'today' && preset !== 'yesterday' && preset !== 'this_year') return;
                        const { year, month, day } = applyDatePreset(preset);
                        updateRecord(row.id, {
                          year: year ? Number(year) : undefined,
                          month: month ? Number(month) : undefined,
                          day: day ? Number(day) : undefined
                        });
                      }}
                      aria-label="Date preset"
                    />
                  </div>
                </>
              )}

              {row.type === 'RANGE' && (
                <>
                  <span className="entry-modal-field-sep">→</span>
                  <label className="entry-modal-field">
                    <span>End year</span>
                    <ThemedDropdown
                      value={row.endYear != null ? String(row.endYear) : ''}
                      options={yearOptions}
                      onChange={(v) =>
                        updateRecord(row.id, { endYear: v ? Number(v) : undefined })
                      }
                    />
                  </label>
                  <label className="entry-modal-field">
                    <span>Month</span>
                    <ThemedDropdown
                      value={row.endMonth != null ? String(row.endMonth) : ''}
                      options={MONTH_OPTIONS}
                      onChange={(v) =>
                        updateRecord(row.id, { endMonth: v ? Number(v) : undefined })
                      }
                    />
                  </label>
                  <label className="entry-modal-field">
                    <span>Day</span>
                    <ThemedDropdown
                      value={row.endDay != null ? String(row.endDay) : ''}
                      options={DAY_OPTIONS}
                      onChange={(v) =>
                        updateRecord(row.id, { endDay: v ? Number(v) : undefined })
                      }
                    />
                  </label>
                </>
              )}

              {(row.type === 'DNF' || row.type === 'CURRENT') && (
                <>
                  <label className="entry-modal-field">
                    <span>Started year</span>
                    <ThemedDropdown
                      value={row.year != null ? String(row.year) : ''}
                      options={yearOptions}
                      onChange={(v) =>
                        updateRecord(row.id, { year: v ? Number(v) : undefined })
                      }
                    />
                  </label>
                  <label className="entry-modal-field">
                    <span>Month</span>
                    <ThemedDropdown
                      value={row.month != null ? String(row.month) : ''}
                      options={MONTH_OPTIONS}
                      onChange={(v) =>
                        updateRecord(row.id, { month: v ? Number(v) : undefined })
                      }
                    />
                  </label>
                  <label className="entry-modal-field">
                    <span>Day</span>
                    <ThemedDropdown
                      value={row.day != null ? String(row.day) : ''}
                      options={DAY_OPTIONS}
                      onChange={(v) =>
                        updateRecord(row.id, { day: v ? Number(v) : undefined })
                      }
                    />
                  </label>
                  <div className="entry-modal-preset-wrap">
                    <ThemedDropdown
                      value=""
                      options={DATE_PRESET_OPTIONS as ThemedDropdownOption<string>[]}
                      triggerLabel="≡"
                      placeholder="Preset"
                      onChange={(preset) => {
                        if (preset !== 'today' && preset !== 'yesterday' && preset !== 'this_year') return;
                        const { year, month, day } = applyDatePreset(preset);
                        updateRecord(row.id, {
                          year: year ? Number(year) : undefined,
                          month: month ? Number(month) : undefined,
                          day: day ? Number(day) : undefined
                        });
                      }}
                      aria-label="Date preset"
                    />
                  </div>
                  <label className="entry-modal-field entry-modal-field-slider">
                    <span>
                      {row.type === 'DNF' ? 'Got through' : 'Current progress'}: {(row.dnfPercent ?? 0)}%
                      {progressLabel(row.dnfPercent ?? 0) ? ` · ${progressLabel(row.dnfPercent ?? 0)}` : ''}
                    </span>
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
