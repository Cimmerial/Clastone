import { useEffect, useRef, useState } from 'react';
import { RankedItemBase } from './RankedList';
import { EntrySettingsModal, WatchEntry } from './EntrySettingsModal';
import {
  tmdbImagePath,
  needsMovieRefresh,
  needsTvRefresh,
  tmdbMovieDetailsFull,
  tmdbTvDetailsFull
} from '../lib/tmdb';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useSettingsStore } from '../state/settingsStore';

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
  watchHistory?: WatchEntry[];
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
  onClassDown
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
  const topCastCount = settings.topCastCount;
  const castSlice = (item.cast ?? []).slice(0, topCastCount);
  const [hoveredCastId, setHoveredCastId] = useState<number | null>(null);

  const rowRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const { updateMovieCache } = useMoviesStore();
  const { updateShowCache } = useTvStore();

  const isMinimized = settings.minimizedEntries;

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

  return (
    <article className={`entry-row ${isMinimized ? 'entry-row-minimized' : ''}`} ref={rowRef}>
      <div className="entry-poster" data-item-id={item.id}>
        {item.posterPath ? (
          <img src={tmdbImagePath(item.posterPath) ?? ''} alt="" loading="lazy" />
        ) : (
          <span>🎬</span>
        )}
      </div>
      <div className="entry-content">
        <div className="entry-left-col">
          <h3 className="entry-title">
            {item.title}
            {releaseLabel ? <span className="entry-title-year"> ({releaseLabel})</span> : null}
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
            <button type="button" className="entry-config-btn" onClick={onClassUp} disabled={!onClassUp} data-tooltip="Move to previous class">⇡</button>
            <button type="button" className="entry-config-btn" onClick={onClassDown} disabled={!onClassDown} data-tooltip="Move to next class">⇣</button>
            <button type="button" className="entry-config-btn" onClick={onMoveUp} disabled={!onMoveUp} data-tooltip="Move up">↑</button>
            <button type="button" className="entry-config-btn" onClick={onMoveDown} disabled={!onMoveDown} data-tooltip="Move down">↓</button>
            <button type="button" className="entry-config-btn" onClick={() => onOpenSettings?.(item)} data-tooltip="Settings">⚙</button>
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
                  {settings.showDirectors && (item.directors || []).length > 0 && (
                    <>
                      {(item.directors || []).slice(0, 2).map((d) => (
                        <div
                          key={d.id}
                          className="entry-cast-thumb entry-director-thumb"
                          onMouseEnter={() => setHoveredCastId(d.id)}
                          onMouseLeave={() => setHoveredCastId(null)}
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
                            </div>
                          )}
                        </div>
                      ))}
                      {settings.showCast && castSlice.length > 0 && (
                        <div className="entry-cast-separator" />
                      )}
                    </>
                  )}
                  {settings.showCast && castSlice.map((c) => (
                    <div
                      key={c.id}
                      className="entry-cast-thumb"
                      onMouseEnter={() => setHoveredCastId(c.id)}
                      onMouseLeave={() => setHoveredCastId(null)}
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
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="entry-controls-column">
                <button type="button" className="entry-config-btn" onClick={onClassUp} disabled={!onClassUp} data-tooltip="Move to previous class">⇡</button>
                <button type="button" className="entry-config-btn" onClick={onClassDown} disabled={!onClassDown} data-tooltip="Move to next class">⇣</button>
                <button type="button" className="entry-config-btn" onClick={onMoveUp} disabled={!onMoveUp} data-tooltip="Move up">↑</button>
                <button type="button" className="entry-config-btn" onClick={onMoveDown} disabled={!onMoveDown} data-tooltip="Move down">↓</button>
                <button
                  type="button"
                  className="entry-config-btn"
                  data-tooltip="Edit watches"
                  onClick={() => onOpenSettings?.(item)}
                >
                  ⚙
                </button>
              </div>
            )}
            {!isUnranked && (
              <div className="entry-cast-strip">
                {settings.showDirectors && (item.directors || []).length > 0 && (
                  <>
                    {(item.directors || []).slice(0, 2).map((d) => (
                      <div
                        key={d.id}
                        className="entry-cast-thumb entry-director-thumb"
                        onMouseEnter={() => setHoveredCastId(d.id)}
                        onMouseLeave={() => setHoveredCastId(null)}
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
                          </div>
                        )}
                      </div>
                    ))}
                    {settings.showCast && castSlice.length > 0 && (
                      <div className="entry-cast-separator" />
                    )}
                  </>
                )}
                {settings.showCast && castSlice.map((c) => (
                  <div
                    key={c.id}
                    className="entry-cast-thumb"
                    onMouseEnter={() => setHoveredCastId(c.id)}
                    onMouseLeave={() => setHoveredCastId(null)}
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
