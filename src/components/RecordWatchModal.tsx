import { useMemo, useState, useEffect, useRef } from 'react';
import { ArrowUp, ArrowDown, X } from 'lucide-react';
import type { WatchRecord, WatchRecordType } from './EntryRowMovieShow';
import { ThemedDropdown, type ThemedDropdownOption } from './ThemedDropdown';
import {
  getYearOptions,
  MONTH_OPTIONS,
  DAY_OPTIONS,
  applyDatePreset,
  DATE_PRESET_OPTIONS,
  type DatePreset
} from '../lib/dateDropdowns';
import { lockBodyScroll, unlockBodyScroll } from '../lib/bodyScrollLock';
import './RecordWatchModal.css';

/* ─── Constants ─────────────────────────────────────── */

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const WATCH_TYPES: ThemedDropdownOption<WatchRecordType>[] = [
  { value: 'DATE', label: 'Date' },
  { value: 'RANGE', label: 'Range' },
  { value: 'DNF', label: 'DNF' },
  { value: 'DNF_LONG_AGO', label: 'DNF (ago)' },
  { value: 'CURRENT', label: 'Watching' },
  { value: 'LONG_AGO', label: 'Long ago' },
];

/* ─── DatePicker ─────────────────────────────────────── */

interface DPItem { val: number | undefined; label: string }

function DPCol({
  items, selected, onSelect,
}: { items: DPItem[]; selected: number | undefined; onSelect: (v: number | undefined) => void }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-sel="1"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, []);

  return (
    <div className="dp-col" ref={listRef}>
      {items.map((item, i) => (
        <div
          key={i}
          data-sel={item.val === selected ? '1' : undefined}
          className={`dp-item${item.val === selected ? ' dp-item--on' : ''}`}
          onMouseDown={e => { 
            e.preventDefault(); 
            onSelect(item.val); 
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}

interface DatePickerProps {
  year?: number; month?: number; day?: number;
  allYearOpts: ThemedDropdownOption[];
  monthOptsFor: (yearStr: string) => ThemedDropdownOption[];
  dayOptsFor: (yearStr: string, monthStr: string) => ThemedDropdownOption[];
  onChange: (updates: { year?: number; month?: number; day?: number }) => void;
}

function DatePicker({ year, month, day, allYearOpts, monthOptsFor, dayOptsFor, onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    setOpen(p => !p);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const yStr = String(year ?? '');
  const mStr = String(month ?? '');

  const yearItems: DPItem[] = [
    { val: undefined, label: '—' },
    ...allYearOpts.filter(o => o.value).map(o => ({ val: parseInt(o.value, 10), label: o.value })),
  ];
  const monthItems: DPItem[] = [
    { val: undefined, label: '—' },
    ...monthOptsFor(yStr).map(o => ({
      val: o.value ? parseInt(o.value, 10) : undefined,
      label: o.value ? (MONTH_SHORT[parseInt(o.value, 10) - 1] ?? o.label) : o.label,
    })),
  ];
  const dayItems: DPItem[] = [
    { val: undefined, label: '—' },
    ...dayOptsFor(yStr, mStr).map(o => ({ val: o.value ? parseInt(o.value, 10) : undefined, label: o.label })),
  ];

  const yPart = year ? String(year) : '—';
  const mPart = month ? (MONTH_SHORT[month - 1] ?? '—') : '—';
  const dPart = day ? String(day) : '—';

  return (
    <div className="dp-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`dp-trigger${open ? ' dp-trigger--open' : ''}`}
        onClick={handleClick}
        style={{ pointerEvents: 'auto', zIndex: 1 }}
      >
        <span className={year ? 'dp-set' : 'dp-null'}>{yPart}</span>
        <span className="dp-sep">/</span>
        <span className={month ? 'dp-set' : 'dp-null'}>{mPart}</span>
        <span className="dp-sep">/</span>
        <span className={day ? 'dp-set' : 'dp-null'}>{dPart}</span>
      </button>

      {open && (
        <div className="dp-popover" onClick={e => e.stopPropagation()}>
          <DPCol items={yearItems} selected={year} onSelect={v => onChange({ year: v, month, day })} />
          <div className="dp-div" />
          <DPCol items={monthItems} selected={month} onSelect={v => onChange({ year, month: v, day })} />
          <div className="dp-div" />
          <DPCol items={dayItems} selected={day} onSelect={v => onChange({ year, month, day: v })} />
        </div>
      )}
    </div>
  );
}

/* ─── Types ──────────────────────────────────────────── */

export type ModalMode = 'first-watch' | 'edit-watch' | 'person';

export type RecordWatchTarget = {
  id: number; stringId?: string; title: string; poster_path?: string;
  media_type: 'movie' | 'tv' | 'person';
  subtitle?: string; releaseDate?: string;
  runtimeMinutes?: number; totalSeasons?: number; totalEpisodes?: number;
};

export type RecordWatchSaveParams = {
  watches: WatchRecord[]; classKey?: string; position?: 'top' | 'middle' | 'bottom';
};

type Props = {
  target: RecordWatchTarget;
  rankedClasses: { key: string; label: string; tagline?: string; isRanked?: boolean }[];
  mode: ModalMode;
  initialRecords?: WatchRecord[];
  currentClassKey?: string;
  currentClassLabel?: string;
  onSave: (params: RecordWatchSaveParams, goToMovie: boolean) => void | Promise<void>;
  onClose: () => void;
  onRemoveEntry?: (itemId: string) => void;
  isSaving: boolean;
  primaryButtonLabel?: string;
  onAddToUnranked?: () => void | Promise<void>;
  onAddToWatchlist?: () => void;
  onGoPickTemplate?: () => void;
};

/* ─── Main Modal ─────────────────────────────────────── */

export function RecordWatchModal({
  target, rankedClasses, mode, initialRecords,
  currentClassKey, currentClassLabel,
  onSave, onClose, onRemoveEntry, isSaving, primaryButtonLabel, onAddToUnranked, onAddToWatchlist, onGoPickTemplate,
}: Props) {
  const [records, setRecords] = useState<WatchRecord[]>(() => {
    if (initialRecords?.length) {
      return initialRecords.map(r => ({ ...r, id: r.id || crypto.randomUUID() }));
    }
    const today = new Date();
    const defaultRecord = { 
      id: crypto.randomUUID(), 
      type: 'DATE', 
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate()
    } as WatchRecord;
    return [defaultRecord];
  });
  const [recordClassKey, setRecordClassKey] = useState('');
  const [recordPosition, setRecordPosition] = useState<'top' | 'middle' | 'bottom'>('top');
  const [error, setError] = useState<string | null>(null);
  const [removeClickCount, setRemoveClickCount] = useState(0);
  const [overrideClass, setOverrideClass] = useState(false);
  const entriesEndRef = useRef<HTMLDivElement>(null);

  const isPerson = mode === 'person';
  const isSearch = mode === 'first-watch' && !initialRecords?.length;
  const showWatches = mode !== 'person';
  const showClassPicker = mode === 'first-watch' || mode === 'person';
  const isEditWatch = mode === 'edit-watch';

  const rankedPickable = useMemo(
    () => rankedClasses.filter((c) => c.key !== 'UNRANKED'),
    [rankedClasses]
  );

  useEffect(() => {
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, []);

  useEffect(() => {
    if (removeClickCount > 0) {
      const t = setTimeout(() => setRemoveClickCount(0), 3000);
      return () => clearTimeout(t);
    }
  }, [removeClickCount]);

  const addRecord = () => {
    const today = new Date();
    setRecords(prev => [...prev, { 
      id: crypto.randomUUID(), 
      type: 'DATE', 
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate()
    } as WatchRecord]);
    setTimeout(() => entriesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
  };
  const removeRecord = (id: string | number) => {
    if (records.length <= 1 && !onRemoveEntry) return;
    setRecords(prev => prev.filter(r => String(r.id) !== String(id)));
  };
  const updateRecord = (id: string, updates: Partial<WatchRecord>) =>
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));

  const { releaseYear, releaseMonth, releaseDay } = useMemo(() => {
    const rd = target.releaseDate;
    if (rd && /^\d{4}-\d{2}-\d{2}$/.test(rd)) {
      const [y, m, d] = rd.split('-').map(Number);
      return { releaseYear: y, releaseMonth: m, releaseDay: d };
    }
    const s = target.subtitle?.trim();
    if (s && /^\d{4}$/.test(s)) return { releaseYear: +s, releaseMonth: undefined, releaseDay: undefined };
    return { releaseYear: undefined, releaseMonth: undefined, releaseDay: undefined };
  }, [target.releaseDate, target.subtitle]);

  const yearOptions = useMemo(() => getYearOptions(releaseYear), [releaseYear]);

  const monthOptsFor = (yearStr: string): ThemedDropdownOption[] => {
    const y = parseInt(yearStr, 10);
    const today = new Date();
    const currentYear = today.getFullYear();
    
    // If no year selected, only show empty option
    if (!y) {
      return [{ value: '', label: '—' }];
    }
    
    // Don't allow years before release year
    if (releaseYear && y < releaseYear) {
      return [{ value: '', label: '—' }];
    }
    
    // Don't allow future years
    if (y > currentYear) {
      return [{ value: '', label: '—' }];
    }
    
    // For any valid year (past or current), show all months
    return MONTH_OPTIONS;
  };
  const dayOptsFor = (yearStr: string, monthStr: string): ThemedDropdownOption[] => {
    const y = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();
    
    // If no year or month selected, only show empty option
    if (!y || !m) {
      return [{ value: '', label: '—' }];
    }
    
    // Don't allow years before release year
    if (releaseYear && y < releaseYear) {
      return [{ value: '', label: '—' }];
    }
    
    // Don't allow future years
    if (y > currentYear) {
      return [{ value: '', label: '—' }];
    }
    
    // For any valid year (past or current), show all days
    return DAY_OPTIONS;
  };

  const applyPreset = (id: string, preset: DatePreset | 'reset') => {
    if (preset === 'reset') { updateRecord(id, { year: undefined, month: undefined, day: undefined }); return; }
    const { year, month, day } = applyDatePreset(preset);
    updateRecord(id, {
      year: parseInt(year, 10) || undefined,
      month: parseInt(month, 10) || undefined,
      day: parseInt(day, 10) || undefined,
    });
  };

  const clamp = (n: number) => Math.min(100, Math.max(0, n));

  function buildWatchRecord(r: WatchRecord): WatchRecord | null {
    const { type, year, month, day, endYear, endMonth, endDay, dnfPercent } = r;
    if (type === 'LONG_AGO') return { id: r.id, type: 'LONG_AGO' };
    if (type === 'DNF_LONG_AGO') return { id: r.id, type: 'DNF_LONG_AGO', dnfPercent: clamp(dnfPercent ?? 50) };
    if (type === 'UNKNOWN') return { id: r.id, type: 'UNKNOWN' };
    if ((type === 'DNF' || type === 'CURRENT') && !year) return null;
    if (type === 'DNF' || type === 'CURRENT') return { id: r.id, type, year, month, day, dnfPercent: clamp(dnfPercent ?? 50) };
    if (!year) return null;
    if (type === 'RANGE') return { id: r.id, type: 'RANGE', year, month, day, endYear, endMonth, endDay };
    return { id: r.id, type: 'DATE', year, month, day };
  }

  const getShortProgressLabel = (r: WatchRecord) => {
    const pct = r.dnfPercent ?? 50;
    if (target.media_type === 'movie' && target.runtimeMinutes) {
      const mins = Math.round((pct / 100) * target.runtimeMinutes);
      const h = Math.floor(mins / 60), m = mins % 60;
      return h > 0 ? `${h}h${m}m` : `${m}m`;
    }
    if (target.media_type === 'tv' && target.totalEpisodes) {
      return `Ep ${Math.round((pct / 100) * target.totalEpisodes)}/${target.totalEpisodes}`;
    }
    return `${pct}%`;
  };

  const effectiveClassKey = isEditWatch
    ? (overrideClass ? recordClassKey || undefined : undefined)
    : (recordClassKey || (showClassPicker && rankedPickable.length === 0 ? 'UNRANKED' : undefined));
  const isUnrankedSelected = effectiveClassKey === 'UNRANKED';

  const handleSave = async (goTo: boolean) => {
    setError(null);
    let validatedWatches: WatchRecord[] = [];
    if (showWatches && !isUnrankedSelected) {
      if (records.length === 0) { setError('Add at least one watch record.'); return; }
      const first = records[0];
      if ((first.type === 'DATE' || first.type === 'RANGE' || first.type === 'DNF' || first.type === 'CURRENT') && !first.year) {
        setError('Enter a year for your watch.'); return;
      }
      validatedWatches = records.map(r => buildWatchRecord(r)).filter((r): r is WatchRecord => r !== null);
      if (validatedWatches.length === 0) {
        if (onRemoveEntry) { onRemoveEntry(target.stringId || String(target.id)); onClose(); return; }
        setError('Enter at least one valid watch record.'); return;
      }
    }
    if (showClassPicker && !isUnrankedSelected && rankedPickable.length > 0 && (!recordClassKey || !rankedPickable.some((c) => c.key === recordClassKey))) {
      setError('Pick a class.'); return;
    }
    if (isEditWatch && overrideClass && rankedPickable.length > 0 && (!recordClassKey || !rankedPickable.some((c) => c.key === recordClassKey))) {
      setError('Pick a class, or cancel override.'); return;
    }
    if (isEditWatch && overrideClass && rankedPickable.length === 0) {
      setError('No ranked tiers yet. Pick a template on the main list, or cancel the rank change.'); return;
    }
    await onSave(
      { watches: validatedWatches, classKey: effectiveClassKey, position: (effectiveClassKey && !isUnrankedSelected) ? recordPosition : undefined },
      goTo,
    );
    setError(null);
    onClose();
  };

  const handleRemove = () => {
    if (!onRemoveEntry) return;
    if (removeClickCount === 1) { onRemoveEntry(target.stringId || String(target.id)); onClose(); }
    else setRemoveClickCount(1);
  };

  const PlacementBtns = ({ classKey }: { classKey: string }) => (
    <div className="rwm-placement-btns">
      {(['top', 'middle', 'bottom'] as const).map(pos => (
        <button key={pos} type="button"
          className={`rwm-place-btn${recordClassKey === classKey && recordPosition === pos ? ' rwm-place-btn--on' : ''}`}
          onClick={() => { setRecordClassKey(classKey); setRecordPosition(pos); }}>
          {pos === 'top' ? <ArrowUp size={10} /> : pos === 'bottom' ? <ArrowDown size={10} /> : '•'}
        </button>
      ))}
    </div>
  );

  const ClassList = ({ classes }: { classes: { key: string; label: string; tagline?: string; isRanked?: boolean }[] }) => (
    <div className="rwm-class-list">
      {classes.length === 0 ? (
        <div className="rwm-class-empty">
          <p className="rwm-class-empty-msg">
            No ranked tiers are set up yet. Go pick a template on the main list, or use Add to Unranked.
          </p>
          {onGoPickTemplate ? (
            <button type="button" className="rwm-btn rwm-btn--secondary" onClick={() => onGoPickTemplate()}>
              Go to pick template
            </button>
          ) : null}
        </div>
      ) : (
        classes.map((c) => {
        const selected = recordClassKey === c.key;
        return (
          <div key={c.key} className={`rwm-class-row${selected ? ' rwm-class-row--on' : ''}`}>
            <div className="rwm-class-info">
              <span className="rwm-class-name">{c.label}</span>
              {c.tagline && <span className="rwm-class-tagline">{c.tagline}</span>}
            </div>
            <PlacementBtns classKey={c.key} />
          </div>
        );
        })
      )}
    </div>
  );

  const twoCol = showWatches && (showClassPicker || ((isEditWatch || isPerson) && overrideClass));
  const isRankedItem = currentClassKey && currentClassKey !== 'UNRANKED';

  return (
    <div className="rwm-backdrop" onClick={onClose}>
      <div
        className={`rwm-modal${twoCol ? ' rwm-modal--wide' : ' rwm-modal--compact'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="rwm-header">
          <div className="rwm-header-info">
            <h2 className="rwm-title">{target.title}</h2>
            {target.subtitle && <span className="rwm-subtitle">{target.subtitle}</span>}
          </div>
          <div className="rwm-header-actions">
            {onAddToWatchlist && (
              <button 
                type="button" 
                className="rwm-watchlist-btn" 
                onClick={() => {
                  onAddToWatchlist();
                  onClose();
                }}
                aria-label="Add to watchlist"
              >
                Add to watchlist
              </button>
            )}
            <button type="button" className="rwm-close-btn" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={`rwm-body${twoCol ? ' rwm-body--two-col' : ''}`}>
          {showWatches && (
            <div className="rwm-watch-col">
              <p className="rwm-col-label">watches</p>
              <div className="rwm-entries">
                {records.map(r => {
                  const hasDate = r.type !== 'LONG_AGO' && r.type !== 'DNF_LONG_AGO' && r.type !== 'UNKNOWN';
                  const isRange = r.type === 'RANGE';
                  const hasSlider = r.type === 'DNF' || r.type === 'CURRENT' || r.type === 'DNF_LONG_AGO';
                  const showPreset = r.type === 'DATE' || r.type === 'DNF' || r.type === 'CURRENT';
                  const canDelete = records.length > 1 || !!onRemoveEntry;

                  return (
                    <div key={r.id} className="rwm-entry">
                      {/* Type */}
                      <ThemedDropdown
                        value={r.type || 'DATE'}
                        options={WATCH_TYPES}
                        onChange={v => updateRecord(r.id, { type: v as WatchRecordType })}
                        className="rwm-dd rwm-dd--type"
                      />

                      {/* Start date */}
                      {hasDate && (
                        <DatePicker
                          year={r.year} month={r.month} day={r.day}
                          allYearOpts={yearOptions}
                          monthOptsFor={monthOptsFor}
                          dayOptsFor={dayOptsFor}
                          onChange={u => updateRecord(r.id, u)}
                        />
                      )}

                      {/* Range end date */}
                      {isRange && (
                        <>
                          <span className="rwm-range-arrow">→</span>
                          <DatePicker
                            year={r.endYear} month={r.endMonth} day={r.endDay}
                            allYearOpts={yearOptions}
                            monthOptsFor={monthOptsFor}
                            dayOptsFor={dayOptsFor}
                            onChange={u => updateRecord(r.id, { endYear: u.year, endMonth: u.month, endDay: u.day })}
                          />
                        </>
                      )}

                      {/* Inline slider */}
                      {hasSlider && (
                        <div className="rwm-inline-slider">
                          <span className="rwm-slider-lbl">{getShortProgressLabel(r)}</span>
                          <input
                            type="range" min={0} max={100}
                            value={r.dnfPercent ?? 50}
                            onChange={e => updateRecord(r.id, { dnfPercent: +e.target.value })}
                            className="rwm-slider"
                          />
                        </div>
                      )}

                      {/* Actions */}
                      <div className="rwm-entry-actions">
                        {showPreset && (
                          <ThemedDropdown
                            value=""
                            options={[...DATE_PRESET_OPTIONS, { value: 'reset', label: 'Reset' }]}
                            triggerLabel="preset"
                            showOnHover
                            onChange={v => applyPreset(r.id, v as DatePreset | 'reset')}
                            className="rwm-dd rwm-preset-dd"
                          />
                        )}
                        {canDelete && (
                          <button type="button" className="rwm-entry-del" onClick={() => removeRecord(r.id)} aria-label="Remove">
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={entriesEndRef} />
              </div>
              <button type="button" className="rwm-add-btn" onClick={addRecord}>+ Add watch</button>
            </div>
          )}

          {/* Right Column / Sidebar */}
          {(showClassPicker || ((isEditWatch || isPerson) && overrideClass)) && (
            <div className="rwm-class-col">
              <div className="rwm-class-header">
                <h3 className="rwm-section-title">
                  {isRankedItem ? 'Change rank' : 'Place in class'}
                </h3>
                {!isRankedItem && (
                  <p className="rwm-section-muted">Select a class and placement</p>
                )}
              </div>
              <ClassList classes={rankedPickable} />
            </div>
          )}

          {((isPerson || isEditWatch) && isRankedItem && !overrideClass) && (
            <div className={`rwm-sidebar ${twoCol ? '' : 'rwm-sidebar--compact'}`}>
              <div className="rwm-section-header">
                <h3 className="rwm-section-title">Ranking</h3>
              </div>
              <div className="rwm-keep-row">
                <div className="rwm-keep-info">
                  <span className="rwm-keep-sub">Ranked in</span>
                  <span className="rwm-keep-name">{currentClassLabel}</span>
                </div>
                <button type="button" className="rwm-override-btn" onClick={() => setOverrideClass(true)}>
                  Change
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="rwm-footer">
          {error && <div className="rwm-error">{error}</div>}
          <div className="rwm-footer-inner">
            {onRemoveEntry && (
              <button type="button"
                className={`rwm-remove-btn${removeClickCount === 1 ? ' rwm-remove-btn--confirm' : ''}`}
                onClick={handleRemove}>
                {removeClickCount === 1 ? 'Confirm remove' : 'Remove'}
              </button>
            )}
            <div className="rwm-save-btns">
              <button type="button" className="rwm-btn rwm-btn--secondary"
                onClick={() => void handleSave(false)} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save and close'}
              </button>
              {(!isEditWatch || overrideClass) && (
                <button type="button" className="rwm-btn rwm-btn--primary"
                  onClick={() => void handleSave(true)} disabled={isSaving}>
                  {isSaving ? 'Saving…' : (primaryButtonLabel ?? 'Save and go to')}
                </button>
              )}
              {(onAddToUnranked && (mode === 'person' || mode === 'first-watch')) && (
                <button type="button" className="rwm-btn rwm-btn--ghost"
                  onClick={() => void onAddToUnranked()} disabled={isSaving}>
                  Add to Unranked
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}