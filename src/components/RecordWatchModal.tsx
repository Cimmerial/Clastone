import { useMemo, useState, useEffect } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { WatchRecord, WatchRecordType } from './EntryRowMovieShow';
import { ThemedDropdown, type ThemedDropdownOption } from './ThemedDropdown';
import { getYearOptions, MONTH_OPTIONS, DAY_OPTIONS, applyDatePreset, DATE_PRESET_OPTIONS, type DatePreset } from '../lib/dateDropdowns';
import './RecordWatchModal.css';

const WATCH_TYPES: ThemedDropdownOption<WatchRecordType>[] = [
  { value: 'DATE', label: 'Watch date' },
  { value: 'RANGE', label: 'Start / end date' },
  { value: 'DNF', label: 'DNF: Specific date' },
  { value: 'DNF_LONG_AGO', label: 'DNF: Long ago' },
  { value: 'CURRENT', label: 'Currently watching' },
  { value: 'LONG_AGO', label: 'Long ago' },
  { value: 'UNKNOWN', label: 'Unknown' }
];

export type RecordWatchTarget = {
  id: number;
  stringId?: string;
  title: string;
  poster_path?: string;
  media_type: 'movie' | 'tv' | 'person';
  subtitle?: string;
  releaseDate?: string;
  runtimeMinutes?: number;
  totalSeasons?: number;
  totalEpisodes?: number;
};

export type RecordWatchSaveParams = {
  watches: WatchRecord[];
  classKey?: string;
  position?: 'top' | 'middle' | 'bottom';
};

type Props = {
  target: RecordWatchTarget;
  rankedClasses: { key: string; label: string; tagline?: string }[];
  showClassPicker: boolean;
  initialRecords?: WatchRecord[];
  onSave: (params: RecordWatchSaveParams, goToMovie: boolean) => void | Promise<void>;
  onClose: () => void;
  onRemoveEntry?: (itemId: string) => void;
  isSaving: boolean;
  /** e.g. "Save and go to movie" */
  primaryButtonLabel?: string;
};

export function RecordWatchModal({
  target,
  rankedClasses,
  showClassPicker,
  initialRecords,
  onSave,
  onClose,
  onRemoveEntry,
  isSaving,
  primaryButtonLabel
}: Props) {
  const [records, setRecords] = useState<WatchRecord[]>(() => {
    if (initialRecords && initialRecords.length > 0) {
      return initialRecords.map(r => ({ ...r, id: r.id || crypto.randomUUID() }));
    }
    return [{
      id: crypto.randomUUID(),
      type: 'DATE',
      year: new Date().getFullYear(),
    } as WatchRecord];
  });
  const [recordClassKey, setRecordClassKey] = useState('');
  const [recordPosition, setRecordPosition] = useState<'top' | 'middle' | 'bottom'>('top');
  const [error, setError] = useState<string | null>(null);
  const [removeClickCount, setRemoveClickCount] = useState(0);

  useEffect(() => {
    if (removeClickCount > 0) {
      const timer = setTimeout(() => setRemoveClickCount(0), 3000);
      return () => clearTimeout(timer);
    }
  }, [removeClickCount]);

  const getWatchProgressLabel = (r: WatchRecord) => {
    const label = r.type === 'DNF' || r.type === 'DNF_LONG_AGO' ? 'DNF' : 'Watching';
    const pct = r.dnfPercent ?? 50;

    if (target.media_type === 'movie' && target.runtimeMinutes) {
      const totalMins = Math.round((pct / 100) * target.runtimeMinutes);
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      const duration = h > 0 ? `${h}h ${m}m` : `${m}m`;
      return `${label}: ${duration}`;
    }

    if (target.media_type === 'tv' && target.totalEpisodes) {
      const epCount = Math.round((pct / 100) * target.totalEpisodes);
      return `${label}: Ep ${epCount} of ${target.totalEpisodes}`;
    }

    return `${label}: ${pct}%`;
  };

  // Lock scrolling on the body when the modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow || 'unset';
    };
  }, []);

  const updateRecord = (id: string, updates: Partial<WatchRecord>) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const addRecord = () => {
    setRecords(prev => [...prev, { id: crypto.randomUUID(), type: 'DATE', year: new Date().getFullYear() } as WatchRecord]);
  };

  const removeRecord = (id: string | number) => {
    // String(id) because crypto.randomUUID() returns string, but old props might be number (though unlikely here)
    if (records.length <= 1 && !onRemoveEntry) return;
    setRecords(prev => prev.filter(r => String(r.id) !== String(id)));
  };

  const { releaseYear, releaseMonth, releaseDay } = useMemo(() => {
    const rd = target.releaseDate;
    if (rd && /^\d{4}-\d{2}-\d{2}$/.test(rd)) {
      const parts = rd.split('-');
      return {
        releaseYear: parseInt(parts[0], 10),
        releaseMonth: parseInt(parts[1], 10),
        releaseDay: parseInt(parts[2], 10)
      };
    }
    // Fallback to subtitle if it's just a year
    const s = target.subtitle?.trim();
    if (s && /^\d{4}$/.test(s)) {
      return { releaseYear: parseInt(s, 10), releaseMonth: undefined, releaseDay: undefined };
    }
    return { releaseYear: undefined, releaseMonth: undefined, releaseDay: undefined };
  }, [target.releaseDate, target.subtitle]);

  const yearOptions = useMemo(() => getYearOptions(releaseYear), [releaseYear]);

  const getMonthOptionsForRecord = (yearStr: string) => {
    const selectedYear = parseInt(yearStr, 10);
    if (!selectedYear || !releaseYear || !releaseMonth || selectedYear > releaseYear) return MONTH_OPTIONS;
    return MONTH_OPTIONS.filter(o => !o.value || parseInt(o.value, 10) >= releaseMonth);
  };

  const getDayOptionsForRecord = (yearStr: string, monthStr: string) => {
    const selectedYear = parseInt(yearStr, 10);
    const selectedMonth = parseInt(monthStr, 10);
    if (!selectedYear || !selectedMonth || !releaseYear || !releaseMonth || !releaseDay) return DAY_OPTIONS;
    if (selectedYear > releaseYear) return DAY_OPTIONS;
    if (selectedYear === releaseYear && selectedMonth > releaseMonth) return DAY_OPTIONS;
    return DAY_OPTIONS.filter(o => !o.value || parseInt(o.value, 10) >= releaseDay);
  };

  const applyPreset = (id: string, preset: DatePreset | 'reset') => {
    if (preset === 'reset') {
      updateRecord(id, { year: undefined, month: undefined, day: undefined });
      return;
    }
    const { year, month, day } = applyDatePreset(preset);
    updateRecord(id, {
      year: parseInt(year, 10) || undefined,
      month: parseInt(month, 10) || undefined,
      day: parseInt(day, 10) || undefined
    });
  };

  function buildWatchRecord(r: WatchRecord): WatchRecord | null {
    const { type, year, month, day, endYear, endMonth, endDay, dnfPercent } = r;
    if (type === 'DNF' || type === 'CURRENT') {
      if (!year) return null;
      return {
        id: r.id,
        type,
        year,
        month,
        day,
        dnfPercent: Math.min(100, Math.max(0, dnfPercent ?? 50))
      };
    }
    if (type === 'LONG_AGO') {
      return { id: r.id, type: 'LONG_AGO' };
    }
    if (type === 'DNF_LONG_AGO') {
      return { id: r.id, type: 'DNF_LONG_AGO', dnfPercent: Math.min(100, Math.max(0, dnfPercent ?? 50)) };
    }
    if (type === 'UNKNOWN') {
      return { id: r.id, type: 'UNKNOWN' };
    }
    if (!year) return null;
    if (type === 'DATE') {
      return {
        id: r.id,
        type: 'DATE',
        year,
        month,
        day
      };
    }
    // RANGE
    return {
      id: r.id,
      type: 'RANGE',
      year,
      month,
      day,
      endYear,
      endMonth,
      endDay
    };
  }

  const handleSave = async (goToMovie: boolean) => {
    setError(null);
    if (records.length === 0) {
      setError('Please add at least one watch record.');
      return;
    }

    // Basic validation for the first record for now
    const first = records[0];
    if (target.media_type !== 'person' && (first.type === 'DATE' || first.type === 'RANGE' || first.type === 'DNF' || first.type === 'CURRENT') && !first.year) {
      setError('Please enter a year for your watch.');
      return;
    }

    if (showClassPicker && (!recordClassKey || !rankedClasses.some((c) => c.key === recordClassKey))) {
      setError('Pick a ranked class.');
      return;
    }

    const validatedWatches = records
      .map(r => buildWatchRecord(r))
      .filter((r): r is WatchRecord => r !== null);

    if (validatedWatches.length === 0) {
      if (onRemoveEntry) {
        onRemoveEntry(target.stringId || String(target.id));
        onClose();
        return;
      }
      setError('Please enter at least one valid watch record.');
      return;
    }
    await onSave(
      {
        watches: validatedWatches,
        classKey: recordClassKey || undefined,
        position: recordClassKey ? recordPosition : undefined
      },
      goToMovie
    );
    setError(null);
    onClose();
  };

  return (
    <div className="record-modal-backdrop" onClick={onClose}>
      <div className={`record-modal ${showClassPicker ? 'record-modal-wide' : 'record-modal-compact'}`} onClick={(e) => e.stopPropagation()}>
        <div className={`record-modal-layout ${!showClassPicker ? 'record-modal-layout-single' : ''}`}>
          {/* LEFT COLUMN */}
          {target.media_type !== 'person' && (
            <div className="record-modal-left">
              <header className="record-modal-left-header">
                <h1 className="record-modal-large-title">{target.title}</h1>
              </header>

              <div className="record-entries-list">
                {records.map((r, idx) => {
                  const isDnfOrCurrent = r.type === 'DNF' || r.type === 'CURRENT' || r.type === 'DNF_LONG_AGO';
                  const isRange = r.type === 'RANGE';
                  const showDates = r.type !== 'LONG_AGO' && r.type !== 'DNF_LONG_AGO' && r.type !== 'UNKNOWN';

                  return (
                    <div key={r.id} className="record-entry-row">
                      <div className="record-entry-main">
                        <div className="record-entry-inputs">
                          <ThemedDropdown
                            value={r.type || 'DATE'}
                            options={WATCH_TYPES}
                            onChange={(v) => updateRecord(r.id, { type: v as WatchRecordType })}
                            className="record-type-dropdown"
                          />

                          {showDates && (
                            <>
                              <ThemedDropdown
                                value={String(r.year || '')}
                                options={yearOptions}
                                onChange={(v) => updateRecord(r.id, { year: parseInt(v, 10) || undefined })}
                                placeholder="Year"
                                className="record-date-dropdown record-year-dropdown"
                              />

                              <ThemedDropdown
                                value={String(r.month || '')}
                                options={getMonthOptionsForRecord(String(r.year || ''))}
                                onChange={(v) => updateRecord(r.id, { month: parseInt(v, 10) || undefined })}
                                placeholder="Month"
                                className="record-date-dropdown"
                              />

                              <ThemedDropdown
                                value={String(r.day || '')}
                                options={getDayOptionsForRecord(String(r.year || ''), String(r.month || ''))}
                                onChange={(v) => updateRecord(r.id, { day: parseInt(v, 10) || undefined })}
                                placeholder="Day"
                                className="record-date-dropdown"
                              />
                            </>
                          )}

                          {isRange && (
                            <>
                              <span className="range-sep">to</span>
                              <ThemedDropdown
                                value={String(r.endYear || '')}
                                options={yearOptions}
                                onChange={(v) => updateRecord(r.id, { endYear: parseInt(v, 10) || undefined })}
                                placeholder="Year"
                                className="record-date-dropdown record-year-dropdown"
                              />
                              <ThemedDropdown
                                value={String(r.endMonth || '')}
                                options={getMonthOptionsForRecord(String(r.endYear || ''))}
                                onChange={(v) => updateRecord(r.id, { endMonth: parseInt(v, 10) || undefined })}
                                placeholder="Month"
                                className="record-date-dropdown"
                              />
                              <ThemedDropdown
                                value={String(r.endDay || '')}
                                options={getDayOptionsForRecord(String(r.endYear || ''), String(r.endMonth || ''))}
                                onChange={(v) => updateRecord(r.id, { endDay: parseInt(v, 10) || undefined })}
                                placeholder="Day"
                                className="record-date-dropdown"
                              />
                            </>
                          )}
                        </div>

                        {(r.type === 'DATE' || r.type === 'DNF' || r.type === 'CURRENT') && (
                          <div className="record-entry-presets">
                            <ThemedDropdown
                              value=""
                              options={[
                                ...DATE_PRESET_OPTIONS,
                                { value: 'reset', label: 'Reset' }
                              ]}
                              triggerLabel="P"
                              showOnHover={true}
                              onChange={(v) => applyPreset(r.id, v as DatePreset | 'reset')}
                              className="record-preset-dropdown"
                            />
                          </div>
                        )}

                      </div>
                      {isDnfOrCurrent && (
                        <div className="record-entry-inline-extra">
                          <label className="record-extra-slider">
                            <span className="record-slider-label">{getWatchProgressLabel(r)}</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={r.dnfPercent ?? 50}
                              onChange={(e) => updateRecord(r.id, { dnfPercent: Number(e.target.value) })}
                            />
                          </label>
                        </div>
                      )}
                      {(records.length > 1 || onRemoveEntry) && (
                        <button type="button" className="record-entry-delete" onClick={() => removeRecord(r.id)}>✕</button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button type="button" className="record-add-entry-btn" onClick={addRecord}>
                + Add another watch
              </button>
            </div>
          )}

          {/* RIGHT COLUMN */}
          <div className="record-modal-right">
            <header className="record-modal-right-header">
              {showClassPicker && (
                <span className="record-modal-class-picker-label">Ranked class — place top, middle, bottom</span>
              )}
              <button type="button" className="record-modal-close-icon" onClick={onClose}>✕</button>
            </header>

            <div className="record-modal-class-list">
              {rankedClasses.map((c) => (
                <div
                  key={c.key}
                  className={`record-modal-class-row ${recordClassKey === c.key ? 'record-modal-class-row--selected' : ''}`}
                >
                  <div className="record-modal-class-info">
                    <span className="record-modal-class-label-text">{c.label}</span>
                    {c.tagline && <span className="record-modal-class-tagline-text">{c.tagline}</span>}
                  </div>
                  <div className="record-modal-class-actions">
                    <button
                      type="button"
                      className={`record-modal-placement-btn ${recordClassKey === c.key && recordPosition === 'top' ? 'record-modal-placement-btn--active' : ''}`}
                      onClick={() => { setRecordClassKey(c.key); setRecordPosition('top'); }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className={`record-modal-placement-btn record-modal-placement-btn--dot ${recordClassKey === c.key && recordPosition === 'middle' ? 'record-modal-placement-btn--active' : ''}`}
                      onClick={() => { setRecordClassKey(c.key); setRecordPosition('middle'); }}
                    >
                      •
                    </button>
                    <button
                      type="button"
                      className={`record-modal-placement-btn ${recordClassKey === c.key && recordPosition === 'bottom' ? 'record-modal-placement-btn--active' : ''}`}
                      onClick={() => { setRecordClassKey(c.key); setRecordPosition('bottom'); }}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {error && <div className="record-modal-error">{error}</div>}

            <footer className="record-modal-footer">
              <div className="record-modal-footer-main">
                <button
                  type="button"
                  className={`record-modal-save-btn ${showClassPicker ? 'record-modal-save-btn--secondary' : ''}`}
                  onClick={() => void handleSave(false)}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving…' : 'Save and close'}
                </button>
                {showClassPicker && (
                  <button
                    type="button"
                    className="record-modal-save-btn"
                    onClick={() => void handleSave(true)}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving…' : primaryButtonLabel ?? (target.media_type === 'person' ? 'Add to list and go' : target.media_type === 'tv' ? 'Save and go to show' : 'Save and go to movie')}
                  </button>
                )}
                {target.media_type !== 'person' && (
                  <button
                    type="button"
                    className="record-modal-save-btn record-modal-secondary-btn"
                    onClick={() => void handleSave(false)}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving…' : 'Save and close'}
                  </button>
                )}
              </div>


              {onRemoveEntry && (
                <button
                  type="button"
                  className={`record-modal-remove-all-btn ${removeClickCount === 1 ? 'record-modal-remove-all-btn--confirm' : ''}`}
                  onClick={() => {
                    if (removeClickCount === 1) {
                      onRemoveEntry(target.stringId || String(target.id));
                      onClose();
                    } else {
                      setRemoveClickCount(1);
                    }
                  }}
                >
                  {removeClickCount === 1 ? 'Double click to remove' : 'Remove from list'}
                </button>
              )}
            </footer>
          </div>

          {!showClassPicker && (
            <button type="button" className="record-modal-close-icon record-modal-close-icon-abs" onClick={onClose}>✕</button>
          )}
        </div>
      </div>
    </div >
  );
}
