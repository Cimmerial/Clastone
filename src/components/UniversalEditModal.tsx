import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { ArrowUp, ArrowDown, X, Bookmark, BookmarkCheck, Trash2, Info, UserPlus, Eye, FileText, Image as ImageIcon } from 'lucide-react';
import type { CachedCastMember, CachedDirector, WatchRecord, WatchReview } from './EntryRowMovieShow';
import { ThemedDropdown, type ThemedDropdownOption } from './ThemedDropdown';
import {
  getYearOptions,
  MONTH_OPTIONS,
  DAY_OPTIONS,
  applyDatePreset,
  DATE_PRESET_OPTIONS,
  type DatePreset
} from '../lib/dateDropdowns';
import { tmdbImagePath, tmdbMediaPosters, tmdbMovieDetailsFull, tmdbTvDetailsFull } from '../lib/tmdb';
import { getWatchRecordSortKey, useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { watchMatrixEntryToWatchRecord } from '../lib/watchMatrixMapping';
import {
  collectFlatDatedWatchEvents,
  countWatchesOnSortKey,
  sortEventsForDayOrderModal,
  dayOrdersFromOrderedRecordIds,
} from '../lib/watchDayOrderUtils';
import { lockBodyScroll, unlockBodyScroll } from '../lib/bodyScrollLock';
import { WatchDayOrderModal } from './WatchDayOrderModal';
import './UniversalEditModal.css';
import { InfoModal } from './InfoModal';
import { RecommendToFriendModal } from './RecommendToFriendModal';
import { useMobileViewMode } from '../hooks/useMobileViewMode';
import { useNavigate } from 'react-router-dom';

/* ─── Types ──────────────────────────────────────────── */

export type MediaType = 'movie' | 'tv';

export type WatchMatrixType = 'SINGLE_DATE' | 'DATE_RANGE' | 'LONG_AGO';
export type WatchDetailStatus = 'NONE' | 'WATCHING' | 'DNF';
const REVIEW_TITLE_MAX = 250;
const REVIEW_BODY_MAX = 10000;

type WatchReviewDraft = {
  title: string;
  body: string;
  publiclyViewable: boolean;
  containsSpoilers: boolean;
};

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
  /** Same calendar day ordering; higher = later in day. */
  dayOrder?: number;
  /** Optional review for this specific watch. */
  review?: WatchReview;
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
  /** Internal autosave mode (e.g. review save) that should not close parent modal state. */
  keepModalOpen?: boolean;
};

type Props = {
  target: UniversalEditTarget;
  rankedClasses: { key: string; label: string; tagline?: string; isRanked?: boolean }[];
  initialWatches?: WatchRecord[];  // Accept old format
  currentClassKey?: string;
  currentClassLabel?: string;
  isWatchlistItem?: boolean;
  onSave: (params: UniversalEditSaveParams, goToMedia: boolean) => void | Promise<void>;
  availableTags?: { listId: string; label: string; selected: boolean; href?: string; color?: string; editableInWatchModal?: boolean }[];
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

function sanitizeReviewText(input: string, maxLength: number): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLength);
}

function formatReviewContextDate(entry: WatchMatrixEntry): string {
  if (entry.watchType === 'LONG_AGO' || !entry.year) return 'Long Ago';
  const month = entry.month ?? 1;
  const day = entry.day ?? 1;
  const d = new Date(entry.year, month - 1, day);
  if (Number.isNaN(d.getTime())) return `${entry.year}`;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

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
  showOrderButton?: boolean;
  onOpenDayOrder?: () => void;
  hasReview: boolean;
  onOpenReview: () => void;
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
  showOrderButton,
  onOpenDayOrder,
  hasReview,
  onOpenReview,
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
              <span className="uem-preset-order-wrap">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <ThemedDropdown
                  value=""
                  options={[...DATE_PRESET_OPTIONS, { value: 'reset', label: 'Reset' }] as any}
                  triggerLabel="preset"
                  showOnHover
                  onChange={(v: string) => applyPreset(v as DatePreset | 'reset')}
                  className="uem-preset-dd"
                />
                {showOrderButton && onOpenDayOrder ? (
                  <button type="button" className="uem-order-btn" onClick={onOpenDayOrder}>
                    Order
                  </button>
                ) : null}
              </span>
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
        <button
          type="button"
          className="uem-review-btn"
          onClick={onOpenReview}
          title={hasReview ? 'Edit review' : 'Write review'}
        >
          <FileText size={12} />
          {hasReview ? 'Edit Review' : 'Write Review'}
        </button>
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
      else if (r.type === 'CURRENT' && !r.year) watchType = 'LONG_AGO';

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
        dayOrder: r.dayOrder,
        review: r.review,
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
  const [editingReviewEntryId, setEditingReviewEntryId] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<WatchReviewDraft>({
    title: '',
    body: '',
    publiclyViewable: false,
    containsSpoilers: true,
  });
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
  const [showTagHelpTooltip, setShowTagHelpTooltip] = useState(false);
  const [seasonEpisodeCounts, setSeasonEpisodeCounts] = useState<number[] | undefined>(undefined);
  const entriesEndRef = useRef<HTMLDivElement>(null);
  const [castSidebarOpen, setCastSidebarOpen] = useState(false);
  const [reviewCastSidebarOpen, setReviewCastSidebarOpen] = useState(false);
  const [castRefLoading, setCastRefLoading] = useState(false);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);
  const [imagePickerLoading, setImagePickerLoading] = useState(false);
  const [imagePickerSaving, setImagePickerSaving] = useState(false);
  const [imagePickerError, setImagePickerError] = useState<string | null>(null);
  const [imagePickerPaths, setImagePickerPaths] = useState<string[]>([]);
  const [selectedImagePath, setSelectedImagePath] = useState<string | null>(target.posterPath ?? null);
  const [castRefFetched, setCastRefFetched] = useState<{
    cast: CachedCastMember[];
    directors: CachedDirector[];
  } | null>(null);

  const isRankedItem = currentClassKey && currentClassKey !== 'UNRANKED';
  const hasNeverBeenRanked = !currentClassKey || currentClassKey === 'UNRANKED';
  /** Every class you can place an item into except the literal UNRANKED holding bucket (includes unranked tiers like BABY / DELICIOUS_GARBAGE). */
  const rankedPickable = useMemo(() => rankedClasses.filter((c) => c.key !== 'UNRANKED'), [rankedClasses]);

  const {
    byClass: moviesByClass,
    classOrder: movieClassOrder,
    getMovieById,
    updateMovieCache,
    batchUpdateMovieWatchRecords,
    forceSync: forceSyncMovies,
  } = useMoviesStore();
  const {
    byClass: tvByClass,
    classOrder: tvClassOrder,
    getShowById,
    updateShowCache,
    batchUpdateShowWatchRecords,
    forceSync: forceSyncTv,
  } = useTvStore();

  useEffect(() => {
    setSelectedImagePath(target.posterPath ?? null);
  }, [target.posterPath, target.id]);

  const storeMediaItem = useMemo(() => {
    if (target.mediaType === 'movie') return getMovieById(target.id);
    if (target.mediaType === 'tv') return getShowById(target.id);
    return null;
  }, [target.id, target.mediaType, getMovieById, getShowById]);

  const castRefDirectors = useMemo(() => {
    const fromStore = storeMediaItem?.directors ?? [];
    if (fromStore.length > 0) return fromStore;
    return castRefFetched?.directors ?? [];
  }, [storeMediaItem, castRefFetched]);

  const castRefCast = useMemo(() => {
    const fromStore = storeMediaItem?.cast ?? [];
    if (fromStore.length > 0) return fromStore;
    return castRefFetched?.cast ?? [];
  }, [storeMediaItem, castRefFetched]);

  useEffect(() => {
    setCastRefFetched(null);
  }, [target.id]);

  useEffect(() => {
    if ((!castSidebarOpen && !reviewCastSidebarOpen) || !target.tmdbId) return;
    if (target.mediaType !== 'movie' && target.mediaType !== 'tv') return;
    const hasStore =
      (storeMediaItem?.directors?.length ?? 0) > 0 || (storeMediaItem?.cast?.length ?? 0) > 0;
    if (hasStore) {
      setCastRefLoading(false);
      return;
    }
    let cancelled = false;
    setCastRefLoading(true);
    void (async () => {
      try {
        if (target.mediaType === 'movie') {
          const cache = await tmdbMovieDetailsFull(target.tmdbId!);
          if (!cancelled && cache) {
            setCastRefFetched({ cast: cache.cast ?? [], directors: cache.directors ?? [] });
          }
        } else {
          const cache = await tmdbTvDetailsFull(target.tmdbId!);
          if (!cancelled && cache) {
            setCastRefFetched({
              cast: cache.cast ?? [],
              directors: (cache.creators ?? []).map((c) => ({
                id: c.id,
                name: c.name,
                profilePath: c.profilePath,
              })),
            });
          }
        }
      } finally {
        if (!cancelled) setCastRefLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [castSidebarOpen, reviewCastSidebarOpen, target.tmdbId, target.mediaType, storeMediaItem]);

  const libraryFlat = useMemo(
    () =>
      target.mediaType === 'movie' || target.mediaType === 'tv'
        ? collectFlatDatedWatchEvents(moviesByClass, tvByClass, movieClassOrder, tvClassOrder)
        : [],
    [target.mediaType, moviesByClass, tvByClass, movieClassOrder, tvClassOrder]
  );

  /**
   * Matrix `entries` can hold stale `dayOrder` after the library-wide day-order modal updates the store.
   * Before save, align each row's dayOrder with the store when the calendar sortKey is unchanged so we
   * never write stale matrix state back over Firestore.
   */
  const mergeMatrixDayOrdersFromStore = useCallback(
    (matrixEntries: WatchMatrixEntry[]): WatchMatrixEntry[] => {
      if (target.mediaType !== 'movie' && target.mediaType !== 'tv') return matrixEntries;
      const item = target.mediaType === 'movie' ? getMovieById(target.id) : getShowById(target.id);
      const storeById = new Map((item?.watchRecords ?? []).map((r) => [String(r.id), r]));

      return matrixEntries.map((entry) => {
        const prev = storeById.get(String(entry.id));
        if (!prev) return entry;
        const nextRec = watchMatrixEntryToWatchRecord(entry);
        if (!nextRec) return entry;
        const prevSk = getWatchRecordSortKey(prev);
        const nextSk = getWatchRecordSortKey(nextRec);
        if (prevSk !== nextSk || prevSk === '0000-00-00') {
          return { ...entry, dayOrder: undefined };
        }
        return { ...entry, dayOrder: prev.dayOrder };
      });
    },
    [target.mediaType, target.id, getMovieById, getShowById]
  );

  const [dayOrderModalSortKey, setDayOrderModalSortKey] = useState<string | null>(null);
  const [isSavingDayOrder, setIsSavingDayOrder] = useState(false);

  const openReviewModal = useCallback((entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    const existing = entry.review;
    setReviewDraft({
      title: existing?.title ?? '',
      body: existing?.body ?? '',
      publiclyViewable: existing?.publiclyViewable ?? false,
      containsSpoilers: existing?.containsSpoilers !== false,
    });
    setEditingReviewEntryId(entryId);
  }, [entries]);

  const closeReviewModal = useCallback(() => {
    setEditingReviewEntryId(null);
    setReviewCastSidebarOpen(false);
  }, []);

  const saveReviewModal = useCallback(async () => {
    if (!editingReviewEntryId) return;
    const sanitizedTitle = sanitizeReviewText(reviewDraft.title.trim(), REVIEW_TITLE_MAX);
    const sanitizedBody = sanitizeReviewText(reviewDraft.body.trim(), REVIEW_BODY_MAX);
    const hasReviewContent = sanitizedTitle.length > 0 || sanitizedBody.length > 0;
    const review: WatchReview | undefined = hasReviewContent
      ? {
          title: sanitizedTitle,
          body: sanitizedBody,
          publiclyViewable: reviewDraft.publiclyViewable,
          containsSpoilers: reviewDraft.containsSpoilers,
          updatedAt: new Date().toISOString(),
        }
      : undefined;
    const nextEntries = entries.map((entry) =>
      entry.id === editingReviewEntryId ? { ...entry, review } : entry
    );
    setEntries(nextEntries);
    setError(null);
    try {
      await onSave(
        {
          watches: mergeMatrixDayOrdersFromStore(nextEntries),
          listMemberships: availableTags.map((tag) => ({
            listId: tag.listId,
            selected: Boolean(tagSelections[tag.listId]),
          })),
          keepModalOpen: true,
        },
        false
      );
      closeReviewModal();
    } catch {
      setError('Failed to auto-save review. Please try again.');
    }
  }, [
    editingReviewEntryId,
    reviewDraft,
    entries,
    onSave,
    mergeMatrixDayOrdersFromStore,
    availableTags,
    tagSelections,
    closeReviewModal,
  ]);

  const editingReviewEntry = useMemo(
    () => entries.find((entry) => entry.id === editingReviewEntryId) ?? null,
    [entries, editingReviewEntryId]
  );

  const dayOrderModalInitialRows = useMemo(() => {
    if (!dayOrderModalSortKey) return [];
    return sortEventsForDayOrderModal(libraryFlat.filter((e) => e.sortKey === dayOrderModalSortKey));
  }, [dayOrderModalSortKey, libraryFlat]);

  const handleDayOrderSave = useCallback(
    async (orderedRecordIds: string[]) => {
      if (!dayOrderModalSortKey) return;
      const orderMap = dayOrdersFromOrderedRecordIds(orderedRecordIds);
      const dayRows = libraryFlat.filter((e) => e.sortKey === dayOrderModalSortKey);
      const uniqEntry = new Map<string, boolean>();
      for (const row of dayRows) {
        uniqEntry.set(row.item.id, row.isMovie);
      }

      setIsSavingDayOrder(true);
      try {
        const moviePatches: Record<string, WatchRecord[]> = {};
        const tvPatches: Record<string, WatchRecord[]> = {};
        for (const [entryId, isMovie] of uniqEntry.entries()) {
          const item = isMovie ? getMovieById(entryId) : getShowById(entryId);
          if (!item?.watchRecords) continue;
          const newRecords = item.watchRecords.map((r) => {
            const o = orderMap.get(String(r.id));
            return o !== undefined ? { ...r, dayOrder: o } : r;
          });
          if (isMovie) moviePatches[entryId] = newRecords;
          else tvPatches[entryId] = newRecords;
        }
        flushSync(() => {
          if (Object.keys(moviePatches).length > 0) batchUpdateMovieWatchRecords(moviePatches);
          if (Object.keys(tvPatches).length > 0) batchUpdateShowWatchRecords(tvPatches);
        });
        await Promise.all([forceSyncMovies(), forceSyncTv()]);
        const patchedForThisTarget =
          target.mediaType === 'movie'
            ? moviePatches[target.id]
            : target.mediaType === 'tv'
              ? tvPatches[target.id]
              : undefined;
        if (patchedForThisTarget) {
          setEntries(convertRecordsToMatrix(patchedForThisTarget));
        }
        setDayOrderModalSortKey(null);
      } finally {
        setIsSavingDayOrder(false);
      }
    },
    [
      dayOrderModalSortKey,
      libraryFlat,
      target.id,
      target.mediaType,
      getMovieById,
      getShowById,
      batchUpdateMovieWatchRecords,
      batchUpdateShowWatchRecords,
      forceSyncMovies,
      forceSyncTv,
      convertRecordsToMatrix,
    ]
  );

  const needsRankPick = hasNeverBeenRanked && rankedPickable.length > 0;

  // Lock body scroll when modal is open (only on desktop)
  useEffect(() => {
    if (isMobile) return; // Don't lock scroll on mobile

    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
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
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const next = { ...e, ...updates };
        if (updates.watchPercent !== undefined) {
          const wasComplete = e.watchPercent >= 100;
          const nowComplete = updates.watchPercent >= 100;
          // Moving below 100 from complete should default to DNF.
          if (wasComplete && !nowComplete) {
            next.watchStatus = 'DNF';
          }
          // Returning to 100 resets both DNF / Watching back to none.
          if (nowComplete) {
            next.watchStatus = 'NONE';
          }
        }
        return next;
      })
    );
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
    
    // Preset on LONG_AGO should convert row to SINGLE_DATE with the preset date.
    if (entry.watchType === 'LONG_AGO') {
      updateEntry(id, {
        watchType: 'SINGLE_DATE',
        year: yearNum, month: monthNum, day: dayNum,
        endYear: undefined, endMonth: undefined, endDay: undefined
      });
      return;
    }

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

  const openImagePicker = useCallback(async () => {
    if (!target.tmdbId || (target.mediaType !== 'movie' && target.mediaType !== 'tv')) return;
    setShowImagePickerModal(true);
    setImagePickerError(null);
    setImagePickerLoading(true);
    try {
      const posters = await tmdbMediaPosters(target.tmdbId, target.mediaType);
      const current = target.posterPath;
      const withCurrentFirst = current && !posters.includes(current) ? [current, ...posters] : posters;
      setImagePickerPaths(withCurrentFirst);
      if (withCurrentFirst.length === 0) {
        setImagePickerError('No alternate images found on TMDB for this title.');
      }
    } catch {
      setImagePickerError('Unable to load alternate images right now.');
    } finally {
      setImagePickerLoading(false);
    }
  }, [target.tmdbId, target.mediaType, target.posterPath]);

  const saveImageSelection = useCallback(async () => {
    if (!selectedImagePath) {
      setImagePickerError('Select an image before saving.');
      return;
    }
    setImagePickerSaving(true);
    setImagePickerError(null);
    try {
      if (target.mediaType === 'movie') {
        updateMovieCache(target.id, { posterPath: selectedImagePath });
        await forceSyncMovies();
      } else if (target.mediaType === 'tv') {
        updateShowCache(target.id, { posterPath: selectedImagePath });
        await forceSyncTv();
      }
      setShowImagePickerModal(false);
    } catch {
      setImagePickerError('Could not save the selected image.');
    } finally {
      setImagePickerSaving(false);
    }
  }, [selectedImagePath, target.mediaType, target.id, updateMovieCache, updateShowCache, forceSyncMovies, forceSyncTv]);

  const validateAndSave = async (
    goToMedia: boolean,
    forceKeepUnranked: boolean = false
  ): Promise<boolean> => {
    setError(null);

    let finalEntries = entries;
    const wantsRankedClass = Boolean(selectedClassKey && selectedClassKey !== 'UNRANKED');
    if (finalEntries.length === 0 && wantsRankedClass && !forceKeepUnranked) {
      finalEntries = [{
        id: crypto.randomUUID(),
        watchType: 'LONG_AGO',
        watchPercent: 100,
        watchStatus: 'NONE',
      }];
    }
    const shouldForceUnranked = forceKeepUnranked || finalEntries.length === 0;

    // Validate entries
    for (const entry of finalEntries) {
      if (entry.watchType !== 'LONG_AGO' && !entry.year) {
        setError('All entries must have at least a year set.');
        return false;
      }
    }

    // Validate class selection
    if (needsRankPick && !selectedClassKey && !shouldForceUnranked) {
      setError('Please select a ranking class.');
      return false;
    }

    if (showClassOverride) {
      if (rankedPickable.length === 0) {
        setError('No ranked tiers yet. Pick a template on the list page, or keep your current rank.');
        return false;
      }
      if (!selectedClassKey || !rankedClasses.some((c) => c.key === selectedClassKey)) {
        setError('Please select a class (including Unranked) or cancel the class override.');
        return false;
      }
    }

    const effectiveClassKey = shouldForceUnranked
      ? 'UNRANKED'
      : hasNeverBeenRanked
        ? (rankedPickable.length === 0 ? 'UNRANKED' : selectedClassKey)
        : (showClassOverride ? selectedClassKey : undefined);

    await onSave(
      {
        watches: mergeMatrixDayOrdersFromStore(finalEntries),
        classKey: effectiveClassKey,
        position: effectiveClassKey && effectiveClassKey !== 'UNRANKED' ? selectedPosition : undefined,
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
        (isRankedItem && showClassOverride ? rankedClasses : rankedPickable).map((c) => (
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
          {c.key !== 'UNRANKED' ? <PlacementButtons classKey={c.key} /> : null}
        </div>
        ))
      )}
    </div>
  );

  const directorRoleLabel = target.mediaType === 'tv' ? 'Creator' : 'Director';
  const setImageButtonLabel =
    target.mediaType === 'movie'
      ? 'Set Movie Poster'
      : target.mediaType === 'tv'
        ? 'Set Show Poster'
        : 'Set Image';

  const renderCastSidebar = (extraClass?: string) => (
    <aside
      className={['uem-cast-sidebar', extraClass].filter(Boolean).join(' ')}
      aria-label="Cast and crew reference"
    >
      <div className="uem-cast-sidebar-title">People</div>
      {castRefLoading ? <p className="uem-cast-sidebar-status">Loading…</p> : null}
      {!castRefLoading && castRefDirectors.length === 0 && castRefCast.length === 0 ? (
        <p className="uem-cast-sidebar-empty">No cast info available.</p>
      ) : null}
      {castRefDirectors.map((d) => (
        <div key={`uem-cast-dir-${d.id}`} className="uem-cast-row">
          <div className="uem-cast-avatar">
            {d.profilePath ? (
              <img src={tmdbImagePath(d.profilePath, 'w45') ?? ''} alt="" loading="lazy" />
            ) : (
              <span className="uem-cast-avatar-fallback">{d.name.charAt(0)}</span>
            )}
          </div>
          <div className="uem-cast-meta">
            <span className="uem-cast-name">{d.name}</span>
            <span className="uem-cast-role">{directorRoleLabel}</span>
          </div>
        </div>
      ))}
      {castRefCast.length > 0 ? (
        <>
          {castRefDirectors.length > 0 ? <div className="uem-cast-sidebar-divider" /> : null}
          <div className="uem-cast-sidebar-sub">Cast</div>
          {castRefCast.map((c, castIdx) => (
            <div key={`uem-cast-${c.id}-${castIdx}`} className="uem-cast-row">
              <div className="uem-cast-avatar">
                {c.profilePath ? (
                  <img src={tmdbImagePath(c.profilePath, 'w45') ?? ''} alt="" loading="lazy" />
                ) : (
                  <span className="uem-cast-avatar-fallback">{c.name.charAt(0)}</span>
                )}
              </div>
              <div className="uem-cast-meta">
                <span className="uem-cast-name">{c.name}</span>
                {c.character ? <span className="uem-cast-role">{c.character}</span> : null}
              </div>
            </div>
          ))}
        </>
      ) : null}
    </aside>
  );

  return (
    <div className="uem-backdrop" onClick={onClose}>
      <div className="uem-modal-cluster" onClick={e => e.stopPropagation()}>
        {castSidebarOpen && !editingReviewEntry && (target.mediaType === 'movie' || target.mediaType === 'tv')
          ? renderCastSidebar()
          : null}
        <div className="uem-modal">
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
            {target.tmdbId && (target.mediaType === 'movie' || target.mediaType === 'tv') ? (
              <button
                type="button"
                className="uem-watchlist-btn uem-watchlist-btn--image"
                onClick={() => void openImagePicker()}
              >
                <ImageIcon size={14} />
                {isMobile ? 'Set image' : setImageButtonLabel}
              </button>
            ) : null}
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
              {entries.map((entry) => {
                const provisional = watchMatrixEntryToWatchRecord(entry);
                const sk = provisional ? getWatchRecordSortKey(provisional) : '0000-00-00';
                const showOrderBtn =
                  (target.mediaType === 'movie' || target.mediaType === 'tv') &&
                  sk !== '0000-00-00' &&
                  provisional !== null &&
                  countWatchesOnSortKey(libraryFlat, sk) >= 2;
                return (
                <MatrixRow
                  key={entry.id}
                  entry={entry}
                  yearOptions={yearOptions}
                  monthOptsFor={monthOptsFor}
                  dayOptsFor={dayOptsFor}
                  onUpdate={updates => updateEntry(entry.id, updates)}
                  onRemove={() => removeEntry(entry.id)}
                  canRemove={entries.length > 0}
                  runtimeMinutes={target.runtimeMinutes}
                  totalEpisodes={target.totalEpisodes}
                  totalSeasons={target.totalSeasons}
                  seasonEpisodeCounts={seasonEpisodeCounts}
                  mediaType={target.mediaType}
                  applyPreset={preset => applyPresetToEntry(entry.id, preset, entry.watchType === 'DATE_RANGE')}
                  showOrderButton={showOrderBtn}
                  onOpenDayOrder={showOrderBtn ? () => setDayOrderModalSortKey(sk) : undefined}
                  hasReview={Boolean(entry.review?.title || entry.review?.body)}
                  onOpenReview={() => openReviewModal(entry.id)}
                />
                );
              })}
              <div ref={entriesEndRef} />
            </div>

            <button type="button" className="uem-add-btn" onClick={addEntry}>
              + Add Watch
            </button>
          </div>

          {/* Tagging Section */}
          <div className="uem-tag-section">
            <div className="uem-section-header">
              <div className="uem-section-title-with-info">
                <h3 className="uem-section-title">Lists & Collections</h3>
                <span
                  className="uem-section-info-wrap"
                  onMouseEnter={() => setShowTagHelpTooltip(true)}
                  onMouseLeave={() => setShowTagHelpTooltip(false)}
                >
                  <button
                    type="button"
                    className="uem-section-info-btn"
                    aria-label="Info: click tags to add to list"
                    onFocus={() => setShowTagHelpTooltip(true)}
                    onBlur={() => setShowTagHelpTooltip(false)}
                    onClick={() => setShowTagHelpTooltip((prev) => !prev)}
                  >
                    <Info size={12} />
                  </button>
                  {showTagHelpTooltip ? (
                    <span className="uem-section-tooltip" role="tooltip">
                      click tags to add to list (if enabled)
                    </span>
                  ) : null}
                </span>
              </div>
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
                    if (tag.editableInWatchModal === false) return;
                    setTagSelections((prev) => {
                      const nextSelected = !prev[tag.listId];
                      onTagToggle?.(tag.listId, nextSelected);
                      return { ...prev, [tag.listId]: nextSelected };
                    });
                  }}
                  disabled={tag.editableInWatchModal === false}
                  title={tag.editableInWatchModal === false ? 'Can only be edited from list/collection page' : undefined}
                >
                  {tag.label}
                  {tag.editableInWatchModal === false ? ' (locked)' : ''}
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
            <div className="uem-footer-start">
              {(target.mediaType === 'movie' || target.mediaType === 'tv') && (
                <button
                  type="button"
                  className="uem-show-cast-btn"
                  onClick={() => setCastSidebarOpen((open) => !open)}
                >
                  {castSidebarOpen ? 'Hide cast' : 'Show cast'}
                </button>
              )}
              {onRemoveEntry && (isRankedItem || currentClassKey === 'UNRANKED') && (
                <button
                  type="button"
                  className={`uem-delete-btn${removeClickCount === 1 ? ' uem-delete-btn--confirm' : ''}`}
                  onClick={handleRemoveClick}
                >
                  {removeClickCount === 1 ? 'Click again to confirm' : 'Remove Entry'}
                </button>
              )}
            </div>
            <div className="uem-save-btns">
              {/* For new items: Save buttons disabled until class selected and watch added */}
              {hasNeverBeenRanked ? (
                <>
                  {needsRankPick && !selectedClassKey && (
                    <button
                      type="button"
                      className="uem-btn uem-btn--ghost"
                      onClick={async () => {
                        await validateAndSave(false, true);
                      }}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving…' : 'Save, exit, keep in unranked'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`uem-btn uem-btn--secondary${needsRankPick && !selectedClassKey ? ' uem-btn--disabled' : ''}`}
                    onClick={async () => {
                      await validateAndSave(false);
                    }}
                    disabled={isSaving || (needsRankPick && !selectedClassKey)}
                    title={needsRankPick && !selectedClassKey ? 'Select a ranking class first' : ''}
                  >
                    {isSaving
                      ? 'Saving…'
                      : needsRankPick && !selectedClassKey
                        ? 'Save and Exit (Select class)'
                        : entries.length === 0 && selectedClassKey && selectedClassKey !== 'UNRANKED'
                          ? 'Save and Exit (default Long Ago watch)'
                          : 'Save and Exit'}
                  </button>
                  <button
                    type="button"
                    className={`uem-btn uem-btn--primary${needsRankPick && !selectedClassKey ? ' uem-btn--disabled' : ''}`}
                    onClick={async () => {
                      await validateAndSave(true);
                    }}
                    disabled={isSaving || (needsRankPick && !selectedClassKey)}
                    title={needsRankPick && !selectedClassKey ? 'Select a ranking class first' : ''}
                  >
                    {isSaving
                      ? 'Saving…'
                      : needsRankPick && !selectedClassKey
                        ? 'Save and Go To (Select class)'
                        : entries.length === 0 && selectedClassKey && selectedClassKey !== 'UNRANKED'
                          ? 'Save and Go To (default Long Ago watch)'
                          : 'Save and Go To'}
                  </button>
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
      </div>

      {editingReviewEntry ? (
        <div className="uem-review-backdrop" onClick={(event) => event.stopPropagation()}>
          <div className="uem-review-cluster" onClick={(event) => event.stopPropagation()}>
            {reviewCastSidebarOpen && (target.mediaType === 'movie' || target.mediaType === 'tv')
              ? renderCastSidebar('uem-cast-sidebar--in-review')
              : null}
            <div
              className="uem-review-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="uem-review-title"
              onClick={(event) => event.stopPropagation()}
            >
            <div className="uem-review-header">
              <h3 id="uem-review-title" className="uem-review-title">
                Review of {target.title} on {formatReviewContextDate(editingReviewEntry)}
              </h3>
              <button type="button" className="uem-close-btn" onClick={closeReviewModal} aria-label="Close review editor">
                <X size={16} />
              </button>
            </div>
            <div className="uem-review-body">
              <label className="uem-review-label" htmlFor="uem-review-title-input">Title</label>
              <input
                id="uem-review-title-input"
                type="text"
                className="uem-review-input"
                value={reviewDraft.title}
                maxLength={REVIEW_TITLE_MAX}
                onChange={(event) => {
                  const next = sanitizeReviewText(event.target.value, REVIEW_TITLE_MAX);
                  setReviewDraft((prev) => ({ ...prev, title: next }));
                }}
                placeholder="Add a review title"
              />
              <div className="uem-review-count">{reviewDraft.title.length}/{REVIEW_TITLE_MAX}</div>

              <label className="uem-review-label" htmlFor="uem-review-body-input">Review</label>
              <textarea
                id="uem-review-body-input"
                className="uem-review-textarea"
                value={reviewDraft.body}
                maxLength={REVIEW_BODY_MAX}
                onChange={(event) => {
                  const next = sanitizeReviewText(event.target.value, REVIEW_BODY_MAX);
                  setReviewDraft((prev) => ({ ...prev, body: next }));
                }}
                placeholder="Write your review"
                rows={8}
              />
              <div className="uem-review-count">{reviewDraft.body.length}/{REVIEW_BODY_MAX}</div>

              <div className="uem-review-toggles" role="group" aria-label="Review options">
                <label className="uem-review-switch" htmlFor="uem-review-spoilers">
                  <input
                    id="uem-review-spoilers"
                    type="checkbox"
                    className="uem-review-switch-input"
                    checked={reviewDraft.containsSpoilers}
                    onChange={(event) =>
                      setReviewDraft((prev) => ({ ...prev, containsSpoilers: event.target.checked }))
                    }
                  />
                  <span className="uem-review-switch-track" aria-hidden />
                  <span className="uem-review-switch-copy">
                    <span className="uem-review-switch-label">Contains spoilers</span>
                    <span className="uem-review-switch-hint">Mark if this review discusses plot or twists</span>
                  </span>
                </label>
                <label className="uem-review-switch" htmlFor="uem-review-public">
                  <input
                    id="uem-review-public"
                    type="checkbox"
                    className="uem-review-switch-input"
                    checked={reviewDraft.publiclyViewable}
                    onChange={(event) =>
                      setReviewDraft((prev) => ({ ...prev, publiclyViewable: event.target.checked }))
                    }
                  />
                  <span className="uem-review-switch-track" aria-hidden />
                  <span className="uem-review-switch-copy">
                    <span className="uem-review-switch-label">Publicly viewable</span>
                    <span className="uem-review-switch-hint">Allow on a future public reviews page</span>
                  </span>
                </label>
              </div>
            </div>
            <div className="uem-review-footer">
              {(target.mediaType === 'movie' || target.mediaType === 'tv') && (
                <button
                  type="button"
                  className="uem-show-cast-btn uem-show-cast-btn--in-review"
                  onClick={() => setReviewCastSidebarOpen((open) => !open)}
                >
                  {reviewCastSidebarOpen ? 'Hide cast' : 'Show cast'}
                </button>
              )}
              <button type="button" className="uem-btn uem-btn--primary" onClick={() => void saveReviewModal()} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
            </div>
          </div>
        </div>
      ) : null}
      
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

      {dayOrderModalSortKey ? (
        <WatchDayOrderModal
          sortKey={dayOrderModalSortKey}
          initialRows={dayOrderModalInitialRows}
          onClose={() => setDayOrderModalSortKey(null)}
          onSave={handleDayOrderSave}
          isSaving={isSavingDayOrder}
        />
      ) : null}

      {showImagePickerModal ? (
        <div className="uem-review-backdrop" onClick={() => setShowImagePickerModal(false)}>
          <div
            className="uem-image-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Set poster image"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="uem-review-header">
              <h3 className="uem-review-title">Set poster/headshot image</h3>
              <button type="button" className="uem-close-btn" onClick={() => setShowImagePickerModal(false)} aria-label="Close image picker">
                <X size={16} />
              </button>
            </div>
            <div className="uem-image-picker-body">
              <aside className="uem-image-picker-sidebar" aria-label="Current image">
                <p className="uem-image-picker-current">
                  Current image
                </p>
                <div className="uem-image-picker-current-preview">
                  {target.posterPath ? (
                    <img src={tmdbImagePath(target.posterPath, 'w185') ?? ''} alt={`${target.title} current poster`} />
                  ) : (
                    <span className="uem-image-picker-empty">No current image</span>
                  )}
                </div>
              </aside>
              <section className="uem-image-picker-main" aria-label="Alternate images">
                {imagePickerError ? <div className="uem-error">{imagePickerError}</div> : null}
                {imagePickerLoading ? (
                  <p className="uem-cast-sidebar-status">Loading images...</p>
                ) : (
                  <div className="uem-image-picker-grid">
                    {imagePickerPaths.map((path) => (
                      <button
                        key={path}
                        type="button"
                        className={`uem-image-picker-option${selectedImagePath === path ? ' uem-image-picker-option--selected' : ''}`}
                        onClick={() => setSelectedImagePath(path)}
                      >
                        <img src={tmdbImagePath(path, 'w185') ?? ''} alt={`${target.title} option`} loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <div className="uem-review-footer">
              <button
                type="button"
                className="uem-btn uem-btn--secondary"
                onClick={() => setShowImagePickerModal(false)}
                disabled={imagePickerSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="uem-btn uem-btn--primary"
                onClick={() => void saveImageSelection()}
                disabled={imagePickerSaving || imagePickerLoading || !selectedImagePath}
              >
                {imagePickerSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
