import { useEffect, useRef, useState, useMemo, type ReactNode } from 'react';
import { RankedItemBase } from './RankedList';
import { Info, Film, Settings, ArrowUp, ArrowDown, ChevronUp, ChevronDown } from 'lucide-react';
import {
  tmdbImagePath,
  needsMovieRefresh,
  needsTvRefresh,
  tmdbMovieDetailsFull,
  tmdbTvDetailsFull
} from '../lib/tmdb';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import { useSettingsStore } from '../state/settingsStore';
import { useNavigate } from 'react-router-dom';

/** Watch type for display and validation. */
export type WatchRecordType = 'DATE' | 'RANGE' | 'DNF' | 'CURRENT' | 'LONG_AGO' | 'DNF_LONG_AGO' | 'UNKNOWN';

/** One recorded watch: type + optional date(s). */
export type WatchRecord = {
  id: string;
  type?: WatchRecordType;
  /** For DATE: single watch date. For RANGE: start. For DNF: start date (when started). */
  year?: number;
  month?: number;
  day?: number;
  /** For RANGE only: end date. */
  endYear?: number;
  endMonth?: number;
  endDay?: number;
  /** For DNF (movie): 0–100 percentage through before stopping. */
  dnfPercent?: number;
};

/** Cached cast member (stored so we don't need to re-fetch from API). */
export type CachedCastMember = { id: number; name: string; character?: string; profilePath?: string };
/** Cached director (stored so we don't need to re-fetch from API). */
export type CachedDirector = { id: number; name: string; profilePath?: string };

export type MovieShowItem = RankedItemBase & {
  percentileRank: string;
  absoluteRank: string;
  numberRanking?: string;
  rankInClass: string;
  title: string;
  viewingDates: string;
  watchTime?: string;
  watchHistory?: any[];
  /** Source of truth for "Watched N× · Last: … · N% · Xh Ym total". */
  watchRecords?: WatchRecord[];
  /** Minutes; used for total duration when set. */
  runtimeMinutes?: number;
  /** TMDB poster path (e.g. "/abc.jpg") for entry row image. */
  posterPath?: string;
  topCastNames: string[];
  stickerTags: string[];
  percentCompleted: string;
  /** Cached from TMDB so we don't need to API call on load. */
  tmdbId?: number;
  backdropPath?: string;
  overview?: string;
  releaseDate?: string;
  cast?: CachedCastMember[];
  directors?: CachedDirector[];
  /** For TV (future): helps convert progress % into rough S/E. */
  totalSeasons?: number;
  totalEpisodes?: number;
  /** TV instance info (whole show vs season range entries). */
  tvInstanceLabel?: string;
  tvSeasonStart?: number;
  tvSeasonEnd?: number;
  genres?: string[];
};

type Props = {
  item: MovieShowItem;
  /** For tooltips: "movies" | "shows" */
  listType?: 'movies' | 'shows';
  onOpenSettings?: (item: MovieShowItem) => void;
  onRecordFirstWatch?: (item: MovieShowItem) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onClassUp?: () => void;
  onClassDown?: () => void;
  onRecordPerson?: (info: { id: number; name: string; profilePath?: string; type: 'actor' | 'director' }) => void;
  onInfo?: (item: MovieShowItem) => void;
  viewMode?: 'detailed' | 'minimized' | 'tile';
  tileMinimalActions?: boolean;
  tileUnseenMuted?: boolean;
  tileOverlayBadges?: ReactNode;
};

function parsePercentile(s: string): number | null {
  const m = s.match(/^(\d+)%$/);
  return m ? Number(m[1]) : null;
}

function parseAbsoluteRank(s: string): { rank: number; total: number } | null {
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  return m ? { rank: Number(m[1]), total: Number(m[2]) } : null;
}

function formatReleaseDate(releaseDate?: string): string | null {
  if (!releaseDate) return null;
  // Prefer year if we have a full date string like "2024-05-10"
  if (/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return releaseDate.slice(0, 4);
  if (/^\d{4}/.test(releaseDate)) return releaseDate.slice(0, 4);
  return releaseDate;
}

type CompactProps = {
  item: MovieShowItem;
};

export function EntryRowMovieShow({
  item,
  listType = 'movies',
  onOpenSettings,
  onRecordFirstWatch,
  onMoveUp,
  onMoveDown,
  onClassUp,
  onClassDown,
  onRecordPerson,
  onInfo,
  viewMode: propViewMode,
  tileMinimalActions = false,
  tileUnseenMuted = false,
  tileOverlayBadges
}: Props) {
  const label = listType === 'movies' ? 'movies' : 'shows';
  const pct = parsePercentile(item.percentileRank);
  const abs = parseAbsoluteRank(item.absoluteRank);
  const percentileTooltip =
    pct != null ? `Better than ${pct}% of ${label}` : null;
  const absoluteTooltip =
    abs != null ? `Ranked ${abs.rank} out of ${abs.total} ${label}` : null;
  const classTooltip = `${item.rankInClass}`;
  const releaseLabel = formatReleaseDate(item.releaseDate);
  const isUnranked = item.classKey === 'UNRANKED';
  const isNonRanked = item.classKey === 'BABY' || item.classKey === 'DELICIOUS_GARBAGE';
  const { settings } = useSettingsStore();
  const navigate = useNavigate();
  const { getPersonById, classes: peopleClasses } = usePeopleStore();
  const { getDirectorById, classes: directorsClasses } = useDirectorsStore();

  const topCastCount = settings.topCastCount;
  const castSlice = (item.cast ?? []).slice(0, topCastCount);
  const [hoveredCastId, setHoveredCastId] = useState<number | null>(null);

  // Hardcoded to true since toggles are removed
  const showCast = true;
  const showDirectors = true;

  const castWithSavedStatus = useMemo(() => {
    return castSlice.map(c => {
      const person = getPersonById(`tmdb-person-${c.id}`);
      const isSaved = !!person;
      const classLabel = person ? (peopleClasses.find(cl => cl.key === person.classKey)?.label ?? person.classKey.replace(/_/g, ' ')) : undefined;

      // Check if actor has been seen in any watched movies/shows
      const hasBeenSeen = (item.watchRecords && item.watchRecords.length > 0);

      return { ...c, isSaved: isSaved || hasBeenSeen, classLabel };
    });
  }, [castSlice, getPersonById, peopleClasses, item.watchRecords]);

  const directorsWithSavedStatus = useMemo(() => {
    return (item.directors || []).slice(0, 2).map(d => {
      const director = getDirectorById(`tmdb-person-${d.id}`);
      const isSaved = !!director;
      const classLabel = director ? (directorsClasses.find(cl => cl.key === director.classKey)?.label ?? director.classKey.replace(/_/g, ' ')) : undefined;

      // Check if director has been seen in any watched movies/shows
      const hasBeenSeen = (item.watchRecords && item.watchRecords.length > 0);

      return { ...d, isSaved: isSaved || hasBeenSeen, classLabel };
    });
  }, [item.directors, getDirectorById, directorsClasses, item.watchRecords]);

  const handlePersonClick = (id: number, type: 'actor' | 'director', name: string, profilePath?: string) => {
    const stringId = `tmdb-person-${id}`;
    const target = type === 'actor' ? '/actors' : '/directors';
    const existing = type === 'actor' ? getPersonById(stringId) : getDirectorById(stringId);

    if (existing) {
      navigate(target, { state: { scrollToId: stringId } });
    } else {
      onRecordPerson?.({ id, name, profilePath, type });
    }
  };

  const rowRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const { updateMovieCache } = useMoviesStore();
  const { updateShowCache } = useTvStore();

  const finalViewMode = propViewMode ?? settings.viewMode;
  const isTile = finalViewMode === 'tile';
  const isMinimized = finalViewMode === 'minimized';

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    if (rowRef.current) observer.observe(rowRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isVisible && item.tmdbId) {
      const isMovie = listType !== 'shows';
      const needsRefresh = isMovie ? needsMovieRefresh(item) : needsTvRefresh(item);
      if (needsRefresh) {
        if (isMovie) {
          tmdbMovieDetailsFull(item.tmdbId).then((cache) => {
            if (cache) updateMovieCache(item.id, cache);
          });
        } else {
          tmdbTvDetailsFull(item.tmdbId).then((cache) => {
            if (cache) updateShowCache(item.id, cache);
          });
        }
      }
    }
  }, [isVisible, item.tmdbId, item.id, listType, updateMovieCache, updateShowCache, item]);

  if (isTile) {
    return (
      <article className={`entry-tile ${tileUnseenMuted ? 'entry-tile--unseen-muted' : ''}`} ref={rowRef}>
        <div className={`entry-tile-poster ${tileUnseenMuted ? 'entry-tile-poster--unseen-muted' : ''}`}>
          {item.posterPath ? (
            <img src={tmdbImagePath(item.posterPath, 'w185') ?? ''} alt="" loading="lazy" />
          ) : (
            <Film size={24} />
          )}
          <div className="entry-tile-info-btn">
            <button type="button" onClick={() => onInfo?.(item)}>
              <Info size={14} />
            </button>
          </div>
          {!tileMinimalActions && (
            <div className="entry-tile-stats-overlay">
              <div className="entry-stat-pill">{item.percentileRank}</div>
              <div className="entry-stat-pill">{item.absoluteRank}</div>
              {item.watchTime && <div className="entry-stat-pill">{item.watchTime}</div>}
            </div>
          )}
          <div className="entry-tile-quick-actions">
            <button type="button" className="entry-settings-btn" onClick={() => onOpenSettings?.(item)}><Settings size={14} /></button>
            {!tileMinimalActions && isUnranked && <button type="button" onClick={() => onRecordFirstWatch?.(item)}>RW</button>}
          </div>
          {tileOverlayBadges ? (
            <div className="entry-tile-bottom-badges">{tileOverlayBadges}</div>
          ) : null}
        </div>
        <div className={`entry-tile-title ${item.title.length > 30 ? 'entry-tile-title--small' : ''}`}>{item.title}</div>
      </article>
    );
  }

  return (
    <article className={`entry-row ${isMinimized ? 'entry-row-minimized' : ''}`} ref={rowRef}>
      <div className="entry-poster" data-item-id={item.id}>
        {item.posterPath ? (
          <img src={tmdbImagePath(item.posterPath, 'w185') ?? ''} alt="" loading="lazy" />
        ) : (
          <Film size={24} />
        )}
      </div>
      <div className="entry-content">
        <div className="entry-left-col">
          <h3 className="entry-title">
            {item.title}
            {releaseLabel ? <span className="entry-title-year"> ({releaseLabel})</span> : null}
            <button
              type="button"
              className="entry-title-info-btn"
              onClick={() => onInfo?.(item)}
              data-tooltip="Info"
            >
              <Info size={14} />
            </button>
          </h3>
          {!isMinimized && (
            <>
              <div className="entry-subtitle">{item.viewingDates}</div>
              {!isUnranked && (
                <div className="entry-stats-row">
                  <span className="entry-stat-pill" data-tooltip={isNonRanked ? 'Not ranked' : percentileTooltip ?? undefined}>
                    {isNonRanked ? 'N/A%' : item.percentileRank}
                  </span>
                  {!isNonRanked && (
                    <span className="entry-stat-pill" data-tooltip={absoluteTooltip ?? undefined}>
                      {item.absoluteRank}
                    </span>
                  )}
                  <span className="entry-stat-pill" data-tooltip={classTooltip}>
                    {item.rankInClass}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {isMinimized ? (
          <div className="entry-controls-column">
            {isUnranked && (
              <button
                type="button"
                className="entry-config-btn entry-record-first"
                onClick={() => onRecordFirstWatch?.(item)}
                data-tooltip="Record Watch"
              >
                RW
              </button>
            )}
            <button type="button" className="entry-config-btn" onClick={onClassUp} disabled={!onClassUp} data-tooltip="Move to previous class"><ChevronUp size={14} /></button>
            <button type="button" className="entry-config-btn" onClick={onClassDown} disabled={!onClassDown} data-tooltip="Move to next class"><ChevronDown size={14} /></button>
            <button type="button" className="entry-config-btn" onClick={onMoveUp} disabled={!onMoveUp} data-tooltip="Move up"><ArrowUp size={14} /></button>
            <button type="button" className="entry-config-btn" onClick={onMoveDown} disabled={!onMoveDown} data-tooltip="Move down"><ArrowDown size={14} /></button>
            <button type="button" className="entry-config-btn entry-settings-btn" onClick={() => onOpenSettings?.(item)} data-tooltip="Settings"><Settings size={14} /></button>
          </div>
        ) : (
          <div className="entry-right-col">
            {isUnranked ? (
              <>
                <button
                  type="button"
                  className="entry-config-btn entry-record-first"
                  onClick={() => onRecordFirstWatch?.(item)}
                  data-tooltip="Record watch to rank"
                >
                  Record First Watch
                </button>
                <div className="entry-cast-strip">
                  {showDirectors && directorsWithSavedStatus.length > 0 && (
                    <>
                      {directorsWithSavedStatus.map((d) => (
                        <div
                          key={d.id}
                          className={`entry-cast-thumb entry-director-thumb ${d.isSaved ? 'entry-role-seen' : ''} clickable`}
                          onMouseEnter={() => setHoveredCastId(d.id)}
                          onMouseLeave={() => setHoveredCastId(null)}
                          onClick={() => handlePersonClick(d.id, 'director', d.name, d.profilePath)}
                        >
                          {d.profilePath ? (
                            <img src={tmdbImagePath(d.profilePath, 'w92') ?? ''} alt="" loading="lazy" />
                          ) : (
                            <span className="entry-cast-fallback">{d.name.charAt(0)}</span>
                          )}
                          {hoveredCastId === d.id && (
                            <div className="entry-cast-tooltip">
                              <span className="entry-cast-tooltip-name">{d.name}</span>
                              <span className="entry-cast-tooltip-char">{listType === 'shows' ? 'Creator' : 'Director'}</span>
                              {d.classLabel && <span className="entry-cast-tooltip-rank">Class: {d.classLabel}</span>}
                              {d.isSaved ? (
                                <span className="entry-cast-tooltip-nav">Click to goto {d.name} in list</span>
                              ) : (
                                <span className="entry-cast-tooltip-nav">Click to rank {listType === 'shows' ? 'creator' : 'director'}</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {showCast && castWithSavedStatus.length > 0 && (
                        <div className="entry-cast-separator" />
                      )}
                    </>
                  )}
                  {showCast && castWithSavedStatus.map((c) => (
                    <div
                      key={c.id}
                      className={`entry-cast-thumb ${c.isSaved ? 'entry-role-seen' : ''} clickable`}
                      onMouseEnter={() => setHoveredCastId(c.id)}
                      onMouseLeave={() => setHoveredCastId(null)}
                      onClick={() => handlePersonClick(c.id, 'actor', c.name, c.profilePath)}
                    >
                      {c.profilePath ? (
                        <img src={tmdbImagePath(c.profilePath, 'w92') ?? ''} alt="" loading="lazy" />
                      ) : (
                        <span className="entry-cast-fallback">{c.name.charAt(0)}</span>
                      )}
                      {hoveredCastId === c.id && (
                        <div className="entry-cast-tooltip">
                          <span className="entry-cast-tooltip-name">{c.name}</span>
                          {c.character && <span className="entry-cast-tooltip-char">{c.character}</span>}
                          {c.classLabel && <span className="entry-cast-tooltip-rank">Class: {c.classLabel}</span>}
                          {c.isSaved ? (
                            <span className="entry-cast-tooltip-nav">Click to goto {c.name} in list</span>
                          ) : (
                            <span className="entry-cast-tooltip-nav">Click to rank actor</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="entry-controls-column">
                <button type="button" className="entry-config-btn" onClick={onClassUp} disabled={!onClassUp} data-tooltip="Move to previous class"><ChevronUp size={14} /></button>
                <button type="button" className="entry-config-btn" onClick={onClassDown} disabled={!onClassDown} data-tooltip="Move to next class"><ChevronDown size={14} /></button>
                <button type="button" className="entry-config-btn" onClick={onMoveUp} disabled={!onMoveUp} data-tooltip="Move up"><ArrowUp size={14} /></button>
                <button type="button" className="entry-config-btn" onClick={onMoveDown} disabled={!onMoveDown} data-tooltip="Move down"><ArrowDown size={14} /></button>
                {!isUnranked && (
                  <button
                    type="button"
                    className="entry-config-btn entry-settings-btn"
                    data-tooltip="Edit watches"
                    onClick={() => onOpenSettings?.(item)}
                  >
                    <Settings size={14} />
                  </button>
                )}
              </div>
            )}
            {!isUnranked && (
              <div className="entry-cast-strip">
                {showDirectors && directorsWithSavedStatus.length > 0 && (
                  <>
                    {directorsWithSavedStatus.map((d) => (
                      <div
                        key={d.id}
                        className={`entry-cast-thumb entry-director-thumb ${d.isSaved ? 'entry-role-seen' : ''} clickable`}
                        onMouseEnter={() => setHoveredCastId(d.id)}
                        onMouseLeave={() => setHoveredCastId(null)}
                        onClick={() => handlePersonClick(d.id, 'director', d.name, d.profilePath)}
                      >
                        {d.profilePath ? (
                          <img src={tmdbImagePath(d.profilePath, 'w92') ?? ''} alt="" loading="lazy" />
                        ) : (
                          <span className="entry-cast-fallback">{d.name.charAt(0)}</span>
                        )}
                        {hoveredCastId === d.id && (
                          <div className="entry-cast-tooltip">
                            <span className="entry-cast-tooltip-name">{d.name}</span>
                            <span className="entry-cast-tooltip-char">{listType === 'shows' ? 'Creator' : 'Director'}</span>
                            {d.classLabel && <span className="entry-cast-tooltip-rank">Class: {d.classLabel}</span>}
                            {d.isSaved ? (
                              <span className="entry-cast-tooltip-nav">Click to goto {d.name} in list</span>
                            ) : (
                              <span className="entry-cast-tooltip-nav">Click to rank {listType === 'shows' ? 'creator' : 'director'}</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {showCast && castWithSavedStatus.length > 0 && (
                      <div className="entry-cast-separator" />
                    )}
                  </>
                )}
                {showCast && castWithSavedStatus.map((c) => (
                  <div
                    key={c.id}
                    className={`entry-cast-thumb ${c.isSaved ? 'entry-role-seen' : ''} clickable`}
                    onMouseEnter={() => setHoveredCastId(c.id)}
                    onMouseLeave={() => setHoveredCastId(null)}
                    onClick={() => handlePersonClick(c.id, 'actor', c.name, c.profilePath)}
                  >
                    {c.profilePath ? (
                      <img src={tmdbImagePath(c.profilePath, 'w92') ?? ''} alt="" loading="lazy" />
                    ) : (
                      <span className="entry-cast-fallback">{c.name.charAt(0)}</span>
                    )}
                    {hoveredCastId === c.id && (
                      <div className="entry-cast-tooltip">
                        <span className="entry-cast-tooltip-name">{c.name}</span>
                        {c.character && <span className="entry-cast-tooltip-char">{c.character}</span>}
                        {c.classLabel && <span className="entry-cast-tooltip-rank">Class: {c.classLabel}</span>}
                        {c.isSaved ? (
                          <span className="entry-cast-tooltip-nav">Click to goto {c.name} in list</span>
                        ) : (
                          <span className="entry-cast-tooltip-nav">Click to rank actor</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function CompactMovieRow({ item }: CompactProps) {
  return (
    <article className="entry-row entry-row--compact">
      <div className="entry-title entry-title-compact">{item.title}</div>
      <div className="entry-top-stats">
        <div className="entry-stat-pill">{item.percentileRank}</div>
        <div className="entry-stat-pill">{item.absoluteRank}</div>
        <div className="entry-stat-pill">{item.rankInClass}</div>
      </div>
    </article>
  );
}
