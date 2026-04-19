import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ArrowDown, X, Bookmark, BookmarkCheck, Trash2, Info, UserPlus, Eye } from 'lucide-react';
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
import { tmdbTvDetailsFull } from '../lib/tmdb';
import './UniversalEditModal.css';
import { InfoModal } from './InfoModal';
import { RecommendToFriendModal } from './RecommendToFriendModal';
import { useMobileViewMode } from '../hooks/useMobileViewMode';
import { useNavigate } from 'react-router-dom';

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
  listMemberships?: { listId: string; selected: boolean }[];
};

type Props = {
  target: UniversalEditTarget;
  rankedClasses: { key: string; label: string; tagline?: string; isRanked?: boolean }[];
  initialWatches?: WatchRecord[];  // Accept old format
  currentClassKey?: string;
  currentClassLabel?: string;
  isWatchlistItem?: boolean;
  onSave: (params: UniversalEditSaveParams, goToMedia: boolean) => void | Promise<void>;
  availableTags?: { listId: string; label: string; selected: boolean; href?: string; color?: string }[];
  collectionTags?: { id: string; label: string; href?: string; color?: string }[];
  onTagToggle?: (listId: string, selected: boolean) => void;
  onClose: () => void;
  onRemoveEntry?: (itemId: string) => void;
  onAddToWatchlist?: () => void;
  onRemoveFromWatchlist?: () => void;
  onGoToWatchlist?: () => void;
  /** When there are no ranked tiers, Ranking section links user to pick a template (parent provides navigation). */
  onGoPickTemplate?: () => void;
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
  compact?: boolean;
}

const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(({ year, month, day, allYearOpts, monthOptsFor, dayOptsFor, onChange, compact }, ref) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Forward the external ref to the internal triggerRef
  React.useImperativeHandle(ref, () => triggerRef.current!, []);

  // Stable callback to prevent re-renders from closing the dropdown
  const stableOnChange = useCallback((updates: { year?: number; month?: number; day?: number }) => {
    onChange(updates);
  }, [onChange]);
  
  const handleClick = () => {
    setOpen(p => !p);
  };

  useEffect(() => {
    if (!open) return;
    // Calculate position based on trigger element
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Don't use window.scrollY - getBoundingClientRect already accounts for scroll
      const pos = {
        top: rect.bottom + 4,
        left: rect.left,
      };
      setPopoverPos(pos);
    }
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      const isClickInsideTrigger = wrapRef.current?.contains(target);
      const isClickInsidePopover = popoverRef.current?.contains(target);
      
      if (!isClickInsideTrigger && !isClickInsidePopover) {
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
    ...monthOptsFor(yStr).filter(o => o.value).map(o => ({
      val: parseInt(o.value, 10),
      label: MONTH_SHORT[parseInt(o.value, 10) - 1] ?? o.label,
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
    <div className={`uem-dp-wrap ${compact ? 'uem-dp-wrap--compact' : ''}`} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`uem-dp-trigger${open ? ' uem-dp-trigger--open' : ''}`}
        onClick={handleClick}
        style={{ pointerEvents: 'auto', zIndex: 1 }}
      >
        <span className={year ? 'uem-dp-set' : 'uem-dp-null'}>{yPart}</span>
        <span className="uem-dp-sep">/</span>
        <span className={month ? 'uem-dp-set' : 'uem-dp-null'}>{mPart}</span>
        <span className="uem-dp-sep">/</span>
        <span className={day ? 'uem-dp-set' : 'uem-dp-null'}>{dPart}</span>
      </button>

      {open && popoverPos && createPortal(
        <div 
          key="date-picker-popover"
          ref={popoverRef}
          className="uem-dp-popover" 
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: popoverPos.top,
            left: popoverPos.left,
            zIndex: 10000,
          }}
        >
          <DPCol items={yearItems} selected={year} onSelect={v => stableOnChange({ year: v, month, day })} />
          <div className="uem-dp-div" />
          <DPCol items={monthItems} selected={month} onSelect={v => stableOnChange({ year, month: v, day })} />
          <div className="uem-dp-div" />
          <DPCol items={dayItems} selected={day} onSelect={v => stableOnChange({ year, month, day: v })} />
        </div>,
        document.body
      )}
    </div>
  );
});

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
  seasonEpisodeCounts?: number[];
  mediaType: MediaType;
  applyPreset: (preset: DatePreset | 'reset') => void;
}

function getWatchAmountLabel(
  percent: number,
  mediaType: MediaType,
  runtimeMinutes?: number,
  totalEpisodes?: number,
  totalSeasons?: number,
  seasonEpisodeCounts?: number[]
): string {
  if (mediaType === 'movie' && runtimeMinutes && runtimeMinutes > 0) {
    const mins = Math.round((percent / 100) * runtimeMinutes);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }
  const hasSeasonCounts = !!(seasonEpisodeCounts && seasonEpisodeCounts.length > 0);
  const hasEpisodeTotals = !!(totalEpisodes && totalEpisodes > 0);
  if (mediaType === 'tv' && (hasSeasonCounts || hasEpisodeTotals)) {
    if (percent >= 100) return '100%';

    const effectiveTotalEpisodes =
      hasSeasonCounts
        ? seasonEpisodeCounts.reduce((sum, count) => sum + Math.max(0, count), 0)
        : (totalEpisodes ?? 0);

    const watchedEpisodes = Math.min(
      effectiveTotalEpisodes,
      Math.max(1, Math.floor((percent / 100) * effectiveTotalEpisodes))
    );

    if (hasSeasonCounts) {
      let remaining = watchedEpisodes;
      for (let seasonIndex = 0; seasonIndex < seasonEpisodeCounts.length; seasonIndex += 1) {
        const episodesInSeason = Math.max(1, seasonEpisodeCounts[seasonIndex] || 0);
        if (remaining <= episodesInSeason) {
          return `S${seasonIndex + 1} E${remaining}`;
        }
        remaining -= episodesInSeason;
      }
      const lastSeasonEpisodes = Math.max(1, seasonEpisodeCounts[seasonEpisodeCounts.length - 1] || 1);
      return `S${seasonEpisodeCounts.length} E${lastSeasonEpisodes}`;
    }

    const safeTotalSeasons = Math.max(1, totalSeasons ?? 1);
    const epsPerSeason = Math.max(1, Math.ceil(effectiveTotalEpisodes / safeTotalSeasons));
    const season = Math.floor((watchedEpisodes - 1) / epsPerSeason) + 1;
    const episodeInSeason = ((watchedEpisodes - 1) % epsPerSeason) + 1;
    return `S${Math.min(season, safeTotalSeasons)} E${episodeInSeason}`;
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
  seasonEpisodeCounts,
  mediaType,
  applyPreset,
}: MatrixRowProps) {
  const { watchType, year, month, day, endYear, endMonth, endDay, watchPercent, watchStatus } = entry;
  const [pendingDelete, setPendingDelete] = useState(false);
  const datePickerRef = useRef<HTMLButtonElement>(null);

  const showDate = watchType !== 'LONG_AGO';
  const showEndDate = watchType === 'DATE_RANGE';
  const showSlider = true; // Always show slider
  const showStatusToggle = watchPercent < 100;

  const amountLabel = getWatchAmountLabel(
    watchPercent,
    mediaType,
    runtimeMinutes,
    totalEpisodes,
    totalSeasons,
    seasonEpisodeCounts
  );

  // Handle double-click delete
  const handleDeleteClick = () => {
    if (pendingDelete) {
      onRemove();
    } else {
      setPendingDelete(true);
      setTimeout(() => setPendingDelete(false), 3000);
    }
  };

  // Handle watch type change with auto-open date picker
  const handleWatchTypeChange = (newWatchType: WatchMatrixType) => {
    onUpdate({ watchType: newWatchType });
    
    // If changing to SINGLE_DATE, open the date picker
    if (newWatchType === 'SINGLE_DATE') {
      // Use setTimeout to ensure the DatePicker is rendered before we try to click it
      setTimeout(() => {
        if (datePickerRef.current) {
          datePickerRef.current.click();
        }
      }, 0);
    }
  };

  return (
    <div className="uem-matrix-row">
      {/* Watch Type Column */}
      <div className="uem-matrix-cell uem-matrix-cell--type">
        <ThemedDropdown
          value={watchType}
          options={WATCH_TYPE_OPTIONS}
          onChange={v => handleWatchTypeChange(v as WatchMatrixType)}
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
                ref={datePickerRef}
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
  availableTags = [],
  collectionTags = [],
  onTagToggle,
  onClose,
  onRemoveEntry,
  onAddToWatchlist,
  onRemoveFromWatchlist,
  onGoToWatchlist,
  onGoPickTemplate,
  isSaving,
}: Props) {
  const navigate = useNavigate();
  const { isMobile } = useMobileViewMode();
  const [recommendOpen, setRecommendOpen] = useState(false);
  // Convert WatchRecord[] to WatchMatrixEntry[] for initial state
  const convertRecordsToMatrix = useCallback((records?: WatchRecord[]): WatchMatrixEntry[] => {
    if (!records?.length) {
      // For new items with no watches, return empty array - force user to click "+Add Watch"
      return [];
    }

    const entries = records.map(r => {
      let watchType: WatchMatrixType = 'SINGLE_DATE';
      if (r.type === 'RANGE') watchType = 'DATE_RANGE';
      else if (r.type === 'LONG_AGO' || r.type === 'DNF_LONG_AGO') watchType = 'LONG_AGO';

      let watchStatus: WatchDetailStatus = 'NONE';
      if (r.type === 'CURRENT') watchStatus = 'WATCHING';
      else if (r.type === 'DNF' || r.type === 'DNF_LONG_AGO') watchStatus = 'DNF';

      return {
        id: r.id || crypto.randomUUID(), // Ensure unique ID even if r.id exists
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
  const [tagSelections, setTagSelections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const tag of availableTags) initial[tag.listId] = tag.selected;
    return initial;
  });
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [seasonEpisodeCounts, setSeasonEpisodeCounts] = useState<number[] | undefined>(undefined);
  const entriesEndRef = useRef<HTMLDivElement>(null);

  const isRankedItem = currentClassKey && currentClassKey !== 'UNRANKED';
  const hasNeverBeenRanked = !currentClassKey || currentClassKey === 'UNRANKED';
  const isBrandNewEntry = !currentClassKey;

  const rankedPickable = useMemo(
    () => rankedClasses.filter((c) => c.key !== 'UNRANKED' && c.isRanked !== false),
    [rankedClasses]
  );
  const needsRankPick = hasNeverBeenRanked && rankedPickable.length > 0;

  // Lock body scroll when modal is open (only on desktop)
  useEffect(() => {
    if (isMobile) return; // Don't lock scroll on mobile
    
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig || 'unset'; };
  }, [isMobile]);

  // Reset remove click count after 3 seconds
  useEffect(() => {
    if (removeClickCount > 0) {
      const t = setTimeout(() => setRemoveClickCount(0), 3000);
      return () => clearTimeout(t);
    }
  }, [removeClickCount]);

  useEffect(() => {
    if (target.mediaType !== 'tv' || !target.tmdbId) {
      setSeasonEpisodeCounts(undefined);
      return;
    }

    let cancelled = false;

    void tmdbTvDetailsFull(target.tmdbId)
      .then((details) => {
        if (cancelled) return;
        const counts =
          details?.seasons
            ?.map((season) => season.episodeCount ?? 0)
            .filter((count) => count > 0) ?? [];
        setSeasonEpisodeCounts(counts.length ? counts : undefined);
      })
      .catch(() => {
        if (!cancelled) setSeasonEpisodeCounts(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [target.mediaType, target.tmdbId]);

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

    if (y < currentYear) {
      // For past years, show all months (but respect release month if it's the release year)
      if (y === (releaseYear ?? 0) && target.releaseDate) {
        const releaseMonth = parseInt(target.releaseDate.split('-')[1], 10);
        return MONTH_OPTIONS.filter(m => !m.value || parseInt(m.value, 10) >= releaseMonth);
      }
      return MONTH_OPTIONS;
    }

    // For current year, show months up to current month (but respect release month)
    if (y === currentYear) {
      if (y === (releaseYear ?? 0) && target.releaseDate) {
        const releaseMonth = parseInt(target.releaseDate.split('-')[1], 10);
        return MONTH_OPTIONS.filter(m => !m.value || (parseInt(m.value, 10) >= releaseMonth && parseInt(m.value, 10) <= currentMonth));
      }
      return MONTH_OPTIONS.filter(m => !m.value || parseInt(m.value, 10) <= currentMonth);
    }

    return MONTH_OPTIONS;
  }, [releaseYear, target.releaseDate]);

  const dayOptsFor = useCallback((yearStr: string, monthStr: string): ThemedDropdownOption[] => {
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

    // Get release date bounds
    let minDay = 1;
    let maxDay = 31;
    
    if (y === (releaseYear ?? 0) && target.releaseDate) {
      const releaseMonth = parseInt(target.releaseDate.split('-')[1], 10);
      const releaseDay = parseInt(target.releaseDate.split('-')[2], 10);
      
      if (m === releaseMonth) {
        minDay = releaseDay;
      }
    }
    
    if (y === currentYear && m === currentMonth) {
      maxDay = currentDay;
    }

    return DAY_OPTIONS.filter(d => {
      if (!d.value) return true; // Keep empty option
      const dayNum = parseInt(d.value, 10);
      return dayNum >= minDay && dayNum <= maxDay;
    });
  }, [releaseYear, target.releaseDate]);

  const addEntry = () => {
    // Default new entries to LONG_AGO with 100% watched
    const newEntry: WatchMatrixEntry = {
      id: crypto.randomUUID(),
      watchType: 'LONG_AGO',
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

  const validateAndSave = async (goToMedia: boolean, saveWithoutWatch: boolean = false): Promise<boolean> => {
    setError(null);

    // If saving without watch, automatically add a long ago 100% watch entry
    let finalEntries = entries;
    if (saveWithoutWatch && entries.length === 0) {
      const autoWatchEntry: WatchMatrixEntry = {
        id: crypto.randomUUID(),
        watchType: 'LONG_AGO',
        watchPercent: 100,
        watchStatus: 'NONE',
      };
      finalEntries = [autoWatchEntry];
    }
    // Otherwise, must have at least one watch entry
    else if (entries.length === 0) {
      setError('Please add at least one watch record using the "+ Add Watch" button.');
      return false;
    }

    // Validate entries
    for (const entry of entries) {
      if (entry.watchType !== 'LONG_AGO' && !entry.year) {
        setError('All entries must have at least a year set.');
        return false;
      }
    }

    // Validate class selection
    if (needsRankPick && !selectedClassKey) {
      setError('Please select a ranking class.');
      return false;
    }

    if (showClassOverride) {
      if (rankedPickable.length === 0) {
        setError('No ranked tiers yet. Pick a template on the list page, or keep your current rank.');
        return false;
      }
      if (!selectedClassKey || !rankedPickable.some((c) => c.key === selectedClassKey)) {
        setError('Please select a class or cancel the class override.');
        return false;
      }
    }

    const effectiveClassKey = hasNeverBeenRanked
      ? (rankedPickable.length === 0 ? 'UNRANKED' : selectedClassKey)
      : (showClassOverride ? selectedClassKey : undefined);

    await onSave(
      {
        watches: finalEntries,
        classKey: effectiveClassKey,
        position: effectiveClassKey ? selectedPosition : undefined,
        listMemberships: availableTags.map((tag) => ({ listId: tag.listId, selected: Boolean(tagSelections[tag.listId]) })),
      },
      goToMedia,
    );
    
    // Only close modal if not going to media (let parent handle closing when navigating)
    if (!goToMedia) {
      onClose();
    }
    
    return true;
  };

  const PlacementButtons = ({ classKey }: { classKey: string }) => (
    <div className="uem-placement-btns">
      {(['top', 'middle', 'bottom'] as const).map(pos => (
        <button
          key={pos}
          type="button"
          className={`uem-place-btn${selectedClassKey === classKey && selectedPosition === pos ? ' uem-place-btn--on' : ''}`}
          onClick={(e) => { 
            e.stopPropagation(); 
            setSelectedClassKey(classKey); 
            setSelectedPosition(pos); 
          }}
          title={pos === 'top' ? 'Add to top' : pos === 'bottom' ? 'Add to bottom' : 'Add to middle'}
        >
          {pos === 'top' ? <ArrowUp size={10} /> : pos === 'bottom' ? <ArrowDown size={10} /> : '•'}
        </button>
      ))}
    </div>
  );

  const ClassList = () => (
    <div className="uem-class-list">
      {rankedPickable.length === 0 ? (
        <div className="uem-class-empty">
          <p className="uem-class-empty-msg">
            No ranked tiers are set up yet. Go pick a template on the main list for this type, or save as Unranked.
          </p>
          {onGoPickTemplate ? (
            <button type="button" className="uem-btn uem-btn--secondary" onClick={() => onGoPickTemplate()}>
              Go to pick template
            </button>
          ) : null}
        </div>
      ) : (
        rankedPickable.map((c) => (
        <div
          key={c.key}
          className={`uem-class-row${selectedClassKey === c.key ? ' uem-class-row--on' : ''}`}
          onClick={() => { 
            setSelectedClassKey(c.key); 
            if (selectedPosition === undefined || selectedClassKey !== c.key) {
              setSelectedPosition('top');
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          <div className="uem-class-info">
            <span className="uem-class-name">{c.label}</span>
            {c.tagline && <span className="uem-class-tagline">{c.tagline}</span>}
          </div>
          <PlacementButtons classKey={c.key} />
        </div>
        ))
      )}
    </div>
  );

  return (
    <div className="uem-backdrop" onClick={onClose}>
      <div className="uem-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="uem-header">
          <div className="uem-header-info">
            <button 
              type="button" 
              className="uem-info-btn" 
              onClick={() => setShowInfoModal(true)}
              title="View detailed information"
            >
              <Info size={16} />
            </button>
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
                  {isMobile ? 'Go To' : 'Go to in Watchlist'}
                </button>
                <button
                  type="button"
                  className="uem-watchlist-btn uem-watchlist-btn--remove"
                  onClick={() => { onRemoveFromWatchlist?.(); }}
                >
                  <Trash2 size={14} />
                  {isMobile ? 'Watchlist-' : 'Remove from Watchlist'}
                </button>
              </div>
            ) : onAddToWatchlist ? (
              <button
                type="button"
                className="uem-watchlist-btn"
                onClick={() => onAddToWatchlist()}
              >
                <Bookmark size={14} />
                {isMobile ? 'Watchlist+' : 'Add to Watchlist'}
              </button>
            ) : null}
            {(target.mediaType === 'movie' || target.mediaType === 'tv') && (
              <button
                type="button"
                className="uem-watchlist-btn uem-watchlist-btn--recommend"
                onClick={() => setRecommendOpen(true)}
                title="Recommend this title to friends"
              >
                <UserPlus size={14} />
                {isMobile ? 'Reccomend' : 'Recommend to friend'}
              </button>
            )}
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
                  seasonEpisodeCounts={seasonEpisodeCounts}
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

          {/* Tagging Section */}
          <div className="uem-tag-section">
            <div className="uem-section-header">
              <h3 className="uem-section-title">Lists & Collections</h3>
            </div>
            <div className="uem-tag-cloud">
              {availableTags.length === 0 && (
                <span className="uem-tag-chip uem-tag-chip--empty">no tags</span>
              )}
              {availableTags.map((tag) => (
                <button
                  key={tag.listId}
                  type="button"
                  className={`uem-tag-chip ${tagSelections[tag.listId] ? 'uem-tag-chip--on' : ''}`}
                  style={tagSelections[tag.listId] && tag.color ? { borderColor: tag.color, background: `${tag.color}33` } : undefined}
                  onClick={() => {
                    setTagSelections((prev) => {
                      const nextSelected = !prev[tag.listId];
                      onTagToggle?.(tag.listId, nextSelected);
                      return { ...prev, [tag.listId]: nextSelected };
                    });
                  }}
                >
                  {tag.label}
                  {tag.href ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(tag.href!);
                      }}
                      className="uem-tag-link"
                      aria-label={`Open ${tag.label}`}
                    >
                      <Eye size={12} />
                    </button>
                  ) : null}
                </button>
              ))}
              {collectionTags.map((tag) => (
                <span
                  key={tag.id}
                  className="uem-tag-chip uem-tag-chip--collection"
                  style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
                >
                  {tag.label}
                  {tag.href ? (
                    <button
                      type="button"
                      className="uem-tag-link"
                      onClick={() => navigate(tag.href!)}
                      aria-label={`Open ${tag.label}`}
                    >
                      <Eye size={12} />
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
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
        </div>

        {/* Footer */}
        <div className="uem-footer">
          {error && <div className="uem-error">{error}</div>}
          <div className="uem-footer-inner">
            {onRemoveEntry && (isRankedItem || currentClassKey === 'UNRANKED') && (
              <button
                type="button"
                className={`uem-delete-btn${removeClickCount === 1 ? ' uem-delete-btn--confirm' : ''}`}
                onClick={handleRemoveClick}
              >
                {removeClickCount === 1 ? 'Click again to confirm' : 'Remove Entry'}
              </button>
            )}
            <div className="uem-save-btns">
              {/* For new items: Save buttons disabled until class selected and watch added */}
              {hasNeverBeenRanked ? (
                <>
                  <button
                    type="button"
                    className={`uem-btn uem-btn--secondary${needsRankPick && !selectedClassKey ? ' uem-btn--disabled' : ''}`}
                    onClick={async () => {
                      await validateAndSave(false, entries.length === 0);
                    }}
                    disabled={isSaving || (needsRankPick && !selectedClassKey)}
                    title={needsRankPick && !selectedClassKey ? 'Select a ranking class first' : ''}
                  >
                    {isSaving ? 'Saving…' : needsRankPick && !selectedClassKey ? 'Save and Exit (Select class)' : entries.length === 0 ? 'Save and Exit (Long Ago watch)' : 'Save and Exit'}
                  </button>
                  <button
                    type="button"
                    className={`uem-btn uem-btn--primary${needsRankPick && !selectedClassKey ? ' uem-btn--disabled' : ''}`}
                    onClick={async () => {
                      await validateAndSave(true, entries.length === 0);
                    }}
                    disabled={isSaving || (needsRankPick && !selectedClassKey)}
                    title={needsRankPick && !selectedClassKey ? 'Select a ranking class first' : ''}
                  >
                    {isSaving ? 'Saving…' : needsRankPick && !selectedClassKey ? 'Save and Go To (Select class)' : entries.length === 0 ? 'Save and Go To (Long Ago watch)' : 'Save and Go To'}
                  </button>
                  {isBrandNewEntry && (
                    <button
                      type="button"
                      className="uem-btn uem-btn--ghost"
                      onClick={async () => {
                        const finalEntries = entries.length > 0 ? entries : [{
                          id: crypto.randomUUID(),
                          watchType: 'LONG_AGO' as const,
                          watchPercent: 100,
                          watchStatus: 'NONE' as const,
                        }];
                        await onSave({ watches: finalEntries, classKey: 'UNRANKED' }, false);
                      }}
                      disabled={isSaving}
                    >
                      Add as Unranked & Exit
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="uem-btn uem-btn--secondary"
                    onClick={async () => {
                      await validateAndSave(false);
                    }}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving…' : 'Save and Exit'}
                  </button>
                  <button
                    type="button"
                    className="uem-btn uem-btn--primary"
                    onClick={async () => {
                      await validateAndSave(true);
                    }}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving…' : 'Save and Go To'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Info Modal */}
      {showInfoModal && target.tmdbId && (
        <InfoModal
          isOpen={showInfoModal}
          onClose={() => setShowInfoModal(false)}
          tmdbId={target.tmdbId}
          mediaType={target.mediaType}
          title={target.title}
          posterPath={target.posterPath}
          releaseDate={target.releaseDate}
          onEditWatches={() => {
            setShowInfoModal(false); // Close info modal, return to edit modal
          }}
        />
      )}

      <RecommendToFriendModal
        isOpen={recommendOpen}
        target={
          recommendOpen && (target.mediaType === 'movie' || target.mediaType === 'tv')
            ? {
                id: target.id,
                title: target.title,
                posterPath: target.posterPath,
                releaseDate: target.releaseDate,
                mediaType: target.mediaType
              }
            : null
        }
        onClose={() => setRecommendOpen(false)}
      />
    </div>
  );
}
