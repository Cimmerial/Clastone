import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import { RandomQuote } from '../components/RandomQuote';
import { PageSearch, type SearchableItem } from '../components/PageSearch';
import { ViewToggle } from '../components/ViewToggle';
import { useMobileViewMode } from '../hooks/useMobileViewMode';
import { useSettingsStore } from '../state/settingsStore';
import { InfoModal } from '../components/InfoModal';
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
import { tmdbImagePath, tmdbMovieDetailsFull, tmdbTvDetailsFull, tmdbWatchProviders, type TmdbWatchProvider } from '../lib/tmdb';
import { UniversalEditModal, type UniversalEditTarget, type UniversalEditSaveParams } from '../components/UniversalEditModal';
import './WatchlistPage.css';

function formatYear(releaseDate?: string): string {
  if (!releaseDate) return '—';
  const y = releaseDate.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : releaseDate;
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

function WatchlistTile({
  entry,
  type,
  onRecordWatch,
  onRemove,
  hasWatched,
  providers,
  onInfo
}: {
  entry: WatchlistEntry;
  type: WatchlistType;
  onRecordWatch: () => void;
  onRemove: () => void;
  hasWatched: boolean;
  providers?: Array<TmdbWatchProvider & { type: 'subs' | 'rent' | 'ads' }>;
  onInfo?: () => void;
}) {
  const [clickCount, setClickCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    data: { type }
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
  onInfo
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
  providers?: Array<TmdbWatchProvider & { type: 'subs' | 'rent' | 'ads' }>;
  minimized?: boolean;
  onInfo?: () => void;
}) {
  const [clickCount, setClickCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);

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
    data: { type }
  });
  const style = transform ? { transform: CSS.Transform.toString(transform), transition } : undefined;

  return (
    <div
      ref={setNodeRef}
      className={`entry-row-wrapper ${isDragging ? 'entry-row-wrapper--dragging' : ''}`}
      style={style}
      data-watchlist-id={entry.id}
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
  const { settings } = useSettingsStore();
  const mobileViewMode = useMobileViewMode();
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
  const [watchProviders, setWatchProviders] = useState<Record<string, Array<TmdbWatchProvider & { type: 'subs' | 'rent' | 'ads' }>>>({});
  const [infoModalTarget, setInfoModalTarget] = useState<{ tmdbId: number; title: string; posterPath?: string; releaseDate?: string; mediaType: 'movie' | 'tv' } | null>(null);

  useEffect(() => {
    const fetchAllProviders = async () => {
      const allEntries = [...movies, ...tv];
      for (const entry of allEntries) {
        if (watchProviders[entry.id]) continue;
        const match = entry.id.match(/^tmdb-(movie|tv)-(\d+)$/);
        if (!match) continue;
        const [, media, idStr] = match;
        const tmdbId = parseInt(idStr, 10);
        if (Number.isNaN(tmdbId)) continue;

        try {
          const res = await tmdbWatchProviders(tmdbId, media as 'movie' | 'tv');
          const us = res?.results?.US;
          if (us) {
            const combined: Array<TmdbWatchProvider & { type: 'subs' | 'rent' | 'ads' }> = [
              ...(us.flatrate || []).map(p => ({ ...p, type: 'subs' as const })),
              ...(us.ads || []).map(p => ({ ...p, type: 'ads' as const })),
              ...(us.rent || []).map(p => ({ ...p, type: 'rent' as const }))
            ];

            if (combined.length > 0) {
              setWatchProviders((prev) => ({
                ...prev,
                [entry.id]: combined
              }));
            }
          }
        } catch (err) {
          console.error(`Failed to fetch providers for ${entry.id}`, err);
        }
      }
    };
    fetchAllProviders();
  }, [movies, tv]);

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
  const hasActiveModal = !!recordTarget || !!infoModalTarget;

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

  // Prepare search items
  const searchItems: SearchableItem[] = useMemo(() => [
    ...movies.map(entry => ({ id: entry.id, title: entry.title })),
    ...tv.map(entry => ({ id: entry.id, title: entry.title }))
  ], [movies, tv]);

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
          <>
            {settings.viewMode === 'tile' ? (
              <div className="class-section-rows class-section-rows--tile">
                <SortableContext items={released.map((e) => e.id)} strategy={horizontalListSortingStrategy}>
                  {released.map((entry, index) => (
                    <WatchlistTile
                      key={entry.id}
                      entry={entry}
                      type={type}
                      onRecordWatch={() => handleRecordWatch(entry, type)}
                      onRemove={() => removeFromWatchlist(entry.id)}
                      hasWatched={hasWatched(entry.id)}
                      providers={watchProviders[entry.id]}
                      onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                    />
                  ))}
                </SortableContext>
              </div>
            ) : settings.viewMode === 'minimized' ? (
              <div className="class-section-rows">
                <SortableContext items={released.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                  {released.map((entry, index) => (
                    <WatchlistRow
                      key={entry.id}
                      entry={entry}
                      type={type}
                      onRecordWatch={() => handleRecordWatch(entry, type)}
                      onMoveUp={() => moveWatchlistEntry(type, index, -1)}
                      onMoveDown={() => moveWatchlistEntry(type, index, 1)}
                      onRemove={() => removeFromWatchlist(entry.id)}
                      hasWatched={hasWatched(entry.id)}
                      canMoveUp={index > 0}
                      canMoveDown={index < released.length - 1}
                      providers={watchProviders[entry.id]}
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
                      type={type}
                      onRecordWatch={() => handleRecordWatch(entry, type)}
                      onMoveUp={() => moveWatchlistEntry(type, index, -1)}
                      onMoveDown={() => moveWatchlistEntry(type, index, 1)}
                      onRemove={() => removeFromWatchlist(entry.id)}
                      hasWatched={hasWatched(entry.id)}
                      canMoveUp={index > 0}
                      canMoveDown={index < released.length - 1}
                      providers={watchProviders[entry.id]}
                      onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                    />
                  ))}
                </SortableContext>
              </div>
            )}
          </>
        )}
        
        {(hasReleased && hasRewatch) && (
          <div className="watchlist-divider">
            <div className="watchlist-divider-line"></div>
            <div className="watchlist-divider-label">Rewatch</div>
            <div className="watchlist-divider-line"></div>
          </div>
        )}
        
        {hasRewatch && (
          <>
            {settings.viewMode === 'tile' ? (
              <div className="class-section-rows class-section-rows--tile class-section-rows--rewatch">
                <SortableContext items={rewatch.map((e) => e.id)} strategy={horizontalListSortingStrategy}>
                  {rewatch.map((entry, index) => (
                    <WatchlistTile
                      key={entry.id}
                      entry={entry}
                      type={type}
                      onRecordWatch={() => handleRecordWatch(entry, type)}
                      onRemove={() => removeFromWatchlist(entry.id)}
                      hasWatched={hasWatched(entry.id)}
                      providers={watchProviders[entry.id]}
                      onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                    />
                  ))}
                </SortableContext>
              </div>
            ) : settings.viewMode === 'minimized' ? (
              <div className="class-section-rows class-section-rows--rewatch">
                <SortableContext items={rewatch.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                  {rewatch.map((entry, index) => (
                    <WatchlistRow
                      key={entry.id}
                      entry={entry}
                      type={type}
                      onRecordWatch={() => handleRecordWatch(entry, type)}
                      onMoveUp={() => moveWatchlistEntry(type, index, -1)}
                      onMoveDown={() => moveWatchlistEntry(type, index, 1)}
                      onRemove={() => removeFromWatchlist(entry.id)}
                      hasWatched={hasWatched(entry.id)}
                      canMoveUp={index > 0}
                      canMoveDown={index < rewatch.length - 1}
                      providers={watchProviders[entry.id]}
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
                      type={type}
                      onRecordWatch={() => handleRecordWatch(entry, type)}
                      onMoveUp={() => moveWatchlistEntry(type, index, -1)}
                      onMoveDown={() => moveWatchlistEntry(type, index, 1)}
                      onRemove={() => removeFromWatchlist(entry.id)}
                      hasWatched={hasWatched(entry.id)}
                      canMoveUp={index > 0}
                      canMoveDown={index < rewatch.length - 1}
                      providers={watchProviders[entry.id]}
                      onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                    />
                  ))}
                </SortableContext>
              </div>
            )}
          </>
        )}
        
        {((hasReleased || hasRewatch) && hasUnreleased) && (
          <div className="watchlist-divider">
            <div className="watchlist-divider-line"></div>
            <div className="watchlist-divider-label">Unreleased</div>
            <div className="watchlist-divider-line"></div>
          </div>
        )}
        
        {hasUnreleased && (
          <>
            {settings.viewMode === 'tile' ? (
              <div className="class-section-rows class-section-rows--tile class-section-rows--unreleased">
                {unreleased.map((entry) => (
                  <WatchlistTile
                    key={entry.id}
                    entry={entry}
                    type={type}
                    onRecordWatch={() => handleRecordWatch(entry, type)}
                    onRemove={() => removeFromWatchlist(entry.id)}
                    hasWatched={hasWatched(entry.id)}
                    providers={watchProviders[entry.id]}
                    onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                  />
                ))}
              </div>
            ) : settings.viewMode === 'minimized' ? (
              <div className="class-section-rows class-section-rows--unreleased">
                {unreleased.map((entry, index) => (
                  <WatchlistRow
                    key={entry.id}
                    entry={entry}
                    type={type}
                    onRecordWatch={() => handleRecordWatch(entry, type)}
                    onMoveUp={() => {}} // Disabled for unreleased
                    onMoveDown={() => {}} // Disabled for unreleased
                    onRemove={() => removeFromWatchlist(entry.id)}
                    hasWatched={hasWatched(entry.id)}
                    canMoveUp={false}
                    canMoveDown={false}
                    providers={watchProviders[entry.id]}
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
                    type={type}
                    onRecordWatch={() => handleRecordWatch(entry, type)}
                    onMoveUp={() => {}} // Disabled for unreleased
                    onMoveDown={() => {}} // Disabled for unreleased
                    onRemove={() => removeFromWatchlist(entry.id)}
                    hasWatched={hasWatched(entry.id)}
                    canMoveUp={false}
                    canMoveDown={false}
                    providers={watchProviders[entry.id]}
                    onInfo={() => handleInfo(entry, type === 'movies' ? 'movie' : 'tv')}
                  />
                ))}
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
            <ViewToggle />
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
                <p className="class-section-count">{movies.length} entries</p>
              </header>
              {renderSeparatedWatchlist(movies, 'movies')}
            </section>

            <section className="watchlist-section class-section">
              <header className="class-section-header">
                <h3 className="class-section-title">TV Shows</h3>
                <p className="class-section-count">{tv.length} entries</p>
              </header>
              {renderSeparatedWatchlist(tv, 'tv')}
            </section>
          </div>
        </DndContext>
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
    </section>
  );
}
