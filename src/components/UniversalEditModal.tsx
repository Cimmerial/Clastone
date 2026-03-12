import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ArrowDown, X, Bookmark, BookmarkCheck, Trash2 } from 'lucide-react';
import type { WatchRecord } from './EntryRowMovieShow';
import { ThemedDropdown, type ThemedDropdownOption } from './ThemedDropdown';
import {
  getYearOptions,
  MONTH_OPTIONS,
  DAY_OPTIONS,
  applyDatePreset,
  DATE_PRESET_OPTIONS,
  type DatePreset
} from '../lib/dateDropdowns';
import './UniversalEditModal.css';

/* ─── Types ──────────────────────────────────────────── */

export type MediaType = 'movie' | 'tv';

export type WatchMatrixType = 'SINGLE_DATE' | 'DATE_RANGE' | 'LONG_AGO';
export type WatchDetailStatus = 'NONE' | 'WATCHING' | 'DNF';

export interface WatchMatrixEntry {
  id: string;
  watchType: WatchMatrixType;
  // For SINGLE_DATE: start date. For DATE_RANGE: start date.
  year?: number;
  month?: number;
  day?: number;
  // For DATE_RANGE only: end date
  endYear?: number;
  endMonth?: number;
  endDay?: number;
  // Watch amount (0-100)
  watchPercent: number;
  // Watch details toggle
  watchStatus: WatchDetailStatus;
}

export type UniversalEditTarget = {
  id: string;
  tmdbId?: number;
  title: string;
  posterPath?: string;
  mediaType: MediaType;
  subtitle?: string;
  releaseDate?: string;
  runtimeMinutes?: number;
  totalSeasons?: number;
  totalEpisodes?: number;
  // For existing entries
  existingClassKey?: string;
  watchlistStatus?: 'not_in_watchlist' | 'in_watchlist';
};

export type UniversalEditSaveParams = {
  watches: WatchMatrixEntry[];
  classKey?: string;
  position?: 'top' | 'middle' | 'bottom';
};

type Props = {
  target: UniversalEditTarget;
  rankedClasses: { key: string; label: string; tagline?: string; isRanked?: boolean }[];
  initialWatches?: WatchRecord[];  // Accept old format
  currentClassKey?: string;
  currentClassLabel?: string;
  isWatchlistItem?: boolean;
  onSave: (params: UniversalEditSaveParams, goToMedia: boolean) => void | Promise<void>;
  onClose: () => void;
  onRemoveEntry?: (itemId: string) => void;
  onAddToWatchlist?: () => void;
  onRemoveFromWatchlist?: () => void;
  onGoToWatchlist?: () => void;
  isSaving: boolean;
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const WATCH_TYPE_OPTIONS: ThemedDropdownOption<WatchMatrixType>[] = [
  { value: 'SINGLE_DATE', label: 'Single Date' },
  { value: 'DATE_RANGE', label: 'Date Range' },
  { value: 'LONG_AGO', label: 'Long Ago' },
];

/* ─── DatePicker Component ──────────────────────────── */

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
    <div className="uem-dp-col" ref={listRef}>
      {items.map((item, i) => (
        <div
          key={i}
          data-sel={item.val === selected ? '1' : undefined}
          className={`uem-dp-item${item.val === selected ? ' uem-dp-item--on' : ''}`}
          onMouseDown={e => { e.preventDefault(); onSelect(item.val); }}
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
  compact?: boolean;
}

function DatePicker({ year, month, day, allYearOpts, monthOptsFor, dayOptsFor, onChange, compact }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    // Calculate position based on trigger element
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopoverPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
      });
    }
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
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
    ...monthOptsFor(yStr).filter(o => o.value).map(o => ({
      val: parseInt(o.value, 10),
      label: MONTH_SHORT[parseInt(o.value, 10) - 1] ?? o.label,
    })),
  ];
  const dayItems: DPItem[] = [
    { val: undefined, label: '—' },
    ...dayOptsFor(yStr, mStr).filter(o => o.value).map(o => ({ val: parseInt(o.value, 10), label: o.value })),
  ];

  const yPart = year ? String(year) : '—';
  const mPart = month ? (MONTH_SHORT[month - 1] ?? '—') : '—';
  const dPart = day ? String(day) : '—';

  return (
    <div className={`uem-dp-wrap ${compact ? 'uem-dp-wrap--compact' : ''}`} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`uem-dp-trigger${open ? ' uem-dp-trigger--open' : ''}`}
        onClick={() => setOpen(p => !p)}
      >
        <span className={year ? 'uem-dp-set' : 'uem-dp-null'}>{yPart}</span>
        <span className="uem-dp-sep">/</span>
        <span className={month ? 'uem-dp-set' : 'uem-dp-null'}>{mPart}</span>
        <span className="uem-dp-sep">/</span>
        <span className={day ? 'uem-dp-set' : 'uem-dp-null'}>{dPart}</span>
      </button>

      {open && popoverPos && createPortal(
        <div 
          className="uem-dp-popover" 
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: popoverPos.top,
            left: popoverPos.left,
            zIndex: 10000,
          }}
        >
          <DPCol items={yearItems} selected={year} onSelect={v => onChange({ year: v, month, day })} />
          <div className="uem-dp-div" />
          <DPCol items={monthItems} selected={month} onSelect={v => onChange({ year, month: v, day })} />
          <div className="uem-dp-div" />
          <DPCol items={dayItems} selected={day} onSelect={v => onChange({ year, month, day: v })} />
        </div>,
        document.body
      )}
    </div>
  );
}

/* ─── Matrix Entry Row ──────────────────────────────── */

interface MatrixRowProps {
  entry: WatchMatrixEntry;
  yearOptions: ThemedDropdownOption[];
  monthOptsFor: (yearStr: string) => ThemedDropdownOption[];
  dayOptsFor: (yearStr: string, monthStr: string) => ThemedDropdownOption[];
  onUpdate: (updates: Partial<WatchMatrixEntry>) => void;
  onRemove: () => void;
  canRemove: boolean;
  runtimeMinutes?: number;
  totalEpisodes?: number;
  totalSeasons?: number;
  mediaType: MediaType;
  applyPreset: (preset: DatePreset | 'reset') => void;
}

function getWatchAmountLabel(percent: number, mediaType: MediaType, runtimeMinutes?: number, totalEpisodes?: number, totalSeasons?: number): string {
  if (mediaType === 'movie' && runtimeMinutes && runtimeMinutes > 0) {
    const mins = Math.round((percent / 100) * runtimeMinutes);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }
  if (mediaType === 'tv' && totalEpisodes && totalEpisodes > 0 && totalSeasons && totalSeasons > 0) {
    const ep = Math.round((percent / 100) * totalEpisodes);
    // Calculate average episodes per season dynamically
    const epsPerSeason = Math.ceil(totalEpisodes / totalSeasons);
    const season = Math.floor((ep - 1) / epsPerSeason) + 1;
    const episodeInSeason = ((ep - 1) % epsPerSeason) + 1;
    if (ep === 0) return `S1 E1`;
    return `S${Math.min(season, totalSeasons)} E${episodeInSeason}`;
  }
  return `${percent}%`;
}

function MatrixRow({
  entry,
  yearOptions,
  monthOptsFor,
  dayOptsFor,
  onUpdate,
  onRemove,
  canRemove,
  runtimeMinutes,
  totalEpisodes,
  totalSeasons,
  mediaType,
  applyPreset,
}: MatrixRowProps) {
  const { watchType, year, month, day, endYear, endMonth, endDay, watchPercent, watchStatus } = entry;
  const [pendingDelete, setPendingDelete] = useState(false);

  const showDate = watchType !== 'LONG_AGO';
  const showEndDate = watchType === 'DATE_RANGE';
  const showSlider = true; // Always show slider
  const showStatusToggle = watchPercent < 100;

  const amountLabel = getWatchAmountLabel(watchPercent, mediaType, runtimeMinutes, totalEpisodes, totalSeasons);

  // Handle double-click delete
  const handleDeleteClick = () => {
    if (pendingDelete) {
      onRemove();
    } else {
      setPendingDelete(true);
      setTimeout(() => setPendingDelete(false), 3000);
    }
  };

  return (
    <div className="uem-matrix-row">
      {/* Watch Type Column */}
      <div className="uem-matrix-cell uem-matrix-cell--type">
        <ThemedDropdown
          value={watchType}
          options={WATCH_TYPE_OPTIONS}
          onChange={v => onUpdate({ watchType: v as WatchMatrixType })}
          className="uem-type-dd"
        />
      </div>

      {/* Watch Time Column - now narrower with preset inside */}
      <div className="uem-matrix-cell uem-matrix-cell--time">
        {watchType === 'LONG_AGO' ? (
          <div className="uem-time-with-preset">
            <span className="uem-time-placeholder">—</span>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <ThemedDropdown
              value=""
              options={[...DATE_PRESET_OPTIONS, { value: 'reset', label: 'Reset' }] as any}
              triggerLabel="preset"
              showOnHover
              onChange={(v: string) => applyPreset(v as DatePreset | 'reset')}
              className="uem-preset-dd"
            />
          </div>
        ) : (
          <div className="uem-time-with-preset">
            <div className="uem-date-group">
              <DatePicker
                year={year} month={month} day={day}
                allYearOpts={yearOptions}
                monthOptsFor={monthOptsFor}
                dayOptsFor={dayOptsFor}
                onChange={u => onUpdate(u)}
                compact
              />
              {showEndDate && (
                <>
                  <span className="uem-range-arrow">→</span>
                  <DatePicker
                    year={endYear} month={endMonth} day={endDay}
                    allYearOpts={yearOptions}
                    monthOptsFor={monthOptsFor}
                    dayOptsFor={dayOptsFor}
                    onChange={u => onUpdate({ endYear: u.year, endMonth: u.month, endDay: u.day })}
                    compact
                  />
                </>
              )}
            </div>
            {showDate && (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <ThemedDropdown
                value=""
                options={[...DATE_PRESET_OPTIONS, { value: 'reset', label: 'Reset' }] as any}
                triggerLabel="preset"
                showOnHover
                onChange={(v: string) => applyPreset(v as DatePreset | 'reset')}
                className="uem-preset-dd"
              />
            )}
          </div>
        )}
      </div>

      {/* Watch Amount Column */}
      <div className="uem-matrix-cell uem-matrix-cell--amount">
        <div className={`uem-amount-display ${watchPercent === 100 ? 'uem-amount-display--complete' : ''}`}>
          {amountLabel}
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={watchPercent}
          onChange={e => onUpdate({ watchPercent: +e.target.value })}
          className={`uem-amount-slider uem-amount-slider--${watchPercent === 100 ? 'complete' : watchStatus === 'DNF' ? 'dnf' : watchStatus === 'WATCHING' ? 'watching' : 'default'}`}
        />
      </div>

      {/* Watch Details Column - wider for "CURRENTLY WATCHING" */}
      <div className="uem-matrix-cell uem-matrix-cell--details">
        {showStatusToggle ? (
          <div className="uem-status-toggle">
            <button
              type="button"
              className={`uem-status-btn uem-status-btn--watching ${watchStatus === 'WATCHING' ? 'uem-status-btn--active' : ''}`}
              onClick={() => onUpdate({ watchStatus: watchStatus === 'WATCHING' ? 'NONE' : 'WATCHING' })}
            >
              Currently Watching
            </button>
            <button
              type="button"
              className={`uem-status-btn uem-status-btn--dnf ${watchStatus === 'DNF' ? 'uem-status-btn--active' : ''}`}
              onClick={() => onUpdate({ watchStatus: watchStatus === 'DNF' ? 'NONE' : 'DNF' })}
            >
              DNF
            </button>
          </div>
        ) : (
          <span className="uem-details-placeholder">—</span>
        )}
      </div>

      {/* Actions - only delete now */}
      <div className="uem-matrix-cell uem-matrix-cell--actions">
        {canRemove && (
          <button 
            type="button" 
            className={`uem-remove-btn ${pendingDelete ? 'uem-remove-btn--confirm' : ''}`} 
            onClick={handleDeleteClick} 
            aria-label={pendingDelete ? 'Click again to confirm delete' : 'Remove'}
            title={pendingDelete ? 'Click again to confirm delete' : 'Double-click to delete'}
          >
            {pendingDelete ? 'Delete?' : <Trash2 size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Main Modal ─────────────────────────────────────── */

export function UniversalEditModal({
  target,
  rankedClasses,
  initialWatches,
  currentClassKey,
  currentClassLabel,
  isWatchlistItem,
  onSave,
  onClose,
  onRemoveEntry,
  onAddToWatchlist,
  onRemoveFromWatchlist,
  onGoToWatchlist,
  isSaving,
}: Props) {
  // Convert WatchRecord[] to WatchMatrixEntry[] for initial state
  const convertRecordsToMatrix = useCallback((records?: WatchRecord[]): WatchMatrixEntry[] => {
    if (!records?.length) {
      const today = new Date();
      return [{
        id: crypto.randomUUID(),
        watchType: 'SINGLE_DATE',
        year: today.getFullYear(),
        month: today.getMonth() + 1,
        day: today.getDate(),
        watchPercent: 100,
        watchStatus: 'NONE',
      }];
    }

    const entries = records.map(r => {
      let watchType: WatchMatrixType = 'SINGLE_DATE';
      if (r.type === 'RANGE') watchType = 'DATE_RANGE';
      else if (r.type === 'LONG_AGO' || r.type === 'DNF_LONG_AGO') watchType = 'LONG_AGO';

      let watchStatus: WatchDetailStatus = 'NONE';
      if (r.type === 'CURRENT') watchStatus = 'WATCHING';
      else if (r.type === 'DNF' || r.type === 'DNF_LONG_AGO') watchStatus = 'DNF';

      return {
        id: r.id || crypto.randomUUID(),
        watchType,
        year: r.year,
        month: r.month,
        day: r.day,
        endYear: r.endYear,
        endMonth: r.endMonth,
        endDay: r.endDay,
        watchPercent: r.dnfPercent ?? 100,
        watchStatus,
      };
    });

    // Sort entries by date (newest at bottom = ascending order by date)
    return entries.sort((a, b) => {
      // Helper to get timestamp from entry
      const getTimestamp = (entry: WatchMatrixEntry): number => {
        if (entry.watchType === 'LONG_AGO') return 0; // Long ago entries go at the top (oldest)
        
        const year = entry.year ?? 0;
        const month = entry.month ?? 1;
        const day = entry.day ?? 1;
        return new Date(year, month - 1, day).getTime();
      };

      return getTimestamp(a) - getTimestamp(b);
    });
  }, []);

  const [entries, setEntries] = useState<WatchMatrixEntry[]>(() => convertRecordsToMatrix(initialWatches));
  const [selectedClassKey, setSelectedClassKey] = useState<string>('');
  const [selectedPosition, setSelectedPosition] = useState<'top' | 'middle' | 'bottom'>('top');
  const [showClassOverride, setShowClassOverride] = useState(false);
  const [removeClickCount, setRemoveClickCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const entriesEndRef = useRef<HTMLDivElement>(null);

  const isRankedItem = currentClassKey && currentClassKey !== 'UNRANKED';
  const hasNeverBeenRanked = !currentClassKey || currentClassKey === 'UNRANKED';

  // Lock body scroll when modal is open
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig || 'unset'; };
  }, []);

  // Reset remove click count after 3 seconds
  useEffect(() => {
    if (removeClickCount > 0) {
      const t = setTimeout(() => setRemoveClickCount(0), 3000);
      return () => clearTimeout(t);
    }
  }, [removeClickCount]);

  const { releaseYear } = useMemo(() => {
    const rd = target.releaseDate;
    if (rd && /^\d{4}-\d{2}-\d{2}$/.test(rd)) {
      const [y] = rd.split('-').map(Number);
      return { releaseYear: y };
    }
    const s = target.subtitle?.trim();
    if (s && /^\d{4}$/.test(s)) return { releaseYear: +s };
    return { releaseYear: undefined };
  }, [target.releaseDate, target.subtitle]);

  const yearOptions = useMemo(() => getYearOptions(releaseYear), [releaseYear]);

  const monthOptsFor = useCallback((yearStr: string): ThemedDropdownOption[] => {
    const y = parseInt(yearStr, 10);
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;

    if (!y || y > currentYear) return [{ value: '', label: '—' }];
    if (y < currentYear) return MONTH_OPTIONS;
    return MONTH_OPTIONS.filter(m => !m.value || parseInt(m.value, 10) <= currentMonth);
  }, []);

  const dayOptsFor = useCallback((yearStr: string, monthStr: string): ThemedDropdownOption[] => {
    const y = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();

    if (!y || !m || y > currentYear) return [{ value: '', label: '—' }];
    if (y < currentYear) return DAY_OPTIONS;
    if (m < currentMonth) return DAY_OPTIONS;
    if (m === currentMonth) return DAY_OPTIONS.filter(d => !d.value || parseInt(d.value, 10) <= currentDay);
    return [{ value: '', label: '—' }];
  }, []);

  const addEntry = () => {
    const today = new Date();
    const newEntry: WatchMatrixEntry = {
      id: crypto.randomUUID(),
      watchType: 'SINGLE_DATE',
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
      watchPercent: 100,
      watchStatus: 'NONE',
    };
    setEntries(prev => [...prev, newEntry]);
    setTimeout(() => entriesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
  };

  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const updateEntry = (id: string, updates: Partial<WatchMatrixEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const applyPresetToEntry = (id: string, preset: DatePreset | 'reset', isDateRange: boolean) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    
    if (preset === 'reset') {
      if (isDateRange) {
        updateEntry(id, { year: undefined, month: undefined, day: undefined, endYear: undefined, endMonth: undefined, endDay: undefined });
      } else {
        updateEntry(id, { year: undefined, month: undefined, day: undefined });
      }
      return;
    }
    
    const { year, month, day } = applyDatePreset(preset);
    const yearNum = parseInt(year, 10) || undefined;
    const monthNum = parseInt(month, 10) || undefined;
    const dayNum = parseInt(day, 10) || undefined;
    
    if (isDateRange) {
      // For date range, set both start and end dates to the preset date
      updateEntry(id, {
        year: yearNum, month: monthNum, day: dayNum,
        endYear: yearNum, endMonth: monthNum, endDay: dayNum,
      });
    } else {
      updateEntry(id, {
        year: yearNum, month: monthNum, day: dayNum,
      });
    }
  };

  const handleRemoveClick = () => {
    if (!onRemoveEntry) return;
    if (removeClickCount === 1) {
      onRemoveEntry(target.id);
      onClose();
    } else {
      setRemoveClickCount(1);
    }
  };

  const validateAndSave = async (goToMedia: boolean) => {
    setError(null);

    // Validate entries
    for (const entry of entries) {
      if (entry.watchType !== 'LONG_AGO' && !entry.year) {
        setError('All entries must have at least a year set.');
        return;
      }
    }

    // Validate class selection if showing override
    if (showClassOverride && (!selectedClassKey || !rankedClasses.some(c => c.key === selectedClassKey))) {
      setError('Please select a class or cancel the class override.');
      return;
    }

    const effectiveClassKey = showClassOverride ? selectedClassKey : undefined;

    await onSave(
      {
        watches: entries,
        classKey: effectiveClassKey,
        position: effectiveClassKey ? selectedPosition : undefined,
      },
      goToMedia,
    );
    onClose();
  };

  const PlacementButtons = ({ classKey }: { classKey: string }) => (
    <div className="uem-placement-btns">
      {(['top', 'middle', 'bottom'] as const).map(pos => (
        <button
          key={pos}
          type="button"
          className={`uem-place-btn${selectedClassKey === classKey && selectedPosition === pos ? ' uem-place-btn--on' : ''}`}
          onClick={() => { setSelectedClassKey(classKey); setSelectedPosition(pos); }}
          title={pos === 'top' ? 'Add to top' : pos === 'bottom' ? 'Add to bottom' : 'Add to middle'}
        >
          {pos === 'top' ? <ArrowUp size={10} /> : pos === 'bottom' ? <ArrowDown size={10} /> : '•'}
        </button>
      ))}
    </div>
  );

  const ClassList = () => (
    <div className="uem-class-list">
      {rankedClasses.filter(c => c.key !== 'UNRANKED').map(c => (
        <div
          key={c.key}
          className={`uem-class-row${selectedClassKey === c.key ? ' uem-class-row--on' : ''}`}
        >
          <div className="uem-class-info">
            <span className="uem-class-name">{c.label}</span>
            {c.tagline && <span className="uem-class-tagline">{c.tagline}</span>}
          </div>
          <PlacementButtons classKey={c.key} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="uem-backdrop" onClick={onClose}>
      <div className="uem-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="uem-header">
          <div className="uem-header-info">
            <h2 className="uem-title">{target.title}</h2>
            {target.subtitle && <span className="uem-subtitle">{target.subtitle}</span>}
          </div>
          <div className="uem-header-actions">
            {/* Watchlist Actions - always show if handlers provided */}
            {isWatchlistItem ? (
              <div className="uem-watchlist-actions">
                <button
                  type="button"
                  className="uem-watchlist-btn uem-watchlist-btn--goto"
                  onClick={() => { onGoToWatchlist?.(); onClose(); }}
                >
                  <BookmarkCheck size={14} />
                  Go to in Watchlist
                </button>
                <button
                  type="button"
                  className="uem-watchlist-btn uem-watchlist-btn--remove"
                  onClick={() => { onRemoveFromWatchlist?.(); }}
                >
                  <Trash2 size={14} />
                  Remove from Watchlist
                </button>
              </div>
            ) : onAddToWatchlist ? (
              <button
                type="button"
                className="uem-watchlist-btn"
                onClick={() => onAddToWatchlist()}
              >
                <Bookmark size={14} />
                Add to Watchlist
              </button>
            ) : null}
            <button type="button" className="uem-close-btn" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="uem-body">
          {/* Watch History Matrix */}
          <div className="uem-watch-section">
            <div className="uem-section-header">
              <h3 className="uem-section-title">Watch History</h3>
              <span className="uem-section-subtitle">Sorted by date, newest at bottom</span>
            </div>

            {/* Matrix Header */}
            <div className="uem-matrix-header">
              <div className="uem-matrix-header-cell uem-matrix-header-cell--type">Watch Type</div>
              <div className="uem-matrix-header-cell uem-matrix-header-cell--time">Watch Time</div>
              <div className="uem-matrix-header-cell uem-matrix-header-cell--amount">Watch Amount</div>
              <div className="uem-matrix-header-cell uem-matrix-header-cell--details">Watch Details</div>
              <div className="uem-matrix-header-cell uem-matrix-header-cell--actions"></div>
            </div>

            {/* Matrix Body */}
            <div className="uem-matrix-body">
              {entries.map((entry, index) => (
                <MatrixRow
                  key={entry.id}
                  entry={entry}
                  yearOptions={yearOptions}
                  monthOptsFor={monthOptsFor}
                  dayOptsFor={dayOptsFor}
                  onUpdate={updates => updateEntry(entry.id, updates)}
                  onRemove={() => removeEntry(entry.id)}
                  canRemove={entries.length > 1}
                  runtimeMinutes={target.runtimeMinutes}
                  totalEpisodes={target.totalEpisodes}
                  totalSeasons={target.totalSeasons}
                  mediaType={target.mediaType}
                  applyPreset={preset => applyPresetToEntry(entry.id, preset, entry.watchType === 'DATE_RANGE')}
                />
              ))}
              <div ref={entriesEndRef} />
            </div>

            <button type="button" className="uem-add-btn" onClick={addEntry}>
              + Add Watch
            </button>
          </div>

          {/* Rank Section */}
          <div className="uem-rank-section">
            <div className="uem-section-header">
              <h3 className="uem-section-title">Ranking</h3>
            </div>

            {isRankedItem && !showClassOverride ? (
              <div className="uem-current-rank">
                <div className="uem-current-rank-info">
                  <span className="uem-current-rank-label">Currently ranked in</span>
                  <span className="uem-current-rank-value">{currentClassLabel}</span>
                </div>
                <button
                  type="button"
                  className="uem-override-btn"
                  onClick={() => setShowClassOverride(true)}
                >
                  Change Rank
                </button>
              </div>
            ) : (
              <div className="uem-rank-selector">
                {isRankedItem && showClassOverride && (
                  <button
                    type="button"
                    className="uem-cancel-override"
                    onClick={() => setShowClassOverride(false)}
                  >
                    Keep current rank
                  </button>
                )}
                <ClassList />
              </div>
            )}
          </div>

          {/* Tagging Section - Placeholder */}
          <div className="uem-tag-section">
            <div className="uem-section-header">
              <h3 className="uem-section-title">Tags</h3>
            </div>
            <div className="uem-tag-placeholder">
              <span>Tagging coming soon</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="uem-footer">
          {error && <div className="uem-error">{error}</div>}
          <div className="uem-footer-inner">
            {onRemoveEntry && (
              <button
                type="button"
                className={`uem-delete-btn${removeClickCount === 1 ? ' uem-delete-btn--confirm' : ''}`}
                onClick={handleRemoveClick}
              >
                {removeClickCount === 1 ? 'Click again to confirm' : 'Remove Entry'}
              </button>
            )}
            <div className="uem-save-btns">
              <button
                type="button"
                className="uem-btn uem-btn--secondary"
                onClick={() => void validateAndSave(false)}
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save and Exit'}
              </button>
              <button
                type="button"
                className="uem-btn uem-btn--primary"
                onClick={() => void validateAndSave(true)}
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save and Go To'}
              </button>
              {hasNeverBeenRanked && (
                <button
                  type="button"
                  className="uem-btn uem-btn--ghost"
                  onClick={() => {
                    onSave({ watches: entries, classKey: 'UNRANKED' }, false);
                    onClose();
                  }}
                  disabled={isSaving}
                >
                  Add as Unranked & Exit
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
