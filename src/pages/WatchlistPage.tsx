import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import { RandomQuote } from '../components/RandomQuote';
import { PageSearch, type SearchableItem } from '../components/PageSearch';
import { useMobileViewMode } from '../hooks/useMobileViewMode';
import { lockBodyScroll, unlockBodyScroll } from '../lib/bodyScrollLock';
import { useSettingsStore } from '../state/settingsStore';
import { InfoModal } from '../components/InfoModal';
import { useFriends } from '../context/FriendsContext';
import {
  DndContext,
  type DragEndEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, sortableKeyboardCoordinates, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useWatchlistStore, type WatchlistEntry, type WatchlistType } from '../state/watchlistStore';
import { useListsStore } from '../state/listsStore';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { tmdbImagePath, tmdbMovieDetailsFull, tmdbTvDetailsFull, tmdbWatchProviderCatalog, tmdbWatchProviders, type TmdbWatchProvider } from '../lib/tmdb';
import { UniversalEditModal, type UniversalEditTarget, type UniversalEditSaveParams } from '../components/UniversalEditModal';
import { watchMatrixEntriesToWatchRecords } from '../lib/watchMatrixMapping';
import { prepareWatchRecordsForSave } from '../lib/watchDayOrderUtils';
import { formatRecommendersLabel } from '../components/RecommendToFriendModal';
import { WatchlistFriendOverlapModal } from '../components/WatchlistFriendOverlapModal';
import { useWatchlistFriendOverlap } from '../hooks/useWatchlistFriendOverlap';
import './WatchlistPage.css';

type WatchlistSectionKey = 'default' | 'rewatch' | 'unreleased';
type WatchlistVisibilityMode = 'ALL' | 'FREE';

const WATCHING_NEXT_STORAGE_KEY_MOVIES = 'clastone-watchlist-watching-next-movies';
const WATCHING_NEXT_STORAGE_KEY_TV = 'clastone-watchlist-watching-next-tv';

function sanitizeWatchingNextIds(
  ids: string[],
  released: WatchlistEntry[],
  rewatch: WatchlistEntry[],
  unreleased: WatchlistEntry[]
): string[] {
  const allowed = new Set([...released, ...rewatch, ...unreleased].map((e) => e.id));
  return ids.filter((id) => allowed.has(id));
}

/** Reorder the visible subsequence inside `watchingIds` using a drag within Watching Next. */
function reorderWatchingNextIdsInPlace(
  watchingIds: string[],
  visibleOrdered: string[],
  activeId: string,
  overId: string
): string[] {
  const visibleSet = new Set(visibleOrdered);
  const oldI = visibleOrdered.indexOf(activeId);
  const newI = visibleOrdered.indexOf(overId);
  if (oldI === -1 || newI === -1) return watchingIds;
  const newVis = arrayMove(visibleOrdered, oldI, newI);
  let vi = 0;
  return watchingIds.map((id) => {
    if (!visibleSet.has(id)) return id;
    return newVis[vi++]!;
  });
}

function partitionWatchlistFullScan(
  fullList: WatchlistEntry[],
  hasWatched: (id: string) => boolean
): { released: WatchlistEntry[]; rewatch: WatchlistEntry[]; unreleased: WatchlistEntry[] } {
  const released: WatchlistEntry[] = [];
  const rewatch: WatchlistEntry[] = [];
  const unreleased: WatchlistEntry[] = [];
  for (const entry of fullList) {
    if (isUpcomingRelease(entry.releaseDate)) {
      unreleased.push(entry);
    } else if (hasWatched(entry.id)) {
      rewatch.push(entry);
    } else {
      released.push(entry);
    }
  }
  return { released, rewatch, unreleased: sortUnreleasedByDate(unreleased) };
}

function entryWatchlistBucket(
  entry: WatchlistEntry,
  hasWatched: (id: string) => boolean
): 'released' | 'rewatch' | 'unreleased' {
  if (isUpcomingRelease(entry.releaseDate)) return 'unreleased';
  if (hasWatched(entry.id)) return 'rewatch';
  return 'released';
}

function prependEntryToBucket(list: WatchlistEntry[], entryId: string): WatchlistEntry[] {
  const i = list.findIndex((e) => e.id === entryId);
  if (i <= 0) return list;
  const next = [...list];
  const [x] = next.splice(i, 1);
  return [x, ...next];
}

/** Full watchlist order: Watching Next (in saved order), then released / rewatch / unreleased strips. */
function rebuildFullListFromWatchingNext(
  fullList: WatchlistEntry[],
  hasWatched: (id: string) => boolean,
  watchingIds: string[]
): WatchlistEntry[] {
  const { released, rewatch, unreleased } = partitionWatchlistFullScan(fullList, hasWatched);
  const allowed = new Set([...released, ...rewatch, ...unreleased].map((e) => e.id));
  const wSan = watchingIds.filter((id) => allowed.has(id));
  const wSet = new Set(wSan);
  const byId = new Map(fullList.map((e) => [e.id, e]));
  const wEntries = wSan.map((id) => byId.get(id)).filter(Boolean) as WatchlistEntry[];
  const relR = released.filter((e) => !wSet.has(e.id));
  const rewR = rewatch.filter((e) => !wSet.has(e.id));
  const unrR = unreleased.filter((e) => !wSet.has(e.id));
  return [...wEntries, ...relR, ...rewR, ...unrR];
}

function rebuildAfterRemoveFromWatchingNext(
  fullList: WatchlistEntry[],
  hasWatched: (id: string) => boolean,
  nextWatchingIds: string[],
  removedId: string
): WatchlistEntry[] {
  const base = rebuildFullListFromWatchingNext(fullList, hasWatched, nextWatchingIds);
  const entry = fullList.find((e) => e.id === removedId);
  if (!entry) return base;
  const bucket = entryWatchlistBucket(entry, hasWatched);
  const { released, rewatch, unreleased } = partitionWatchlistFullScan(base, hasWatched);
  const allowed = new Set([...released, ...rewatch, ...unreleased].map((e) => e.id));
  const wSan = nextWatchingIds.filter((id) => allowed.has(id));
  const wSet = new Set(wSan);
  const byId = new Map(base.map((e) => [e.id, e]));
  const wEntries = wSan.map((id) => byId.get(id)).filter(Boolean) as WatchlistEntry[];
  let relR = released.filter((e) => !wSet.has(e.id));
  let rewR = rewatch.filter((e) => !wSet.has(e.id));
  let unrR = unreleased.filter((e) => !wSet.has(e.id));
  if (bucket === 'released') relR = prependEntryToBucket(relR, removedId);
  else if (bucket === 'rewatch') rewR = prependEntryToBucket(rewR, removedId);
  else unrR = prependEntryToBucket(unrR, removedId);
  return [...wEntries, ...relR, ...rewR, ...unrR];
}

/** Replace the visible subsequence (same ID set as `subsequence`) in fullList with `newOrder`. */
function applySubsequenceOrder(
  fullList: WatchlistEntry[],
  subsequence: WatchlistEntry[],
  newOrder: WatchlistEntry[]
): WatchlistEntry[] {
  const subSet = new Set(subsequence.map((e) => e.id));
  if (subsequence.length !== newOrder.length) return fullList;
  for (const e of newOrder) {
    if (!subSet.has(e.id)) return fullList;
  }
  const byId = new Map(newOrder.map((e) => [e.id, e]));
  const newIds = newOrder.map((e) => e.id);
  let r = 0;
  return fullList.map((m) => {
    if (!subSet.has(m.id)) return m;
    return byId.get(newIds[r++])!;
  });
}

const WATCH_PROVIDERS_SESSION_KEY = 'clastone_watchProviders_v2';
const WATCH_PROVIDER_CATALOG_SESSION_KEY = 'clastone_watchProviderCatalog_v1';

function normalizeProviderName(name: string) {
  return name.trim();
}

function uniqProviders(list: TmdbWatchProvider[]) {
  const byId = new Map<number, TmdbWatchProvider>();
  for (const p of list) {
    const existing = byId.get(p.provider_id);
    if (!existing) byId.set(p.provider_id, p);
  }
  return Array.from(byId.values()).sort((a, b) => (a.display_priority ?? 9999) - (b.display_priority ?? 9999));
}

function MyServicesModal({
  isOpen,
  onClose,
  providers,
  selectedProviderIds,
  onSelectionChange,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  providers: TmdbWatchProvider[];
  selectedProviderIds: number[];
  onSelectionChange: (ids: number[]) => void;
  isLoading: boolean;
}) {
  const [query, setQuery] = useState('');

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const selected = useMemo(() => new Set(selectedProviderIds), [selectedProviderIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter((p) => normalizeProviderName(p.provider_name).toLowerCase().includes(q));
  }, [providers, query]);

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(Array.from(next));
  };

  if (!isOpen) return null;

  return (
    <div className="watchlist-overlap-backdrop" onClick={onClose}>
      <div className="watchlist-services-modal" onClick={(e) => e.stopPropagation()}>
        <div className="watchlist-overlap-modal-header">
          <div className="watchlist-overlap-modal-title">My streaming services</div>
          <button type="button" className="watchlist-overlap-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="watchlist-overlap-modal-body">
          <div className="watchlist-services-top">
            <input
              className="watchlist-services-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services…"
            />
            <div className="watchlist-services-meta">
              Selected: {selected.size}
              {isLoading ? ' · Loading…' : ''}
            </div>
          </div>

          {providers.length === 0 && !isLoading ? (
            <div className="watchlist-overlap-empty">No providers loaded.</div>
          ) : (
            <div className="watchlist-services-list" role="list">
              {filtered.map((p) => {
                const checked = selected.has(p.provider_id);
                return (
                  <label key={p.provider_id} className="watchlist-services-row" role="listitem">
                    <input type="checkbox" checked={checked} onChange={() => toggle(p.provider_id)} />
                    {p.logo_path ? (
                      <img
                        className="watchlist-services-logo"
                        src={tmdbImagePath(p.logo_path, 'w45') || undefined}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <div className="watchlist-services-logo watchlist-services-logo--placeholder" />
                    )}
                    <div className="watchlist-services-name">{p.provider_name}</div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="watchlist-overlap-modal-footer">
          <button type="button" className="watchlist-overlap-btn watchlist-overlap-btn--ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function formatYear(releaseDate?: string): string {
  if (!releaseDate) return '—';
  const y = releaseDate.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : releaseDate;
}

function formatRuntimeMinutes(minutes?: number): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isUnreleased(releaseDate?: string): boolean {
  if (!releaseDate) return false;
  const release = new Date(releaseDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return release > today;
}

function isUpcomingRelease(releaseDate?: string): boolean {
  // Unknown dates should still appear in Upcoming.
  if (!releaseDate) return true;
  return isUnreleased(releaseDate);
}

function formatDate(releaseDate?: string): string {
  if (!releaseDate) return '';
  const date = new Date(releaseDate);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sortUnreleasedByDate(entries: WatchlistEntry[]): WatchlistEntry[] {
  return [...entries]
    .sort((a, b) => {
      const aTime = a.releaseDate ? new Date(a.releaseDate).getTime() : Number.NaN;
      const bTime = b.releaseDate ? new Date(b.releaseDate).getTime() : Number.NaN;
      const aKnown = Number.isFinite(aTime);
      const bKnown = Number.isFinite(bTime);
      if (!aKnown && !bKnown) return 0;
      if (!aKnown) return 1;
      if (!bKnown) return -1;
      return aTime - bTime;
    });
}

function separateReleasedAndUnreleased(entries: WatchlistEntry[], hasWatched: (id: string) => boolean): { released: WatchlistEntry[]; rewatch: WatchlistEntry[]; unreleased: WatchlistEntry[] } {
  const released: WatchlistEntry[] = [];
  const rewatch: WatchlistEntry[] = [];
  const unreleased: WatchlistEntry[] = [];
  
  entries.forEach(entry => {
    if (isUpcomingRelease(entry.releaseDate)) {
      unreleased.push(entry);
    } else {
      const hasBeenWatched = hasWatched(entry.id);
      if (hasBeenWatched) {
        rewatch.push(entry);
      } else {
        released.push(entry);
      }
    }
  });
  
  return { released, rewatch, unreleased: sortUnreleasedByDate(unreleased) };
}

function getWatchlistSectionId(type: WatchlistType, section: WatchlistSectionKey): string {
  return `watchlist-section-${type}-${section}`;
}

function WatchingNextHeader() {
  return (
    <div className="watchlist-divider">
      <div className="watchlist-divider-line" />
      <div className="watchlist-divider-label">Watching Next</div>
      <div className="watchlist-divider-line" />
    </div>
  );
}

function watchlistRecommendedTitle(entry: WatchlistEntry): string | undefined {
  if (!entry.recommendedBy?.length) return undefined;
  return `Recommended by ${formatRecommendersLabel(entry.recommendedBy)}`;
}

function entryHasFriendRecommendations(e: WatchlistEntry): boolean {
  return (e.recommendedBy?.length ?? 0) > 0;
}

function WatchlistTile({
  entry,
  type,
  onRecordWatch,
  onRemove,
  hasWatched,
  providers,
  onInfo,
  sortableEnabled = true,
  runtimeMinutes,
  sortableSection = 'released',
  showWatchingNextAdd = false,
  showWatchingNextRemove = false,
  onAddWatchingNext,
  onRemoveWatchingNext,
}: {
  entry: WatchlistEntry;
  type: WatchlistType;
  onRecordWatch: () => void;
  onRemove: () => void;
  hasWatched: boolean;
  providers?: Array<TmdbWatchProvider & { type: 'subs' | 'rent' }>;
  onInfo?: () => void;
  sortableEnabled?: boolean;
  runtimeMinutes?: number;
  sortableSection?: 'released' | 'rewatch' | 'unreleased' | 'watching';
  showWatchingNextAdd?: boolean;
  showWatchingNextRemove?: boolean;
  onAddWatchingNext?: () => void;
  onRemoveWatchingNext?: () => void;
}) {
  const [clickCount, setClickCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fetchedRuntime, setFetchedRuntime] = useState<number | null>(null);

  const handlePointerEnter = async () => {
    if (runtimeMinutes || fetchedRuntime) return;
    const match = entry.id.match(/^tmdb-(movie|tv)-(\d+)$/);
    if (!match) return;
    const [, media, idStr] = match;
    const tmdbId = parseInt(idStr, 10);
    if (media === 'movie') {
      try {
        const { tmdbMovieDetails } = await import('../lib/tmdb');
        const res = await tmdbMovieDetails(tmdbId);
        if (res.runtime) setFetchedRuntime(res.runtime);
      } catch (e) {
        // ignore
      }
    }
  };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    data: { type, section: sortableSection },
    disabled: !sortableEnabled
  });
  const style = transform ? { transform: CSS.Transform.toString(transform), transition } : undefined;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const newCount = clickCount + 1;
    setClickCount(newCount);
    
    if (newCount === 1) {
      // First click - show confirmation
      setShowConfirm(true);
      // Reset after 2 seconds
      setTimeout(() => {
        setClickCount(0);
        setShowConfirm(false);
      }, 2000);
    } else if (newCount === 2) {
      // Double click - remove immediately
      onRemove();
      setClickCount(0);
      setShowConfirm(false);
    }
  };

  const isRecommended = (entry.recommendedBy?.length ?? 0) > 0;
  const recTitle = watchlistRecommendedTitle(entry);

  return (
    <div 
      className={`entry-tile ${hasWatched ? 'watched' : ''} ${isRecommended ? 'watchlist-entry--recommended' : ''} ${isDragging ? 'watchlist-tile--dragging' : ''}`}
      data-watchlist-id={entry.id}
      data-recommended-tooltip={isRecommended && recTitle ? recTitle : undefined}
      ref={setNodeRef}
      style={style}
      title={recTitle}
      onPointerEnter={handlePointerEnter}
      {...attributes}
      {...listeners}
    >
      <div className="entry-tile-poster">
        {entry.posterPath ? (
          <img
            src={tmdbImagePath(entry.posterPath, 'w500') || undefined}
            alt={entry.title}
            loading="lazy"
          />
        ) : (
          <span>
            {type === 'movies' ? '🎬' : '📺'}
          </span>
        )}
        <div className="entry-tile-stats-overlay">
          <div className="entry-stat-pill">
            {formatYear(entry.releaseDate)}
          </div>
          {isUnreleased(entry.releaseDate) && (
            <div className="entry-stat-pill">
              {formatDate(entry.releaseDate)}
            </div>
          )}
          {(runtimeMinutes || fetchedRuntime) && (
            <div className="entry-stat-pill">
              {formatRuntimeMinutes(runtimeMinutes || fetchedRuntime!)}
            </div>
          )}
        </div>
        <div className="entry-tile-info-btn">
          {onInfo && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInfo();
              }}
              title="Info"
            >
              <Info size={14} />
            </button>
          )}
        </div>
        <div className="entry-tile-quick-actions">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRecordWatch();
            }}
            title="Record Watch"
          >
            RW
          </button>
          <button
            type="button"
            className={`watchlist-tile-remove-btn ${showConfirm ? 'confirming' : ''}`}
            aria-label="Remove from watchlist"
            onClick={handleClick}
            title="Remove"
          >
            {showConfirm ? '✓' : '✕'}
          </button>
        </div>
        {(showWatchingNextAdd || showWatchingNextRemove) && (
          <div className="watchlist-tile-wtn-poster-action">
            {showWatchingNextAdd && onAddWatchingNext && (
              <button
                type="button"
                className="watchlist-tile-wtn-btn watchlist-tile-wtn-btn--add"
                title="Add to the end of Watching Next"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddWatchingNext();
                }}
              >
                ADD WATCHING NEXT
              </button>
            )}
            {showWatchingNextRemove && onRemoveWatchingNext && (
              <button
                type="button"
                className="watchlist-tile-wtn-btn watchlist-tile-wtn-btn--remove"
                title="Remove from Watching Next and move to the top of Up Next"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveWatchingNext();
                }}
              >
                REMOVE FROM
              </button>
            )}
          </div>
        )}
      </div>
      <div className="entry-tile-title">
        {entry.title}
      </div>
    </div>
  );
}

function WatchlistRow({
  entry,
  type,
  onRecordWatch,
  onMoveUp,
  onMoveDown,
  onRemove,
  hasWatched,
  canMoveUp,
  canMoveDown,
  providers,
  minimized = false,
  onInfo,
  sortableEnabled = true,
  runtimeMinutes
}: {
  entry: WatchlistEntry;
  type: WatchlistType;
  onRecordWatch: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  hasWatched: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  providers?: Array<TmdbWatchProvider & { type: 'subs' | 'rent' }>;
  minimized?: boolean;
  onInfo?: () => void;
  sortableEnabled?: boolean;
  runtimeMinutes?: number;
}) {
  const [clickCount, setClickCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fetchedRuntime, setFetchedRuntime] = useState<number | null>(null);

  const handlePointerEnter = async () => {
    if (runtimeMinutes || fetchedRuntime) return;
    const match = entry.id.match(/^tmdb-(movie|tv)-(\d+)$/);
    if (!match) return;
    const [, media, idStr] = match;
    const tmdbId = parseInt(idStr, 10);
    if (media === 'movie') {
      try {
        const { tmdbMovieDetails } = await import('../lib/tmdb');
        const res = await tmdbMovieDetails(tmdbId);
        if (res.runtime) setFetchedRuntime(res.runtime);
      } catch (e) {
        // ignore
      }
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const newCount = clickCount + 1;
    setClickCount(newCount);
    
    if (newCount === 1) {
      // First click - show confirmation
      setShowConfirm(true);
      // Reset after 2 seconds
      setTimeout(() => {
        setClickCount(0);
        setShowConfirm(false);
      }, 2000);
    } else if (newCount === 2) {
      // Double click - remove immediately
      onRemove();
      setClickCount(0);
      setShowConfirm(false);
    }
  };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    data: { type },
    disabled: !sortableEnabled
  });
  const style = transform ? { transform: CSS.Transform.toString(transform), transition } : undefined;

  const isRecommended = (entry.recommendedBy?.length ?? 0) > 0;
  const recTitle = watchlistRecommendedTitle(entry);

  return (
    <div
      ref={setNodeRef}
      className={`entry-row-wrapper ${isDragging ? 'entry-row-wrapper--dragging' : ''}`}
      style={style}
      data-watchlist-id={entry.id}
      onPointerEnter={handlePointerEnter}
      {...attributes}
      {...listeners}
    >
      <div
        className={`entry-row ${minimized ? 'entry-row-minimized' : ''} ${hasWatched ? 'watched' : ''} ${isRecommended ? 'watchlist-entry--recommended' : ''}`}
        data-recommended-tooltip={isRecommended && recTitle ? recTitle : undefined}
        title={recTitle}
      >
        <div className="entry-poster">
          {entry.posterPath ? (
            <img
              src={tmdbImagePath(entry.posterPath, 'w300') || undefined}
              alt={entry.title}
              loading="lazy"
            />
          ) : (
            <span>
              {type === 'movies' ? '🎬' : '📺'}
            </span>
          )}
        </div>
        <div className="entry-content">
          <div className="entry-left-col">
            <div className="entry-title-row">
              <h3 className="entry-title">{entry.title}</h3>
              {onInfo && (
                <button
                  type="button"
                  className="entry-title-info-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInfo();
                  }}
                  title="Info"
                >
                  <Info size={14} />
                </button>
              )}
            </div>
            {!minimized && (
              <>
                <div className="entry-stats-row">
                  <div className="entry-stat-pill">
                    {formatYear(entry.releaseDate)}
                  </div>
                  {isUnreleased(entry.releaseDate) && (
                    <div className="entry-stat-pill">
                      {formatDate(entry.releaseDate)}
                    </div>
                  )}
                  {(runtimeMinutes || fetchedRuntime) && (
                    <div className="entry-stat-pill">
                      {formatRuntimeMinutes(runtimeMinutes || fetchedRuntime!)}
                    </div>
                  )}
                </div>
                {providers && providers.length > 0 && (
                  <div className="entry-details">
                    {providers?.slice(0, 3).map((provider, idx) => (
                      <div key={idx} className="entry-detail-pill">
                        <img
                          src={tmdbImagePath(provider.logo_path, 'w45') || undefined}
                          alt={provider.provider_name}
                          title={provider.provider_name}
                          style={{ width: '18px', height: '18px', borderRadius: '3px', marginRight: '4px' }}
                          loading="lazy"
                        />
                        {provider.provider_name}
                        {provider.type === 'subs' && (
                          <span style={{ color: '#4ade80', marginLeft: '4px' }}>[SUBS]</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="entry-right-col">
            <div className="entry-controls">
              <button
                type="button"
                className="entry-record-first"
                onClick={(e) => {
                  e.stopPropagation();
                  onRecordWatch();
                }}
                title="Record Watch"
              >
                RW
              </button>
              {!minimized && (
                <>
                  <button
                    type="button"
                    className="entry-move-btn"
                    aria-label="Move up"
                    disabled={!canMoveUp}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveUp();
                    }}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="entry-move-btn"
                    aria-label="Move down"
                    disabled={!canMoveDown}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveDown();
                    }}
                    title="Move down"
                  >
                    ↓
                  </button>
                </>
              )}
              <button
                type="button"
                className={`entry-config-btn ${showConfirm ? 'confirming' : ''}`}
                aria-label="Remove from watchlist"
                onClick={handleClick}
                title="Remove"
              >
                {showConfirm ? '✓' : '✕'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WatchlistPage() {
  const navigate = useNavigate();
  const {
    movies,
    tv,
    reorderWatchlist,
    removeFromWatchlist,
    watchingNextMovieIds,
    watchingNextTvIds,
    setWatchingNextMovieIds,
    setWatchingNextTvIds
  } = useWatchlistStore();
  const { settings, updateSettings } = useSettingsStore();
  const { isMobile } = useMobileViewMode();
  const { friends } = useFriends();
  const {
    byClass: moviesByClass,
    getMovieById,
    addMovieFromSearch,
    addWatchToMovie,
    moveItemToClass,
    updateMovieCache,
    classOrder,
    getClassLabel,
    getClassTagline,
    removeMovieEntry
  } = useMoviesStore();
  const {
    byClass: tvByClass,
    getShowById,
    addShowFromSearch,
    addWatchToShow,
    moveItemToClass: moveShowToClass,
    updateShowCache,
    classOrder: tvClassOrder,
    getClassLabel: getTvClassLabel,
    getClassTagline: getTvClassTagline,
    removeShowEntry
  } = useTvStore();
  const {
    getEditableListsForMediaType,
    getSelectedListIdsForEntry,
    setEntryListMembership,
    collectionIdsByEntryId,
    globalCollections
  } = useListsStore();
  const [recordTarget, setRecordTarget] = useState<UniversalEditTarget | null>(null);
  const [recordWatchlistId, setRecordWatchlistId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [watchlistVisibilityMode, setWatchlistVisibilityMode] = useState<WatchlistVisibilityMode>('ALL');
  const [showRecommendedOnly, setShowRecommendedOnly] = useState(false);
  const watchlistOverlapMovieIds = useMemo(() => movies.map((m) => m.id), [movies]);
  const watchlistOverlapTvIds = useMemo(() => tv.map((t) => t.id), [tv]);
  const {
    isOverlapModalOpen,
    setIsOverlapModalOpen,
    friendModes,
    setFriendModes,
    friendModesDraft,
    setFriendModesDraft,
    isLoadingOverlap,
    friendWatchlists,
    friendWatchlistErrors,
    refreshingFriendUids,
    refreshFriendWatchlist,
    overlapMovieIdSet,
    overlapTvIdSet,
  } = useWatchlistFriendOverlap(
    true,
    friends.map((f) => f.uid),
    watchlistOverlapMovieIds,
    watchlistOverlapTvIds
  );
  const [isMyServicesModalOpen, setIsMyServicesModalOpen] = useState(false);
  const [providerCatalogLoading, setProviderCatalogLoading] = useState(false);
  const [providerCatalog, setProviderCatalog] = useState<TmdbWatchProvider[]>(() => {
    try {
      const raw = sessionStorage.getItem(WATCH_PROVIDER_CATALOG_SESSION_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as TmdbWatchProvider[];
    } catch {
      return [];
    }
  });
  const [watchProviders, setWatchProviders] = useState<Record<string, Array<TmdbWatchProvider & { type: 'subs' | 'rent' }>>>(() => {
    try {
      const raw = sessionStorage.getItem(WATCH_PROVIDERS_SESSION_KEY);
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, Array<TmdbWatchProvider & { type: 'subs' | 'rent' }>>;
    } catch {
      return {};
    }
  });
  const [infoModalTarget, setInfoModalTarget] = useState<{ tmdbId: number; title: string; posterPath?: string; releaseDate?: string; mediaType: 'movie' | 'tv' } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(WATCHING_NEXT_STORAGE_KEY_MOVIES, JSON.stringify(watchingNextMovieIds));
    } catch {
      /* ignore */
    }
  }, [watchingNextMovieIds]);

  useEffect(() => {
    try {
      localStorage.setItem(WATCHING_NEXT_STORAGE_KEY_TV, JSON.stringify(watchingNextTvIds));
    } catch {
      /* ignore */
    }
  }, [watchingNextTvIds]);

  useEffect(() => {
    const fetchAllProviders = async () => {
      const allEntries = [...movies, ...tv];
      const existingIds = new Set(Object.keys(watchProviders));
      const newProvidersById: Record<string, Array<TmdbWatchProvider & { type: 'subs' | 'rent' }>> = {};

      for (const entry of allEntries) {
        if (existingIds.has(entry.id)) continue;
        existingIds.add(entry.id);
        const match = entry.id.match(/^tmdb-(movie|tv)-(\d+)$/);
        if (!match) continue;
        const [, media, idStr] = match;
        const tmdbId = parseInt(idStr, 10);
        if (Number.isNaN(tmdbId)) continue;

        try {
          const res = await tmdbWatchProviders(tmdbId, media as 'movie' | 'tv');
          const us = res?.results?.US;
          if (us) {
            const combined: Array<TmdbWatchProvider & { type: 'subs' | 'rent' }> = [
              ...(us.flatrate || []).map(p => ({ ...p, type: 'subs' as const })),
              ...(us.rent || []).map(p => ({ ...p, type: 'rent' as const }))
            ];

            if (combined.length > 0) {
              newProvidersById[entry.id] = combined;
            }
          }
        } catch (err) {
          console.error(`Failed to fetch providers for ${entry.id}`, err);
        }
      }

      const newIds = Object.keys(newProvidersById);
      if (newIds.length > 0) {
        setWatchProviders((prev) => ({ ...prev, ...newProvidersById }));
      }
    };
    fetchAllProviders();
  }, [movies, tv]);

  useEffect(() => {
    try {
      sessionStorage.setItem(WATCH_PROVIDERS_SESSION_KEY, JSON.stringify(watchProviders));
    } catch {
      /* ignore cache write errors */
    }
  }, [watchProviders]);

  const handleInfo = (entry: WatchlistEntry, mediaType: 'movie' | 'tv') => {
    const match = entry.id.match(/^tmdb-(movie|tv)-(\d+)$/);
    if (!match) return;
    const [, media, idStr] = match;
    const tmdbId = parseInt(idStr, 10);
    if (Number.isNaN(tmdbId)) return;
    
    setInfoModalTarget({
      tmdbId,
      title: entry.title,
      posterPath: entry.posterPath,
      releaseDate: entry.releaseDate,
      mediaType
    });
  };

  // Track modal state
  const hasActiveModal = !!recordTarget || !!infoModalTarget || isOverlapModalOpen || isMyServicesModalOpen;

  useEffect(() => {
    try {
      sessionStorage.setItem(WATCH_PROVIDER_CATALOG_SESSION_KEY, JSON.stringify(providerCatalog));
    } catch {
      /* ignore */
    }
  }, [providerCatalog]);

  useEffect(() => {
    if (!isMyServicesModalOpen) return;
    if (providerCatalog.length > 0) return;
    let cancelled = false;
    const loadCatalog = async () => {
      setProviderCatalogLoading(true);
      try {
        const [movie, tv] = await Promise.all([
          tmdbWatchProviderCatalog('movie', { watchRegion: settings.watchRegion }),
          tmdbWatchProviderCatalog('tv', { watchRegion: settings.watchRegion }),
        ]);
        if (cancelled) return;
        setProviderCatalog(uniqProviders([...movie, ...tv]));
      } catch (err) {
        console.error('[Clastone] Failed to load provider catalog', err);
      } finally {
        if (!cancelled) setProviderCatalogLoading(false);
      }
    };
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [isMyServicesModalOpen, providerCatalog.length, settings.watchRegion]);

  const movieRankedClasses = useMemo(
    () => classOrder.map((k) => ({
      key: k,
      label: getClassLabel(k),
      tagline: getClassTagline(k),
      isRanked: k !== 'UNRANKED' && k !== 'DONT_REMEMBER' && k !== 'BABY' && k !== 'DELICIOUS_GARBAGE'
    })),
    [classOrder, getClassLabel, getClassTagline]
  );
  const tvRankedClasses = useMemo(
    () =>
      tvClassOrder
        .map((k) => ({
          key: k,
          label: getTvClassLabel(k),
          tagline: getTvClassTagline(k),
          isRanked: k !== 'UNRANKED' && k !== 'DONT_REMEMBER' && k !== 'BABY' && k !== 'DELICIOUS_GARBAGE'
        })),
    [tvClassOrder, getTvClassLabel, getTvClassTagline]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleRecordWatch = async (entry: WatchlistEntry, type: WatchlistType) => {
    const match = entry.id.match(/^tmdb-(movie|tv)-(\d+)$/);
    if (!match) return;
    const [, media, idStr] = match;
    const tmdbId = parseInt(idStr, 10);
    if (Number.isNaN(tmdbId)) return;
    const isMovie = media === 'movie';
    setRecordWatchlistId(entry.id);
    try {
      const cache = isMovie
        ? await tmdbMovieDetailsFull(tmdbId)
        : await tmdbTvDetailsFull(tmdbId);
      if (!cache) {
        setRecordWatchlistId(null);
        return;
      }
      const target: UniversalEditTarget = {
        id: entry.id,
        tmdbId,
        title: cache.title ?? entry.title,
        posterPath: cache.posterPath ?? entry.posterPath,
        mediaType: isMovie ? 'movie' : 'tv',
        subtitle: cache.releaseDate ?? entry.releaseDate,
        releaseDate: cache.releaseDate ?? entry.releaseDate,
        runtimeMinutes: 'runtimeMinutes' in cache ? cache.runtimeMinutes as number : undefined,
        totalEpisodes: 'totalEpisodes' in cache ? cache.totalEpisodes as number : undefined,
        existingClassKey: undefined,
        watchlistStatus: 'in_watchlist',
      };
      setRecordTarget(target);
    } catch {
      setRecordWatchlistId(null);
    }
  };

  const handleRecordSave = async (params: UniversalEditSaveParams, goToMovie: boolean) => {
    if (!recordTarget) return;
    const { watches, classKey: recordClassKey, position } = params;
    const keepModalOpen = Boolean(params.keepModalOpen);
    const toTop = position === 'top';
    const toMiddle = position === 'middle';
    const isMovie = recordTarget.mediaType === 'movie';
    const id = recordTarget.id;
    const existing = isMovie ? getMovieById(id) : getShowById(id);
    const existingIsUnranked = existing?.classKey === 'UNRANKED';

    const watchRecords = prepareWatchRecordsForSave(
      watchMatrixEntriesToWatchRecords(watches),
      id,
      moviesByClass,
      tvByClass,
      classOrder,
      tvClassOrder
    );

    if (isMovie) {
      if (existing) {
        const needsCache = existing.tmdbId == null || existing.overview == null;
        if (needsCache && recordTarget.tmdbId) {
          try {
            const cache = await tmdbMovieDetailsFull(recordTarget.tmdbId);
            if (cache) updateMovieCache(id, cache);
          } catch {
            /* ignore */
          }
        }
        for (const w of watchRecords) {
          addWatchToMovie(id, w, {
            posterPath: recordTarget.posterPath ?? existing.posterPath
          });
        }
        if (existingIsUnranked && recordClassKey) {
          moveItemToClass(id, recordClassKey, { toTop, toMiddle });
        }
      } else {
        if (!recordClassKey || recordClassKey === 'UNRANKED') return;
        setIsSaving(true);
        let cache = null;
        try {
          if (recordTarget.tmdbId) {
            cache = await tmdbMovieDetailsFull(recordTarget.tmdbId);
          }
        } catch {
          /* ignore */
        }
        addMovieFromSearch({
          id,
          title: recordTarget.title,
          subtitle: recordTarget.subtitle ?? '',
          classKey: recordClassKey,
          firstWatch: watchRecords[0],
          runtimeMinutes: cache?.runtimeMinutes,
          posterPath: recordTarget.posterPath ?? cache?.posterPath,
          cache: cache ?? undefined,
          toTop
        });
        // Add additional watches if any
        for (let i = 1; i < watchRecords.length; i++) {
          addWatchToMovie(id, watchRecords[i]);
        }
        setIsSaving(false);
      }
    } else {
      setIsSaving(true);
      let cache = null;
      try {
        if (recordTarget.tmdbId) {
          cache = await tmdbTvDetailsFull(recordTarget.tmdbId);
        }
      } catch {
        /* ignore */
      }
      setIsSaving(false);
      if (!cache) return;
      if (existing) {
        if (existing.tmdbId == null || existing.overview == null) {
          updateShowCache(id, cache);
        }
        for (const w of watchRecords) {
          addWatchToShow(id, w, { posterPath: cache.posterPath ?? existing.posterPath });
        }
        if (existingIsUnranked && recordClassKey) {
          moveShowToClass(id, recordClassKey, { toTop, toMiddle });
        }
      } else {
        if (!recordClassKey || recordClassKey === 'UNRANKED') return;
        addShowFromSearch({
          id,
          title: cache.title,
          subtitle: recordTarget.subtitle ?? '',
          classKey: recordClassKey,
          firstWatch: watchRecords[0],
          cache,
          toTop
        });
        // Add additional watches if any
        for (let i = 1; i < watchRecords.length; i++) {
          addWatchToShow(id, watchRecords[i]);
        }
      }
    }

    if (!keepModalOpen && recordWatchlistId) {
      removeFromWatchlist(recordWatchlistId);
      setRecordWatchlistId(null);
    }
    if (params.listMemberships?.length) {
      setEntryListMembership(recordTarget.id, recordTarget.mediaType, params.listMemberships, {
        title: recordTarget.title,
        posterPath: recordTarget.posterPath,
        releaseDate: recordTarget.releaseDate
      });
    }
    if (!keepModalOpen) {
      setRecordTarget(null);
    }
    if (goToMovie && !keepModalOpen) {
      navigate(isMovie ? '/movies' : '/tv', { replace: true, state: { scrollToId: id } });
    }
  };

  const moveWatchlistEntry = (type: WatchlistType, index: number, delta: number) => {
    const list = type === 'movies' ? [...movies] : [...tv];
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= list.length) return;
    const reordered = arrayMove(list, index, newIndex);
    reorderWatchlist(type, reordered.map((e) => e.id));
  };

  const hasWatched = (id: string): boolean => {
    const movie = getMovieById(id);
    if (movie?.watchRecords && movie.watchRecords.length > 0) return true;
    const show = getShowById(id);
    return !!(show?.watchRecords && show.watchRecords.length > 0);
  };

  const isFreeEntry = (entry: WatchlistEntry): boolean => {
    if (watchlistVisibilityMode === 'ALL') return true;
    if ((settings.myWatchProviderIds?.length ?? 0) === 0) return false;
    const providers = watchProviders[entry.id];
    const allowed = new Set(settings.myWatchProviderIds);
    // "FREE" here means: available on one of *my* subscription services.
    return !!providers?.some((p) => p.type === 'subs' && allowed.has(p.provider_id));
  };

  const visibleMovies = useMemo(() => {
    let base = movies.filter(isFreeEntry);
    if (showRecommendedOnly) base = base.filter(entryHasFriendRecommendations);
    if (!overlapMovieIdSet) return base;
    return base.filter((e) => overlapMovieIdSet.has(e.id));
  }, [movies, watchProviders, watchlistVisibilityMode, overlapMovieIdSet, showRecommendedOnly]);

  const visibleTv = useMemo(() => {
    let base = tv.filter(isFreeEntry);
    if (showRecommendedOnly) base = base.filter(entryHasFriendRecommendations);
    if (!overlapTvIdSet) return base;
    return base.filter((e) => overlapTvIdSet.has(e.id));
  }, [tv, watchProviders, watchlistVisibilityMode, overlapTvIdSet, showRecommendedOnly]);

  // Prepare search items
  const searchItems: SearchableItem[] = useMemo(() => [
    ...visibleMovies.map(entry => ({ id: entry.id, title: entry.title })),
    ...visibleTv.map(entry => ({ id: entry.id, title: entry.title }))
  ], [visibleMovies, visibleTv]);

  const handleSearchSelect = (id: string) => {
    const el = document.querySelector(`[data-watchlist-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add highlight effect
      (el as HTMLElement).classList.add('highlighted-entry');
      setTimeout(() => {
        (el as HTMLElement).classList.remove('highlighted-entry');
      }, 2000);
    }
  };

  const movieSections = separateReleasedAndUnreleased(visibleMovies, hasWatched);
  const tvSections = separateReleasedAndUnreleased(visibleTv, hasWatched);
  const jumpButtons = [
    { id: 'movies-default', label: 'Unwatched Movies', type: 'movies' as const, section: 'default' as const, count: movieSections.released.length },
    { id: 'movies-rewatch', label: 'Movie Rewatch', type: 'movies' as const, section: 'rewatch' as const, count: movieSections.rewatch.length },
    { id: 'movies-unreleased', label: 'Movie Unreleased', type: 'movies' as const, section: 'unreleased' as const, count: movieSections.unreleased.length },
    { id: 'tv-default', label: 'Unwatched Shows', type: 'tv' as const, section: 'default' as const, count: tvSections.released.length },
    { id: 'tv-rewatch', label: 'Show Rewatch', type: 'tv' as const, section: 'rewatch' as const, count: tvSections.rewatch.length },
    { id: 'tv-unreleased', label: 'Show Unreleased', type: 'tv' as const, section: 'unreleased' as const, count: tvSections.unreleased.length }
  ];

  const handleWatchlistJump = (type: WatchlistType, section: WatchlistSectionKey) => {
    const targetId = getWatchlistSectionId(type, section);
    const el = document.getElementById(targetId);
    if (!el) return;
    const offset = 72;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  const sortableEnabled = watchlistVisibilityMode === 'ALL' && !isMobile;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;
    const type = active.data.current?.type as WatchlistType | undefined;
    if (!type) return;

    const fullList = type === 'movies' ? movies : tv;
    const entries = type === 'movies' ? visibleMovies : visibleTv;
    const watchingIds = type === 'movies' ? watchingNextMovieIds : watchingNextTvIds;

    const activeContainer = active.data.current?.sortable?.containerId as string | undefined;
    const overContainer = over.data.current?.sortable?.containerId as string | undefined;
    const activeSection = (active.data.current?.section as string | undefined) ?? 'released';

    const fullPart = separateReleasedAndUnreleased(fullList, hasWatched);
    const visPart = separateReleasedAndUnreleased(entries, hasWatched);
    const wFull = sanitizeWatchingNextIds(watchingIds, fullPart.released, fullPart.rewatch, fullPart.unreleased);
    const watchSet = new Set(wFull);

    if (activeContainer === `wl-${type}-watching`) {
      if (overContainer !== `wl-${type}-watching`) return;
      const visAllow = new Set(
        [...visPart.released, ...visPart.rewatch, ...visPart.unreleased].map((e) => e.id)
      );
      const visibleOrdered = wFull.filter((id) => visAllow.has(id));
      const newIds = reorderWatchingNextIdsInPlace(watchingIds, visibleOrdered, String(active.id), String(over.id));
      const newFull = rebuildFullListFromWatchingNext(fullList, hasWatched, newIds);
      reorderWatchlist(type, newFull.map((e) => e.id));
      if (type === 'movies') setWatchingNextMovieIds(newIds);
      else setWatchingNextTvIds(newIds);
      return;
    }

    const { released: visReleased, rewatch: visRewatch, unreleased: visUnreleased } = visPart;

    if (
      activeSection === 'released' &&
      activeContainer === `wl-${type}-rest` &&
      overContainer === `wl-${type}-rest`
    ) {
      const visReleasedIds = new Set(visReleased.map((e) => e.id));
      const watchingReleasedOrdered = wFull
        .filter((id) => visReleasedIds.has(id))
        .map((id) => visReleased.find((e) => e.id === id))
        .filter(Boolean) as WatchlistEntry[];
      const wRelCount = watchingReleasedOrdered.length;
      const releasedRest = visReleased.filter((e) => !watchSet.has(e.id));
      const combined = [...watchingReleasedOrdered, ...releasedRest];
      const oldIndex = combined.findIndex((e) => e.id === active.id);
      const newIndex = combined.findIndex((e) => e.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      if (oldIndex < wRelCount || newIndex < wRelCount) return;
      const newCombined = arrayMove(combined, oldIndex, newIndex);
      const newFullList = applySubsequenceOrder(fullList, visReleased, newCombined);
      reorderWatchlist(type, newFullList.map((e) => e.id));
      return;
    }

    if (
      activeSection === 'rewatch' &&
      activeContainer === `wl-${type}-rewatch` &&
      overContainer === `wl-${type}-rewatch`
    ) {
      const visRewIds = new Set(visRewatch.map((e) => e.id));
      const wRew = wFull
        .filter((id) => visRewIds.has(id))
        .map((id) => visRewatch.find((e) => e.id === id))
        .filter(Boolean) as WatchlistEntry[];
      const wRewCount = wRew.length;
      const rewatchRest = visRewatch.filter((e) => !watchSet.has(e.id));
      const combined = [...wRew, ...rewatchRest];
      const oldIndex = combined.findIndex((e) => e.id === active.id);
      const newIndex = combined.findIndex((e) => e.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      if (oldIndex < wRewCount || newIndex < wRewCount) return;
      const newCombined = arrayMove(combined, oldIndex, newIndex);
      const newFullList = applySubsequenceOrder(fullList, visRewatch, newCombined);
      reorderWatchlist(type, newFullList.map((e) => e.id));
      return;
    }

    if (
      activeSection === 'unreleased' &&
      activeContainer === `wl-${type}-unreleased` &&
      overContainer === `wl-${type}-unreleased`
    ) {
      const visUnrIds = new Set(visUnreleased.map((e) => e.id));
      const wUn = wFull
        .filter((id) => visUnrIds.has(id))
        .map((id) => visUnreleased.find((e) => e.id === id))
        .filter(Boolean) as WatchlistEntry[];
      const wUnCount = wUn.length;
      const unreleasedRest = visUnreleased.filter((e) => !watchSet.has(e.id));
      const combined = [...wUn, ...unreleasedRest];
      const oldIndex = combined.findIndex((e) => e.id === active.id);
      const newIndex = combined.findIndex((e) => e.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      if (oldIndex < wUnCount || newIndex < wUnCount) return;
      const newCombined = arrayMove(combined, oldIndex, newIndex);
      const newFullList = applySubsequenceOrder(fullList, visUnreleased, newCombined);
      reorderWatchlist(type, newFullList.map((e) => e.id));
    }
  };

  const addToWatchingNextEnd = (wt: WatchlistType, entryId: string) => {
    const fullList = wt === 'movies' ? movies : tv;
    const { released, rewatch, unreleased } = separateReleasedAndUnreleased(fullList, hasWatched);
    const allowed = new Set([...released, ...rewatch, ...unreleased].map((e) => e.id));
    if (!allowed.has(entryId)) return;
    const watchingIds = wt === 'movies' ? watchingNextMovieIds : watchingNextTvIds;
    const sanitized = sanitizeWatchingNextIds(watchingIds, released, rewatch, unreleased);
    if (sanitized.includes(entryId)) return;
    const newWatchingIds = [...sanitized, entryId];
    const newFull = rebuildFullListFromWatchingNext(fullList, hasWatched, newWatchingIds);
    reorderWatchlist(wt, newFull.map((e) => e.id));
    if (wt === 'movies') setWatchingNextMovieIds(newWatchingIds);
    else setWatchingNextTvIds(newWatchingIds);
  };

  const removeWatchingNextToRestTop = (wt: WatchlistType, entryId: string) => {
    const fullList = wt === 'movies' ? movies : tv;
    const { released, rewatch, unreleased } = separateReleasedAndUnreleased(fullList, hasWatched);
    const watchingIds = wt === 'movies' ? watchingNextMovieIds : watchingNextTvIds;
    const sanitized = sanitizeWatchingNextIds(watchingIds, released, rewatch, unreleased);
    if (!sanitized.includes(entryId)) return;
    const nextWatchingIds = sanitized.filter((id) => id !== entryId);
    const newFull = rebuildAfterRemoveFromWatchingNext(fullList, hasWatched, nextWatchingIds, entryId);
    reorderWatchlist(wt, newFull.map((e) => e.id));
    if (wt === 'movies') setWatchingNextMovieIds(nextWatchingIds);
    else setWatchingNextTvIds(nextWatchingIds);
  };

  const renderSeparatedWatchlist = (
    entries: WatchlistEntry[],
    type: WatchlistType
  ) => {
    const fullList = type === 'movies' ? movies : tv;
    const visPart = separateReleasedAndUnreleased(entries, hasWatched);
    const fullPart = separateReleasedAndUnreleased(fullList, hasWatched);
    const watchingIdsRaw = type === 'movies' ? watchingNextMovieIds : watchingNextTvIds;
    const sanitizedWatchIds = sanitizeWatchingNextIds(
      watchingIdsRaw,
      fullPart.released,
      fullPart.rewatch,
      fullPart.unreleased
    );
    const visAllow = new Set(
      [...visPart.released, ...visPart.rewatch, ...visPart.unreleased].map((e) => e.id)
    );
    const displayWatchIds = sanitizedWatchIds.filter((id) => visAllow.has(id));
    const watchSet = new Set(sanitizedWatchIds);
    const { released, rewatch, unreleased } = visPart;
    const resolveEntry = (id: string) =>
      released.find((e) => e.id === id) ??
      rewatch.find((e) => e.id === id) ??
      unreleased.find((e) => e.id === id);
    const watchingNext = displayWatchIds.map((id) => resolveEntry(id)).filter(Boolean) as WatchlistEntry[];
    const releasedRest = released.filter((e) => !watchSet.has(e.id));
    const rewatchRest = rewatch.filter((e) => !watchSet.has(e.id));
    const unreleasedRest = unreleased.filter((e) => !watchSet.has(e.id));

    const hasMediaSection = released.length > 0 || rewatch.length > 0 || unreleased.length > 0;
    const showDefaultBlock = watchingNext.length > 0 || releasedRest.length > 0;
    const showRewatchDivider =
      rewatchRest.length > 0 && (watchingNext.length > 0 || releasedRest.length > 0);
    const showUnreleasedDivider =
      unreleasedRest.length > 0 &&
      (watchingNext.length > 0 || releasedRest.length > 0 || rewatchRest.length > 0);

    return (
      <>
        {hasMediaSection && (
          <>
            {showDefaultBlock && (
              <div id={getWatchlistSectionId(type, 'default')}>
                {watchingNext.length > 0 && (
                  <>
                    <WatchingNextHeader />
                    <div className="class-section-rows class-section-rows--tile">
                      <SortableContext
                        id={`wl-${type}-watching`}
                        items={watchingNext.map((e) => e.id)}
                        strategy={horizontalListSortingStrategy}
                      >
                        {watchingNext.map((entry) => (
                          <WatchlistTile
                            key={entry.id}
                            entry={entry}
                            runtimeMinutes={
                              type === 'movies'
                                ? getMovieById(entry.id)?.runtimeMinutes
                                : getShowById(entry.id)?.runtimeMinutes
                            }
                            type={type}
                            onRecordWatch={() => handleRecordWatch(entry, type)}
                            onRemove={() => removeFromWatchlist(entry.id)}
                            hasWatched={hasWatched(entry.id)}
                            providers={watchProviders[entry.id]}
                            sortableEnabled={sortableEnabled}
                            sortableSection="watching"
                            showWatchingNextRemove
                            onRemoveWatchingNext={() => removeWatchingNextToRestTop(type, entry.id)}
                            onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                          />
                        ))}
                      </SortableContext>
                    </div>
                  </>
                )}

                {releasedRest.length > 0 && (
                  <>
                    <div className="watchlist-divider">
                      <div className="watchlist-divider-line"></div>
                      <div className="watchlist-divider-label">Backlog</div>
                      <div className="watchlist-divider-line"></div>
                    </div>
                    <div className="class-section-rows class-section-rows--tile">
                      <SortableContext
                        id={`wl-${type}-rest`}
                        items={releasedRest.map((e) => e.id)}
                        strategy={horizontalListSortingStrategy}
                      >
                        {releasedRest.map((entry) => (
                          <WatchlistTile
                            key={entry.id}
                            entry={entry}
                            runtimeMinutes={
                              type === 'movies'
                                ? getMovieById(entry.id)?.runtimeMinutes
                                : getShowById(entry.id)?.runtimeMinutes
                            }
                            type={type}
                            onRecordWatch={() => handleRecordWatch(entry, type)}
                            onRemove={() => removeFromWatchlist(entry.id)}
                            hasWatched={hasWatched(entry.id)}
                            providers={watchProviders[entry.id]}
                            sortableEnabled={sortableEnabled}
                            sortableSection="released"
                            showWatchingNextAdd
                            onAddWatchingNext={() => addToWatchingNextEnd(type, entry.id)}
                            onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                          />
                        ))}
                      </SortableContext>
                    </div>
                  </>
                )}
              </div>
            )}

            {showRewatchDivider && (
              <div className="watchlist-divider">
                <div className="watchlist-divider-line"></div>
                <div className="watchlist-divider-label">Rewatch</div>
                <div className="watchlist-divider-line"></div>
              </div>
            )}

            {rewatchRest.length > 0 && (
              <div id={getWatchlistSectionId(type, 'rewatch')}>
                <div className="class-section-rows class-section-rows--tile class-section-rows--rewatch">
                  <SortableContext
                    id={`wl-${type}-rewatch`}
                    items={rewatchRest.map((e) => e.id)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {rewatchRest.map((entry) => (
                      <WatchlistTile
                        key={entry.id}
                        entry={entry}
                        runtimeMinutes={
                          type === 'movies'
                            ? getMovieById(entry.id)?.runtimeMinutes
                            : getShowById(entry.id)?.runtimeMinutes
                        }
                        type={type}
                        onRecordWatch={() => handleRecordWatch(entry, type)}
                        onRemove={() => removeFromWatchlist(entry.id)}
                        hasWatched={hasWatched(entry.id)}
                        providers={watchProviders[entry.id]}
                        sortableEnabled={sortableEnabled}
                        sortableSection="rewatch"
                        showWatchingNextAdd
                        onAddWatchingNext={() => addToWatchingNextEnd(type, entry.id)}
                        onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                      />
                    ))}
                  </SortableContext>
                </div>
              </div>
            )}

            {showUnreleasedDivider && (
              <div className="watchlist-divider">
                <div className="watchlist-divider-line"></div>
                <div className="watchlist-divider-label">Unreleased</div>
                <div className="watchlist-divider-line"></div>
              </div>
            )}

            {unreleasedRest.length > 0 && (
              <div id={getWatchlistSectionId(type, 'unreleased')}>
                <div className="class-section-rows class-section-rows--tile class-section-rows--unreleased">
                  <SortableContext
                    id={`wl-${type}-unreleased`}
                    items={unreleasedRest.map((e) => e.id)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {unreleasedRest.map((entry) => (
                      <WatchlistTile
                        key={entry.id}
                        entry={entry}
                        runtimeMinutes={
                          type === 'movies'
                            ? getMovieById(entry.id)?.runtimeMinutes
                            : getShowById(entry.id)?.runtimeMinutes
                        }
                        type={type}
                        onRecordWatch={() => handleRecordWatch(entry, type)}
                        onRemove={() => removeFromWatchlist(entry.id)}
                        hasWatched={hasWatched(entry.id)}
                        providers={watchProviders[entry.id]}
                        sortableEnabled={sortableEnabled}
                        sortableSection="unreleased"
                        showWatchingNextAdd
                        onAddWatchingNext={() => addToWatchingNextEnd(type, entry.id)}
                        onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                      />
                    ))}
                  </SortableContext>
                </div>
              </div>
            )}
          </>
        )}
      </>
    );
  };

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Watchlist</h1>
          <RandomQuote />
        </div>
        {!hasActiveModal && (
          <div className="page-actions-row">
            <button
              type="button"
              className={`watchlist-overlap-open-btn ${Object.values(friendModes).some(Boolean) ? 'watchlist-overlap-open-btn--active' : ''}`}
              onClick={() => {
                setFriendModesDraft(friendModes);
                setIsOverlapModalOpen(true);
              }}
              title="Show only items on all selected friends' watchlists"
            >
              View Friend Overlap
            </button>
            <button
              type="button"
              className={`watchlist-recommended-toggle-btn ${showRecommendedOnly ? 'watchlist-recommended-toggle-btn--active' : ''}`}
              onClick={() => setShowRecommendedOnly((v) => !v)}
              title={showRecommendedOnly ? 'Show entire watchlist' : 'Show only titles recommended by friends'}
            >
              Recommended
            </button>
            <button
              type="button"
              className={`watchlist-services-open-btn ${(settings.myWatchProviderIds?.length ?? 0) > 0 ? 'watchlist-services-open-btn--active' : ''}`}
              onClick={() => setIsMyServicesModalOpen(true)}
              title="Pick which streaming services you have"
            >
              My services
            </button>
            <div className="watchlist-visibility-toggle">
              <button
                type="button"
                className={`watchlist-visibility-btn ${watchlistVisibilityMode === 'ALL' ? 'watchlist-visibility-btn--active' : ''}`}
                onClick={() => setWatchlistVisibilityMode('ALL')}
              >
                All
              </button>
              <button
                type="button"
                className={`watchlist-visibility-btn ${watchlistVisibilityMode === 'FREE' ? 'watchlist-visibility-btn--active' : ''}`}
                onClick={() => {
                  if ((settings.myWatchProviderIds?.length ?? 0) === 0) {
                    setIsMyServicesModalOpen(true);
                    return;
                  }
                  setWatchlistVisibilityMode('FREE');
                }}
                disabled={(settings.myWatchProviderIds?.length ?? 0) === 0}
                title={(settings.myWatchProviderIds?.length ?? 0) === 0 ? 'Select services first' : undefined}
              >
                Free
              </button>
            </div>
          </div>
        )}
      </header>

      {!hasActiveModal && (
        <PageSearch
          items={searchItems}
          onSelect={handleSearchSelect}
          placeholder="Search watchlist..."
          pageKey="watchlist"
        />
      )}

      <div className="watchlist-page ranked-list--sortable">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="watchlist-sections">
            <section className="watchlist-section class-section">
              <header className="class-section-header">
                <h3 className="class-section-title">Movies</h3>
                <p className="class-section-count">{visibleMovies.length} entries</p>
              </header>
              {renderSeparatedWatchlist(visibleMovies, 'movies')}
            </section>

            <section className="watchlist-section class-section">
              <header className="class-section-header">
                <h3 className="class-section-title">TV Shows</h3>
                <p className="class-section-count">{visibleTv.length} entries</p>
              </header>
              {renderSeparatedWatchlist(visibleTv, 'tv')}
            </section>
          </div>
        </DndContext>
      </div>
      <div className="watchlist-jump-bar">
        {jumpButtons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            className="watchlist-jump-btn"
            onClick={() => handleWatchlistJump(btn.type, btn.section)}
            disabled={btn.count === 0}
            title={btn.label}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {recordTarget && (
        <UniversalEditModal
          target={recordTarget}
          rankedClasses={recordTarget.mediaType === 'movie' ? movieRankedClasses : tvRankedClasses}
          initialWatches={
            recordTarget.mediaType === 'movie'
              ? (() => {
                  const tmdbId = recordTarget.tmdbId || 0;
                  const status = getMovieById(recordTarget.id);
                  return status?.watchRecords || [];
                })()
              : (() => {
                  const tmdbId = recordTarget.tmdbId || 0;
                  const status = getShowById(recordTarget.id);
                  return status?.watchRecords || [];
                })()
          }
          currentClassKey={
            recordTarget.mediaType === 'movie'
              ? getMovieById(recordTarget.id)?.classKey
              : getShowById(recordTarget.id)?.classKey
          }
          currentClassLabel={
            recordTarget.mediaType === 'movie'
              ? getClassLabel(getMovieById(recordTarget.id)?.classKey ?? '')
              : getTvClassLabel(getShowById(recordTarget.id)?.classKey ?? '')
          }
          isWatchlistItem={true}
          availableTags={getEditableListsForMediaType(recordTarget.mediaType).map((list) => ({
            listId: list.id,
            label: list.name,
            color: list.color,
            selected: getSelectedListIdsForEntry(recordTarget.id).includes(list.id),
            editableInWatchModal: list.allowWatchModalTagEditing !== false,
            href: `/lists/${list.id}`
          }))}
          collectionTags={(collectionIdsByEntryId.get(recordTarget.id) ?? []).map((id) => ({
            id,
            label: globalCollections.find((item) => item.id === id)?.name ?? id,
            color: globalCollections.find((item) => item.id === id)?.color,
            href: `/lists/collection/${id}`
          }))}
          onTagToggle={(listId, selected) => {
            setEntryListMembership(recordTarget.id, recordTarget.mediaType, [{ listId, selected }], {
              title: recordTarget.title,
              posterPath: recordTarget.posterPath,
              releaseDate: recordTarget.releaseDate
            });
          }}
          onGoPickTemplate={() => {
            const mt = recordTarget.mediaType;
            setRecordTarget(null);
            setRecordWatchlistId(null);
            navigate(mt === 'movie' ? '/movies#movie-class-templates' : '/tv#tv-class-templates', { replace: true });
          }}
          onSave={handleRecordSave}
          onClose={() => {
            setRecordTarget(null);
            setRecordWatchlistId(null);
          }}
          onRemoveEntry={(id: string) => {
            if (recordTarget.mediaType === 'movie') removeMovieEntry(id);
            else removeShowEntry(id);
            if (recordWatchlistId) removeFromWatchlist(recordWatchlistId);
            setRecordTarget(null);
            setRecordWatchlistId(null);
          }}
          isSaving={isSaving}
        />
      )}

      {/* Info Modal */}
      {infoModalTarget && (
        <InfoModal
          isOpen={!!infoModalTarget}
          onClose={() => setInfoModalTarget(null)}
          tmdbId={infoModalTarget.tmdbId}
          mediaType={infoModalTarget.mediaType}
          title={infoModalTarget.title}
          posterPath={infoModalTarget.posterPath}
          releaseDate={infoModalTarget.releaseDate}
          collectionTags={infoModalTarget.mediaType === 'movie'
            ? (collectionIdsByEntryId.get(`tmdb-movie-${infoModalTarget.tmdbId}`) ?? []).map((id) => ({
                id,
                label: globalCollections.find((item) => item.id === id)?.name ?? id,
                color: globalCollections.find((item) => item.id === id)?.color,
              }))
            : []}
        />
      )}

      <WatchlistFriendOverlapModal
        isOpen={isOverlapModalOpen}
        friends={friends}
        selectedModes={friendModesDraft}
        isLoading={isLoadingOverlap}
        onClose={() => {
          setIsOverlapModalOpen(false);
          setFriendModesDraft(friendModes);
        }}
        onSelectionChange={(modes) => setFriendModesDraft(modes)}
        onCommit={(modes) => {
          setFriendModes(modes);
          setIsOverlapModalOpen(false);
        }}
        myMovieIds={movies.map((m) => m.id)}
        myTvIds={tv.map((t) => t.id)}
        friendWatchlists={friendWatchlists}
        friendWatchlistErrors={friendWatchlistErrors}
        refreshingFriendUids={refreshingFriendUids}
        onFriendToggle={(uid) => {
          void refreshFriendWatchlist(uid);
        }}
      />

      <MyServicesModal
        isOpen={isMyServicesModalOpen}
        onClose={() => setIsMyServicesModalOpen(false)}
        providers={providerCatalog}
        selectedProviderIds={settings.myWatchProviderIds ?? []}
        onSelectionChange={(ids) => {
          updateSettings({ myWatchProviderIds: ids });
        }}
        isLoading={providerCatalogLoading}
      />
    </section>
  );
}
