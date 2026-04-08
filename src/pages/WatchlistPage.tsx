import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import { RandomQuote } from '../components/RandomQuote';
import { PageSearch, type SearchableItem } from '../components/PageSearch';
import { ViewToggle } from '../components/ViewToggle';
import { useMobileViewMode } from '../hooks/useMobileViewMode';
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
  useSensors
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useWatchlistStore, type WatchlistEntry, type WatchlistType } from '../state/watchlistStore';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { tmdbImagePath, tmdbMovieDetailsFull, tmdbTvDetailsFull, tmdbWatchProviderCatalog, tmdbWatchProviders, type TmdbWatchProvider } from '../lib/tmdb';
import { UniversalEditModal, type UniversalEditTarget, type UniversalEditSaveParams } from '../components/UniversalEditModal';
import { db } from '../lib/firebase';
import { loadWatchlist, type WatchlistData } from '../lib/firestoreWatchlist';
import './WatchlistPage.css';

type WatchlistSectionKey = 'default' | 'rewatch' | 'unreleased';
type WatchlistVisibilityMode = 'ALL' | 'FREE';

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

function FriendOverlapModal({
  isOpen,
  friends,
  selectedUids,
  onClose,
  onSelectionChange,
  onCommit,
  isLoading,
  myMovieIds,
  myTvIds,
  friendWatchlists,
  friendWatchlistErrors,
}: {
  isOpen: boolean;
  friends: Array<{ uid: string; username: string }>;
  selectedUids: string[];
  onClose: () => void;
  onSelectionChange: (uids: string[]) => void;
  onCommit: (uids: string[]) => void;
  isLoading: boolean;
  myMovieIds: string[];
  myTvIds: string[];
  friendWatchlists: Record<string, WatchlistData>;
  friendWatchlistErrors: Record<string, true | undefined>;
}) {
  const selected = useMemo(() => new Set(selectedUids), [selectedUids]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = orig || 'unset';
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

  const toggleUid = (uid: string) => {
    const next = new Set(selected);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    onSelectionChange(Array.from(next));
  };

  const selectedArray = selectedUids;
  const selectedCount = selectedArray.length;

  const preview = useMemo(() => {
    // Preview is computed from "my list" intersected with all selected friends.
    // If any selected friend data isn't loaded yet, show loading state.
    if (selectedCount === 0) {
      return { loading: false, unavailable: false, movies: myMovieIds.length, tv: myTvIds.length };
    }

    const hasError = selectedArray.some((uid) => friendWatchlistErrors[uid]);
    if (hasError) return { loading: false, unavailable: true, movies: 0, tv: 0 };

    const missing = selectedArray.some((uid) => !friendWatchlists[uid]);
    if (missing) return { loading: true, unavailable: false, movies: 0, tv: 0 };

    const movieIntersection = new Set<string>(myMovieIds);
    const tvIntersection = new Set<string>(myTvIds);

    for (const uid of selectedArray) {
      const wl = friendWatchlists[uid];
      const friendMovieIds = new Set(wl.movies.map((m) => m.id));
      const friendTvIds = new Set(wl.tv.map((t) => t.id));

      for (const id of Array.from(movieIntersection)) {
        if (!friendMovieIds.has(id)) movieIntersection.delete(id);
      }
      for (const id of Array.from(tvIntersection)) {
        if (!friendTvIds.has(id)) tvIntersection.delete(id);
      }
    }

    return {
      loading: false,
      unavailable: false,
      movies: movieIntersection.size,
      tv: tvIntersection.size,
    };
  }, [selectedArray, selectedCount, friendWatchlists, friendWatchlistErrors, myMovieIds, myTvIds]);

  if (!isOpen) return null;

  return (
    <div className="watchlist-overlap-backdrop" onClick={onClose}>
      <div className="watchlist-overlap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="watchlist-overlap-modal-header">
          <div className="watchlist-overlap-modal-title">View overlap with friends</div>
          <button type="button" className="watchlist-overlap-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="watchlist-overlap-modal-body">
          <div className="watchlist-overlap-preview">
            <div className="watchlist-overlap-preview-row">
              <span className="watchlist-overlap-preview-label">Your watchlist</span>
              <span className="watchlist-overlap-preview-value">Movies {myMovieIds.length} · Shows {myTvIds.length}</span>
            </div>
            <div className="watchlist-overlap-preview-row">
              <span className="watchlist-overlap-preview-label">After overlap</span>
              <span className="watchlist-overlap-preview-value">
                {preview.loading
                  ? 'Loading…'
                  : preview.unavailable
                    ? 'Unavailable'
                    : `Movies ${preview.movies} · Shows ${preview.tv}`}
              </span>
            </div>
            <div className="watchlist-overlap-preview-row watchlist-overlap-preview-row--muted">
              <span className="watchlist-overlap-preview-label">Selected friends</span>
              <span className="watchlist-overlap-preview-value">{selectedCount}</span>
            </div>
          </div>

          {friends.length === 0 ? (
            <div className="watchlist-overlap-empty">
              You don&apos;t have any friends added yet.
            </div>
          ) : (
            <div className="watchlist-overlap-friends-list" role="list">
              {friends.map((f) => {
                const checked = selected.has(f.uid);
                return (
                  <label key={f.uid} className="watchlist-overlap-friend-row" role="listitem">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleUid(f.uid)}
                    />
                    <div className="watchlist-overlap-friend-meta">
                      <div className="watchlist-overlap-friend-name">{f.username}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="watchlist-overlap-modal-footer">
          <button
            type="button"
            className="watchlist-overlap-btn watchlist-overlap-btn--ghost"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="watchlist-overlap-btn watchlist-overlap-btn--primary"
            onClick={() => onCommit(selectedArray)}
            disabled={isLoading}
            title={friends.length === 0 ? 'Add friends first' : undefined}
          >
            {isLoading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
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
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = orig || 'unset';
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

function formatDate(releaseDate?: string): string {
  if (!releaseDate) return '';
  const date = new Date(releaseDate);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sortUnreleasedByDate(entries: WatchlistEntry[]): WatchlistEntry[] {
  return [...entries]
    .filter(entry => isUnreleased(entry.releaseDate))
    .sort((a, b) => {
      if (!a.releaseDate) return 1;
      if (!b.releaseDate) return -1;
      return new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime();
    });
}

function separateReleasedAndUnreleased(entries: WatchlistEntry[], hasWatched: (id: string) => boolean): { released: WatchlistEntry[]; rewatch: WatchlistEntry[]; unreleased: WatchlistEntry[] } {
  const released: WatchlistEntry[] = [];
  const rewatch: WatchlistEntry[] = [];
  const unreleased: WatchlistEntry[] = [];
  
  entries.forEach(entry => {
    if (isUnreleased(entry.releaseDate)) {
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

function WatchlistTile({
  entry,
  type,
  onRecordWatch,
  onRemove,
  hasWatched,
  providers,
  onInfo,
  sortableEnabled = true,
  runtimeMinutes
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
    data: { type },
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

  return (
    <div 
      className={`entry-tile ${hasWatched ? 'watched' : ''} ${isDragging ? 'watchlist-tile--dragging' : ''}`}
      data-watchlist-id={entry.id}
      ref={setNodeRef}
      style={style}
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
      <div className={`entry-row ${minimized ? 'entry-row-minimized' : ''} ${hasWatched ? 'watched' : ''}`}>
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
  const { movies, tv, reorderWatchlist, removeFromWatchlist } = useWatchlistStore();
  const { settings, updateSettings } = useSettingsStore();
  const { mode: mobileViewMode } = useMobileViewMode();
  // On mobile this is forced to 'tile'; on desktop it follows user settings
  const activeViewMode = mobileViewMode;
  const { friends } = useFriends();
  const {
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
  const [recordTarget, setRecordTarget] = useState<UniversalEditTarget | null>(null);
  const [recordWatchlistId, setRecordWatchlistId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [watchlistVisibilityMode, setWatchlistVisibilityMode] = useState<WatchlistVisibilityMode>('ALL');
  const [isOverlapModalOpen, setIsOverlapModalOpen] = useState(false);
  const [overlapFriendUids, setOverlapFriendUids] = useState<string[]>([]);
  const [overlapFriendUidsDraft, setOverlapFriendUidsDraft] = useState<string[]>([]);
  const [isLoadingOverlap, setIsLoadingOverlap] = useState(false);
  const [friendWatchlists, setFriendWatchlists] = useState<Record<string, WatchlistData>>({});
  const [friendWatchlistErrors, setFriendWatchlistErrors] = useState<Record<string, true | undefined>>({});
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

  useEffect(() => {
    if (!db) return;
    const active = isOverlapModalOpen ? overlapFriendUidsDraft : overlapFriendUids;
    if (active.length === 0) return;

    const missing = active.filter((uid) => !friendWatchlists[uid]);
    if (missing.length === 0) return;

    let cancelled = false;
    const loadMissing = async () => {
      setIsLoadingOverlap(true);
      try {
        const results = await Promise.all(
          missing.map(async (uid) => {
            try {
              const res = await loadWatchlist(db!, uid);
              return [
                uid,
                {
                  movies: Array.from(res.movies ?? []) as WatchlistData['movies'],
                  tv: Array.from(res.tv ?? []) as WatchlistData['tv'],
                },
              ] as const;
            } catch (err) {
              console.error('[Watchlist overlap] Failed to load friend watchlist', { uid, err });
              // This frequently happens if an ad blocker blocks Firestore requests.
              setFriendWatchlistErrors((prev) => ({ ...prev, [uid]: true }));
              return [uid, { movies: [] as WatchlistData['movies'], tv: [] as WatchlistData['tv'] }] as const;
            }
          })
        );
        if (cancelled) return;
        setFriendWatchlists((prev) => {
          const next = { ...prev };
          for (const [uid, data] of results) next[uid] = data;
          return next;
        });
      } finally {
        if (!cancelled) setIsLoadingOverlap(false);
      }
    };

    loadMissing();
    return () => {
      cancelled = true;
    };
  }, [overlapFriendUids, overlapFriendUidsDraft, isOverlapModalOpen, friendWatchlists]);

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const type = active.data.current?.type as WatchlistType | undefined;
    if (!type) return;
    const list = type === 'movies' ? movies : tv;
    const oldIndex = list.findIndex((e) => e.id === active.id);
    const newIndex = list.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove([...list], oldIndex, newIndex);
    reorderWatchlist(type, reordered.map((e) => e.id));
  };

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
    const toTop = position === 'top';
    const toMiddle = position === 'middle';
    const isMovie = recordTarget.mediaType === 'movie';
    const id = recordTarget.id;
    const existing = isMovie ? getMovieById(id) : getShowById(id);
    const existingIsUnranked = existing?.classKey === 'UNRANKED';

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
        for (const w of watches) {
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
          firstWatch: watches[0],
          runtimeMinutes: cache?.runtimeMinutes,
          posterPath: recordTarget.posterPath ?? cache?.posterPath,
          cache: cache ?? undefined,
          toTop
        });
        // Add additional watches if any
        for (let i = 1; i < watches.length; i++) {
          addWatchToMovie(id, watches[i]);
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
        for (const w of watches) {
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
          firstWatch: watches[0],
          cache,
          toTop
        });
        // Add additional watches if any
        for (let i = 1; i < watches.length; i++) {
          addWatchToShow(id, watches[i]);
        }
      }
    }

    if (recordWatchlistId) {
      removeFromWatchlist(recordWatchlistId);
      setRecordWatchlistId(null);
    }
    setRecordTarget(null);
    if (goToMovie) {
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

  const overlapMovieIdSet = useMemo(() => {
    if (overlapFriendUids.length === 0) return null;
    const sets = overlapFriendUids
      .map((uid) => friendWatchlists[uid])
      .filter(Boolean)
      .map((w) => new Set(w.movies.map((m) => m.id)));
    if (sets.length === 0) return new Set<string>();
    // Intersection across all loaded friend sets; if any friend is not loaded yet, treat as empty.
    const out = new Set<string>(sets[0]);
    for (let i = 1; i < sets.length; i++) {
      for (const id of Array.from(out)) {
        if (!sets[i].has(id)) out.delete(id);
      }
    }
    return out;
  }, [overlapFriendUids, friendWatchlists]);

  const overlapTvIdSet = useMemo(() => {
    if (overlapFriendUids.length === 0) return null;
    const sets = overlapFriendUids
      .map((uid) => friendWatchlists[uid])
      .filter(Boolean)
      .map((w) => new Set(w.tv.map((t) => t.id)));
    if (sets.length === 0) return new Set<string>();
    const out = new Set<string>(sets[0]);
    for (let i = 1; i < sets.length; i++) {
      for (const id of Array.from(out)) {
        if (!sets[i].has(id)) out.delete(id);
      }
    }
    return out;
  }, [overlapFriendUids, friendWatchlists]);

  const visibleMovies = useMemo(() => {
    const base = movies.filter(isFreeEntry);
    if (!overlapMovieIdSet) return base;
    return base.filter((e) => overlapMovieIdSet.has(e.id));
  }, [movies, watchProviders, watchlistVisibilityMode, overlapMovieIdSet]);

  const visibleTv = useMemo(() => {
    const base = tv.filter(isFreeEntry);
    if (!overlapTvIdSet) return base;
    return base.filter((e) => overlapTvIdSet.has(e.id));
  }, [tv, watchProviders, watchlistVisibilityMode, overlapTvIdSet]);

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

  const sortableEnabled = watchlistVisibilityMode === 'ALL';

  const renderSeparatedWatchlist = (
    entries: WatchlistEntry[],
    type: WatchlistType
  ) => {
    const { released, rewatch, unreleased } = separateReleasedAndUnreleased(entries, hasWatched);
    const hasReleased = released.length > 0;
    const hasRewatch = rewatch.length > 0;
    const hasUnreleased = unreleased.length > 0;

    return (
      <>
        {hasReleased && (
          <div id={getWatchlistSectionId(type, 'default')}>
            {activeViewMode === 'tile' ? (
              <div className="class-section-rows class-section-rows--tile">
                <SortableContext items={released.map((e) => e.id)} strategy={horizontalListSortingStrategy}>
                  {released.map((entry, index) => (
                    <WatchlistTile
                      key={entry.id}
                      entry={entry}
                      runtimeMinutes={type === 'movies' ? getMovieById(entry.id)?.runtimeMinutes : getShowById(entry.id)?.runtimeMinutes}
                      type={type}
                      onRecordWatch={() => handleRecordWatch(entry, type)}
                      onRemove={() => removeFromWatchlist(entry.id)}
                      hasWatched={hasWatched(entry.id)}
                      providers={watchProviders[entry.id]}
                      sortableEnabled={sortableEnabled}
                      onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                    />
                  ))}
                </SortableContext>
              </div>
            ) : activeViewMode === 'minimized' ? (
              <div className="class-section-rows">
                <SortableContext items={released.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                  {released.map((entry, index) => (
                    <WatchlistRow
                      key={entry.id}
                      entry={entry}
                      runtimeMinutes={type === 'movies' ? getMovieById(entry.id)?.runtimeMinutes : getShowById(entry.id)?.runtimeMinutes}
                      type={type}
                      onRecordWatch={() => handleRecordWatch(entry, type)}
                      onMoveUp={() => moveWatchlistEntry(type, index, -1)}
                      onMoveDown={() => moveWatchlistEntry(type, index, 1)}
                      onRemove={() => removeFromWatchlist(entry.id)}
                      hasWatched={hasWatched(entry.id)}
                      canMoveUp={index > 0}
                      canMoveDown={index < released.length - 1}
                      providers={watchProviders[entry.id]}
                      sortableEnabled={sortableEnabled}
                      minimized={true}
                      onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                    />
                  ))}
                </SortableContext>
              </div>
            ) : (
              <div className="class-section-rows">
                <SortableContext items={released.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                  {released.map((entry, index) => (
                    <WatchlistRow
                      key={entry.id}
                      entry={entry}
                      runtimeMinutes={type === 'movies' ? getMovieById(entry.id)?.runtimeMinutes : getShowById(entry.id)?.runtimeMinutes}
                      type={type}
                      onRecordWatch={() => handleRecordWatch(entry, type)}
                      onMoveUp={() => moveWatchlistEntry(type, index, -1)}
                      onMoveDown={() => moveWatchlistEntry(type, index, 1)}
                      onRemove={() => removeFromWatchlist(entry.id)}
                      hasWatched={hasWatched(entry.id)}
                      canMoveUp={index > 0}
                      canMoveDown={index < released.length - 1}
                      providers={watchProviders[entry.id]}
                      sortableEnabled={sortableEnabled}
                      onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                    />
                  ))}
                </SortableContext>
              </div>
            )}
          </div>
        )}
        
        {(hasReleased && hasRewatch) && (
          <div className="watchlist-divider">
            <div className="watchlist-divider-line"></div>
            <div className="watchlist-divider-label">Rewatch</div>
            <div className="watchlist-divider-line"></div>
          </div>
        )}
        
        {hasRewatch && (
          <div id={getWatchlistSectionId(type, 'rewatch')}>
            {activeViewMode === 'tile' ? (
              <div className="class-section-rows class-section-rows--tile class-section-rows--rewatch">
                <SortableContext items={rewatch.map((e) => e.id)} strategy={horizontalListSortingStrategy}>
                  {rewatch.map((entry, index) => (
                    <WatchlistTile
                      key={entry.id}
                      entry={entry}
                      runtimeMinutes={type === 'movies' ? getMovieById(entry.id)?.runtimeMinutes : getShowById(entry.id)?.runtimeMinutes}
                      type={type}
                      onRecordWatch={() => handleRecordWatch(entry, type)}
                      onRemove={() => removeFromWatchlist(entry.id)}
                      hasWatched={hasWatched(entry.id)}
                      providers={watchProviders[entry.id]}
                      sortableEnabled={sortableEnabled}
                      onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                    />
                  ))}
                </SortableContext>
              </div>
            ) : activeViewMode === 'minimized' ? (
              <div className="class-section-rows class-section-rows--rewatch">
                <SortableContext items={rewatch.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                  {rewatch.map((entry, index) => (
                    <WatchlistRow
                      key={entry.id}
                      entry={entry}
                      runtimeMinutes={type === 'movies' ? getMovieById(entry.id)?.runtimeMinutes : getShowById(entry.id)?.runtimeMinutes}
                      type={type}
                      onRecordWatch={() => handleRecordWatch(entry, type)}
                      onMoveUp={() => moveWatchlistEntry(type, index, -1)}
                      onMoveDown={() => moveWatchlistEntry(type, index, 1)}
                      onRemove={() => removeFromWatchlist(entry.id)}
                      hasWatched={hasWatched(entry.id)}
                      canMoveUp={index > 0}
                      canMoveDown={index < rewatch.length - 1}
                      providers={watchProviders[entry.id]}
                      sortableEnabled={sortableEnabled}
                      minimized={true}
                      onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                    />
                  ))}
                </SortableContext>
              </div>
            ) : (
              <div className="class-section-rows class-section-rows--rewatch">
                <SortableContext items={rewatch.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                  {rewatch.map((entry, index) => (
                    <WatchlistRow
                      key={entry.id}
                      entry={entry}
                      runtimeMinutes={type === 'movies' ? getMovieById(entry.id)?.runtimeMinutes : getShowById(entry.id)?.runtimeMinutes}
                      type={type}
                      onRecordWatch={() => handleRecordWatch(entry, type)}
                      onMoveUp={() => moveWatchlistEntry(type, index, -1)}
                      onMoveDown={() => moveWatchlistEntry(type, index, 1)}
                      onRemove={() => removeFromWatchlist(entry.id)}
                      hasWatched={hasWatched(entry.id)}
                      canMoveUp={index > 0}
                      canMoveDown={index < rewatch.length - 1}
                      providers={watchProviders[entry.id]}
                      sortableEnabled={sortableEnabled}
                      onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                    />
                  ))}
                </SortableContext>
              </div>
            )}
          </div>
        )}
        
        {((hasReleased || hasRewatch) && hasUnreleased) && (
          <div className="watchlist-divider">
            <div className="watchlist-divider-line"></div>
            <div className="watchlist-divider-label">Unreleased</div>
            <div className="watchlist-divider-line"></div>
          </div>
        )}
        
        {hasUnreleased && (
          <div id={getWatchlistSectionId(type, 'unreleased')}>
            {activeViewMode === 'tile' ? (
              <div className="class-section-rows class-section-rows--tile class-section-rows--unreleased">
                {unreleased.map((entry) => (
                  <WatchlistTile
                    key={entry.id}
                    entry={entry}
                    runtimeMinutes={type === 'movies' ? getMovieById(entry.id)?.runtimeMinutes : getShowById(entry.id)?.runtimeMinutes}
                    type={type}
                    onRecordWatch={() => handleRecordWatch(entry, type)}
                    onRemove={() => removeFromWatchlist(entry.id)}
                    hasWatched={hasWatched(entry.id)}
                    providers={watchProviders[entry.id]}
                    sortableEnabled={sortableEnabled}
                    onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                  />
                ))}
              </div>
            ) : activeViewMode === 'minimized' ? (
              <div className="class-section-rows class-section-rows--unreleased">
                {unreleased.map((entry, index) => (
                  <WatchlistRow
                    key={entry.id}
                    entry={entry}
                    runtimeMinutes={type === 'movies' ? getMovieById(entry.id)?.runtimeMinutes : getShowById(entry.id)?.runtimeMinutes}
                    type={type}
                    onRecordWatch={() => handleRecordWatch(entry, type)}
                    onMoveUp={() => {}} // Disabled for unreleased
                    onMoveDown={() => {}} // Disabled for unreleased
                    onRemove={() => removeFromWatchlist(entry.id)}
                    hasWatched={hasWatched(entry.id)}
                    canMoveUp={false}
                    canMoveDown={false}
                    providers={watchProviders[entry.id]}
                    sortableEnabled={sortableEnabled}
                    minimized={true}
                    onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                  />
                ))}
              </div>
            ) : (
              <div className="class-section-rows class-section-rows--unreleased">
                {unreleased.map((entry, index) => (
                  <WatchlistRow
                    key={entry.id}
                    entry={entry}
                    runtimeMinutes={type === 'movies' ? getMovieById(entry.id)?.runtimeMinutes : getShowById(entry.id)?.runtimeMinutes}
                    type={type}
                    onRecordWatch={() => handleRecordWatch(entry, type)}
                    onMoveUp={() => {}} // Disabled for unreleased
                    onMoveDown={() => {}} // Disabled for unreleased
                    onRemove={() => removeFromWatchlist(entry.id)}
                    hasWatched={hasWatched(entry.id)}
                    canMoveUp={false}
                    canMoveDown={false}
                    providers={watchProviders[entry.id]}
                    sortableEnabled={sortableEnabled}
                    onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                  />
                ))}
              </div>
            )}
          </div>
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
            <ViewToggle />
            <button
              type="button"
              className={`watchlist-overlap-open-btn ${overlapFriendUids.length > 0 ? 'watchlist-overlap-open-btn--active' : ''}`}
              onClick={() => {
                setOverlapFriendUidsDraft(overlapFriendUids);
                setIsOverlapModalOpen(true);
              }}
              title="Show only items on all selected friends' watchlists"
            >
              View overlap with friends
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
                ALL
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
                FREE
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
        />
      )}

      <FriendOverlapModal
        isOpen={isOverlapModalOpen}
        friends={friends}
        selectedUids={overlapFriendUidsDraft}
        isLoading={isLoadingOverlap}
        onClose={() => {
          setIsOverlapModalOpen(false);
          setOverlapFriendUidsDraft(overlapFriendUids);
        }}
        onSelectionChange={(uids) => setOverlapFriendUidsDraft(uids)}
        onCommit={(uids) => {
          setOverlapFriendUids(uids);
          setIsOverlapModalOpen(false);
        }}
        myMovieIds={movies.map((m) => m.id)}
        myTvIds={tv.map((t) => t.id)}
        friendWatchlists={friendWatchlists}
        friendWatchlistErrors={friendWatchlistErrors}
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
