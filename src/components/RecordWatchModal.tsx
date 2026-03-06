import { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { WatchRecord, WatchRecordType } from './EntryRowMovieShow';
import { ThemedDropdown, type ThemedDropdownOption } from './ThemedDropdown';
import { getYearOptions, MONTH_OPTIONS, DAY_OPTIONS, applyDatePreset } from '../lib/dateDropdowns';
import './RecordWatchModal.css';

const WATCH_TYPES: ThemedDropdownOption<WatchRecordType>[] = [
  { value: 'DATE', label: 'Watch date' },
  { value: 'RANGE', label: 'Start / end date' },
  { value: 'DNF', label: 'DNF' },
  { value: 'CURRENT', label: 'Currently watching' },
  { value: 'LONG_AGO', label: 'Long ago' },
  { value: 'UNKNOWN', label: 'Unknown' }
];

export type RecordWatchTarget = {
  id: number;
  title: string;
  poster_path?: string;
  media_type: 'movie' | 'tv';
  subtitle?: string;
};

export type RecordWatchSaveParams = {
  watch: WatchRecord;
  classKey?: string;
  position?: 'top' | 'middle' | 'bottom';
};

type Props = {
  target: RecordWatchTarget;
  rankedClasses: { key: string; label: string; tagline?: string }[];
  showClassPicker: boolean;
  onSave: (params: RecordWatchSaveParams, goToMovie: boolean) => void | Promise<void>;
  onClose: () => void;
  isSaving: boolean;
  /** e.g. "Save and go to movie" */
  primaryButtonLabel?: string;
};

export function RecordWatchModal({
  target,
  rankedClasses,
  showClassPicker,
  onSave,
  onClose,
  isSaving,
  primaryButtonLabel
}: Props) {
  const [recordType, setRecordType] = useState<WatchRecordType>('DATE');
  const [recordYear, setRecordYear] = useState('');
  const [recordMonth, setRecordMonth] = useState('');
  const [recordDay, setRecordDay] = useState('');
  const [recordEndYear, setRecordEndYear] = useState('');
  const [recordEndMonth, setRecordEndMonth] = useState('');
  const [recordEndDay, setRecordEndDay] = useState('');
  const [recordDnfPercent, setRecordDnfPercent] = useState(50);
  const [recordClassKey, setRecordClassKey] = useState('');
  const [recordPosition, setRecordPosition] = useState<'top' | 'middle' | 'bottom'>('top');
  const [error, setError] = useState<string | null>(null);

  const releaseYear = useMemo(() => {
    const s = target.subtitle?.trim();
    if (s && /^\d{4}$/.test(s)) return parseInt(s, 10);
    return undefined;
  }, [target.subtitle]);

  const yearOptions = useMemo(() => getYearOptions(releaseYear), [releaseYear]);

  const applyPreset = (preset: 'today' | 'yesterday' | 'this_year') => {
    const { year, month, day } = applyDatePreset(preset);
    setRecordYear(year);
    setRecordMonth(month);
    setRecordDay(day);
    if (recordType === 'RANGE') {
      setRecordEndYear(year);
      setRecordEndMonth(month);
      setRecordEndDay(day);
    }
  };

  function buildWatchRecord(): WatchRecord | null {
    if (recordType === 'DNF' || recordType === 'CURRENT') {
      const yearNum = Number(recordYear);
      if (!yearNum || Number.isNaN(yearNum)) return null;
      const monthNum = recordMonth ? Number(recordMonth) : undefined;
      const dayNum = recordDay ? Number(recordDay) : undefined;
      if (monthNum !== undefined && (monthNum < 1 || monthNum > 12)) return null;
      if (dayNum !== undefined && (dayNum < 1 || dayNum > 31)) return null;
      return {
        id: crypto.randomUUID(),
        type: recordType,
        year: yearNum,
        month: monthNum,
        day: dayNum,
        dnfPercent: Math.min(100, Math.max(0, recordDnfPercent))
      };
    }
    if (recordType === 'LONG_AGO' || recordType === 'UNKNOWN') {
      return { id: crypto.randomUUID(), type: recordType };
    }
    const yearNum = Number(recordYear);
    if (!yearNum || Number.isNaN(yearNum)) return null;
    if (recordType === 'DATE') {
      const monthNum = recordMonth ? Number(recordMonth) : undefined;
      const dayNum = recordDay ? Number(recordDay) : undefined;
      if (monthNum !== undefined && (monthNum < 1 || monthNum > 12)) return null;
      if (dayNum !== undefined && (dayNum < 1 || dayNum > 31)) return null;
      return {
        id: crypto.randomUUID(),
        type: 'DATE',
        year: yearNum,
        month: monthNum,
        day: dayNum
      };
    }
    const endYearNum = recordEndYear ? Number(recordEndYear) : undefined;
    const monthNum = recordMonth ? Number(recordMonth) : undefined;
    const dayNum = recordDay ? Number(recordDay) : undefined;
    const endMonthNum = recordEndMonth ? Number(recordEndMonth) : undefined;
    const endDayNum = recordEndDay ? Number(recordEndDay) : undefined;
    if (monthNum !== undefined && (monthNum < 1 || monthNum > 12)) return null;
    if (dayNum !== undefined && (dayNum < 1 || dayNum > 31)) return null;
    if (endMonthNum !== undefined && (endMonthNum < 1 || endMonthNum > 12)) return null;
    if (endDayNum !== undefined && (endDayNum < 1 || endDayNum > 31)) return null;
    return {
      id: crypto.randomUUID(),
      type: 'RANGE',
      year: yearNum,
      month: monthNum,
      day: dayNum,
      endYear: endYearNum,
      endMonth: endMonthNum,
      endDay: endDayNum
    };
  }

  const handleSave = async (goToMovie: boolean) => {
    setError(null);
    if (recordType === 'DATE' || recordType === 'RANGE') {
      const yearNum = Number(recordYear);
      if (!yearNum || Number.isNaN(yearNum)) {
        setError('Please enter at least a year for this type.');
        return;
      }
    }
    if (recordType === 'DNF' || recordType === 'CURRENT') {
      const yearNum = Number(recordYear);
      if (!yearNum || Number.isNaN(yearNum)) {
        setError('Please enter a start year for this type.');
        return;
      }
    }
    const watch = buildWatchRecord();
    if (!watch) {
      setError('Invalid date fields.');
      return;
    }
    if (showClassPicker && (!recordClassKey || !rankedClasses.some((c) => c.key === recordClassKey))) {
      setError('Pick a ranked class (click ↑ or ↓ next to a class).');
      return;
    }
    await onSave(
      {
        watch,
        classKey: recordClassKey || undefined,
        position: recordClassKey ? recordPosition : undefined
      },
      goToMovie
    );
    setError(null);
    onClose();
  };

  const needsDate = recordType === 'DATE' || recordType === 'RANGE' || recordType === 'DNF' || recordType === 'CURRENT';

  return (
    <div className="record-modal-backdrop" onClick={onClose}>
      <div className="record-modal" onClick={(e) => e.stopPropagation()}>
        <header className="record-modal-header">
          <h2>Record watch</h2>
          <button
            type="button"
            className="record-modal-close"
            onClick={onClose}
            aria-label="Close record watch"
          >
            ✕
          </button>
        </header>
        <p className="record-modal-title">{target.title}</p>

        <div className="record-modal-fields">
          <div className="record-modal-field-row">
            <label className="record-modal-class-label">
              <span>Type</span>
              <ThemedDropdown
                value={recordType}
                options={WATCH_TYPES}
                onChange={(v) => setRecordType(v as WatchRecordType)}
                aria-label="Watch type"
              />
            </label>
          </div>

          {needsDate && (
            <div className="record-modal-field-row record-modal-date-presets">
              <span className="record-modal-presets-label">Presets</span>
              <div className="record-modal-presets">
                <button type="button" className="record-modal-preset-btn" onClick={() => applyPreset('today')}>
                  Today
                </button>
                <button type="button" className="record-modal-preset-btn" onClick={() => applyPreset('yesterday')}>
                  Yesterday
                </button>
                <button type="button" className="record-modal-preset-btn" onClick={() => applyPreset('this_year')}>
                  This year
                </button>
              </div>
            </div>
          )}

          {(recordType === 'DATE' || recordType === 'RANGE') && (
            <div className="record-modal-field-row">
              <label>
                <span>{recordType === 'RANGE' ? 'Start year*' : 'Year*'}</span>
                <ThemedDropdown
                  value={recordYear}
                  options={yearOptions}
                  onChange={setRecordYear}
                  placeholder="Year"
                />
              </label>
              <label>
                <span>Month</span>
                <ThemedDropdown value={recordMonth} options={MONTH_OPTIONS} onChange={setRecordMonth} placeholder="—" />
              </label>
              <label>
                <span>Day</span>
                <ThemedDropdown value={recordDay} options={DAY_OPTIONS} onChange={setRecordDay} placeholder="—" />
              </label>
            </div>
          )}

          {recordType === 'RANGE' && (
            <div className="record-modal-field-row">
              <label>
                <span>End year</span>
                <ThemedDropdown
                  value={recordEndYear}
                  options={yearOptions}
                  onChange={setRecordEndYear}
                  placeholder="—"
                />
              </label>
              <label>
                <span>Month</span>
                <ThemedDropdown
                  value={recordEndMonth}
                  options={MONTH_OPTIONS}
                  onChange={setRecordEndMonth}
                  placeholder="—"
                />
              </label>
              <label>
                <span>Day</span>
                <ThemedDropdown
                  value={recordEndDay}
                  options={DAY_OPTIONS}
                  onChange={setRecordEndDay}
                  placeholder="—"
                />
              </label>
            </div>
          )}

          {(recordType === 'DNF' || recordType === 'CURRENT') && (
            <>
              <div className="record-modal-field-row">
                <label>
                  <span>Started year*</span>
                  <ThemedDropdown
                    value={recordYear}
                    options={yearOptions}
                    onChange={setRecordYear}
                    placeholder="Year"
                  />
                </label>
                <label>
                  <span>Month</span>
                  <ThemedDropdown value={recordMonth} options={MONTH_OPTIONS} onChange={setRecordMonth} placeholder="—" />
                </label>
                <label>
                  <span>Day</span>
                  <ThemedDropdown value={recordDay} options={DAY_OPTIONS} onChange={setRecordDay} placeholder="—" />
                </label>
              </div>
              <div className="record-modal-field-row">
                <label className="record-modal-field-slider">
                  <span>
                    {recordType === 'DNF' ? 'Got through' : 'Current progress'}: {recordDnfPercent}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={recordDnfPercent}
                    onChange={(e) => setRecordDnfPercent(Number(e.target.value))}
                  />
                </label>
              </div>
            </>
          )}

          {showClassPicker && rankedClasses.length > 0 && (
            <div className="record-modal-field-row record-modal-class-picker">
              <span className="record-modal-class-picker-label">Ranked class — place top, middle, bottom</span>
              <div className="record-modal-class-list">
                {rankedClasses.map((c) => (
                  <div
                    key={c.key}
                    className={`record-modal-class-row ${recordClassKey === c.key ? 'record-modal-class-row--selected' : ''}`}
                  >
                    <div className="record-modal-class-name-wrap">
                      <span className="record-modal-class-name">{c.label}</span>
                      {c.tagline && <span className="record-modal-class-tagline">{c.tagline}</span>}
                    </div>
                    <div className="record-modal-class-arrows">
                      <button
                        type="button"
                        className={`record-modal-class-arrow ${recordClassKey === c.key && recordPosition === 'top' ? 'record-modal-class-arrow--active' : ''}`}
                        title="Add to top of this class"
                        onClick={() => {
                          setRecordClassKey(c.key);
                          setRecordPosition('top');
                        }}
                      >
                        <ArrowUp size={15} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={`record-modal-class-arrow record-modal-class-arrow--dot ${recordClassKey === c.key && recordPosition === 'middle' ? 'record-modal-class-arrow--active' : ''}`}
                        title="Add roughly to the middle of this class"
                        onClick={() => {
                          setRecordClassKey(c.key);
                          setRecordPosition('middle');
                        }}
                      >
                        •
                      </button>
                      <button
                        type="button"
                        className={`record-modal-class-arrow ${recordClassKey === c.key && recordPosition === 'bottom' ? 'record-modal-class-arrow--active' : ''}`}
                        title="Add to bottom of this class"
                        onClick={() => {
                          setRecordClassKey(c.key);
                          setRecordPosition('bottom');
                        }}
                      >
                        <ArrowDown size={15} aria-hidden />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <div className="record-modal-error">{error}</div>}

        <footer className="record-modal-footer">
          <button
            type="button"
            className="record-modal-btn record-modal-btn-secondary"
            onClick={() => void handleSave(false)}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save and close'}
          </button>
          <button
            type="button"
            className="record-modal-btn"
            onClick={() => void handleSave(true)}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : primaryButtonLabel ?? (target.media_type === 'tv' ? 'Save and go to show' : 'Save and go to movie')}
          </button>
        </footer>
      </div>
    </div>
  );
}
