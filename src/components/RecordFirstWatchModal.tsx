import { useMemo, useState } from 'react';
import type { ClassKey } from './RankedList';
import type { MovieShowItem, WatchRecord, WatchRecordType } from './EntryRowMovieShow';
import './RecordFirstWatchModal.css';

const WATCH_TYPES: { value: WatchRecordType; label: string }[] = [
  { value: 'DATE', label: 'Watch date' },
  { value: 'RANGE', label: 'Start / end date' },
  { value: 'DNF', label: 'DNF' },
  { value: 'CURRENT', label: 'Currently watching' },
  { value: 'LONG_AGO', label: 'Long ago' },
  { value: 'UNKNOWN', label: 'Unknown' }
];

type Props = {
  item: MovieShowItem;
  rankedClasses: Array<{ key: ClassKey; label: string }>;
  onClose: () => void;
  onConfirm: (watch: WatchRecord, toClassKey: ClassKey) => Promise<void> | void;
};

export function RecordFirstWatchModal({ item, rankedClasses, onClose, onConfirm }: Props) {
  const [recordType, setRecordType] = useState<WatchRecordType>('DATE');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [endYear, setEndYear] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [endDay, setEndDay] = useState('');
  const [dnfPercent, setDnfPercent] = useState(50);
  const [toClassKey, setToClassKey] = useState<ClassKey>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canPickClass = useMemo(() => rankedClasses.length > 0, [rankedClasses.length]);

  const buildWatch = (): WatchRecord | null => {
    if (recordType === 'LONG_AGO' || recordType === 'UNKNOWN') {
      return { id: crypto.randomUUID(), type: recordType };
    }
    const y = Number(year);
    if (!y || Number.isNaN(y)) return null;
    const m = month ? Number(month) : undefined;
    const d = day ? Number(day) : undefined;
    if (m !== undefined && (m < 1 || m > 12)) return null;
    if (d !== undefined && (d < 1 || d > 31)) return null;

    if (recordType === 'DATE') {
      return { id: crypto.randomUUID(), type: 'DATE', year: y, month: m, day: d };
    }
    if (recordType === 'DNF' || recordType === 'CURRENT') {
      return {
        id: crypto.randomUUID(),
        type: recordType,
        year: y,
        month: m,
        day: d,
        dnfPercent: Math.min(100, Math.max(0, dnfPercent))
      };
    }
    // RANGE
    const ey = endYear ? Number(endYear) : undefined;
    const em = endMonth ? Number(endMonth) : undefined;
    const ed = endDay ? Number(endDay) : undefined;
    if (em !== undefined && (em < 1 || em > 12)) return null;
    if (ed !== undefined && (ed < 1 || ed > 31)) return null;
    return {
      id: crypto.randomUUID(),
      type: 'RANGE',
      year: y,
      month: m,
      day: d,
      endYear: ey,
      endMonth: em,
      endDay: ed
    };
  };

  const handleSave = async () => {
    setError(null);
    if (!toClassKey) {
      setError('Pick a ranked class to place this entry into.');
      return;
    }
    const watch = buildWatch();
    if (!watch) {
      setError('Invalid date fields.');
      return;
    }
    setSaving(true);
    await onConfirm(watch, toClassKey);
    setSaving(false);
    onClose();
  };

  return (
    <div className="record-modal-backdrop" onClick={onClose}>
      <div className="record-modal" onClick={(e) => e.stopPropagation()}>
        <header className="record-modal-header">
          <h2>Record first watch</h2>
          <button type="button" className="record-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className="record-modal-title">{item.title}</p>

        <div className="record-modal-fields">
          <div className="record-modal-field-row">
            <label className="record-modal-class-label">
              <span>Type</span>
              <select value={recordType} onChange={(e) => setRecordType(e.target.value as WatchRecordType)}>
                {WATCH_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {(recordType === 'DATE' || recordType === 'RANGE') && (
            <div className="record-modal-field-row">
              <label>
                <span>{recordType === 'RANGE' ? 'Start year*' : 'Year*'}</span>
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2024" />
              </label>
              <label>
                <span>Month</span>
                <input type="number" value={month} onChange={(e) => setMonth(e.target.value)} placeholder="—" min={1} max={12} />
              </label>
              <label>
                <span>Day</span>
                <input type="number" value={day} onChange={(e) => setDay(e.target.value)} placeholder="—" min={1} max={31} />
              </label>
            </div>
          )}

          {recordType === 'RANGE' && (
            <div className="record-modal-field-row">
              <label>
                <span>End year</span>
                <input type="number" value={endYear} onChange={(e) => setEndYear(e.target.value)} placeholder="—" />
              </label>
              <label>
                <span>Month</span>
                <input type="number" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} placeholder="—" min={1} max={12} />
              </label>
              <label>
                <span>Day</span>
                <input type="number" value={endDay} onChange={(e) => setEndDay(e.target.value)} placeholder="—" min={1} max={31} />
              </label>
            </div>
          )}

          {(recordType === 'DNF' || recordType === 'CURRENT') && (
            <>
              <div className="record-modal-field-row">
                <label>
                  <span>Started year*</span>
                  <input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2024" />
                </label>
                <label>
                  <span>Month</span>
                  <input type="number" value={month} onChange={(e) => setMonth(e.target.value)} placeholder="—" min={1} max={12} />
                </label>
                <label>
                  <span>Day</span>
                  <input type="number" value={day} onChange={(e) => setDay(e.target.value)} placeholder="—" min={1} max={31} />
                </label>
              </div>
              <div className="record-modal-field-row">
                <label className="record-modal-field-slider">
                  <span>{recordType === 'DNF' ? 'Got through' : 'Current progress'}: {dnfPercent}%</span>
                  <input type="range" min={0} max={100} value={dnfPercent} onChange={(e) => setDnfPercent(Number(e.target.value))} />
                </label>
              </div>
            </>
          )}

          {(recordType === 'LONG_AGO' || recordType === 'UNKNOWN') && (
            <p className="record-modal-help">{recordType === 'LONG_AGO' ? 'Long ago' : 'Unknown'}</p>
          )}

          <div className="record-modal-field-row">
            <label className="record-modal-class-label">
              <span>Rank into*</span>
              <select value={toClassKey} onChange={(e) => setToClassKey(e.target.value)}>
                <option value="">Pick a class…</option>
                {rankedClasses.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error && <div className="record-modal-error">{error}</div>}

        <footer className="record-modal-footer">
          <button type="button" className="record-modal-btn" disabled={!canPickClass || saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save and rank'}
          </button>
        </footer>
      </div>
    </div>
  );
}

