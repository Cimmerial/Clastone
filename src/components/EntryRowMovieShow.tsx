import { useState } from 'react';
import { RankedItemBase } from './RankedList';
import { EntrySettingsModal, WatchEntry } from './EntrySettingsModal';
import { tmdbImagePath } from '../lib/tmdb';

function getTopCastCount(): number {
  try {
    const v = localStorage.getItem('clastone-topCastCount');
    if (v) {
      const n = Number(v);
      if (n >= 3 && n <= 10) return n;
    }
  } catch { /* ignore */ }
  return 5;
}

/** Watch type for display and validation. */
export type WatchRecordType = 'DATE' | 'RANGE' | 'DNF' | 'CURRENT' | 'LONG_AGO' | 'UNKNOWN';

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
export type CachedDirector = { id: number; name: string };

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
  const topCastCount = getTopCastCount();
  const castSlice = (item.cast ?? []).slice(0, topCastCount);
  const [hoveredCastId, setHoveredCastId] = useState<number | null>(null);

  return (
    <article className="entry-row">
      <div className="entry-poster">
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
        </div>

        {isUnranked ? (
          <div className="entry-right-col">
            <button
              type="button"
              className="entry-config-btn entry-record-first"
              onClick={() => onRecordFirstWatch?.(item)}
              data-tooltip="Record watch to rank"
            >
              Record First Watch
            </button>
            {castSlice.length > 0 && (
              <div className="entry-cast-strip">
                {castSlice.map((c) => {
                  if (import.meta.env.DEV && c.profilePath) {
                    console.debug(`[Clastone] Cast portrait for ${c.name}: ${c.profilePath}`);
                  }
                  return (
                    <div
                      key={c.id}
                      className="entry-cast-thumb"
                      onMouseEnter={() => setHoveredCastId(c.id)}
                      onMouseLeave={() => setHoveredCastId(null)}
                    >
                      {c.profilePath ? (
                        <img src={tmdbImagePath(c.profilePath, 'w185') ?? ''} alt="" loading="lazy" />
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
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="entry-right-col">
            <div className="entry-controls-column">
              <button
                type="button"
                className="entry-config-btn"
                aria-label="Move to previous class"
                data-tooltip="Move to previous class"
                disabled={!onClassUp}
                onClick={onClassUp}
              >
                ⇡
              </button>
              <button
                type="button"
                className="entry-config-btn"
                aria-label="Move to next class"
                data-tooltip="Move to next class"
                disabled={!onClassDown}
                onClick={onClassDown}
              >
                ⇣
              </button>
              <button
                type="button"
                className="entry-config-btn"
                aria-label="Move up"
                data-tooltip="Move up"
                disabled={!onMoveUp}
                onClick={onMoveUp}
              >
                ↑
              </button>
              <button
                type="button"
                className="entry-config-btn"
                aria-label="Move down"
                data-tooltip="Move down"
                disabled={!onMoveDown}
                onClick={onMoveDown}
              >
                ↓
              </button>
              <button
                type="button"
                className="entry-config-btn"
                aria-label="Entry settings"
                data-tooltip="Edit watches"
                onClick={() => onOpenSettings?.(item)}
              >
                ⚙
              </button>
            </div>
            {castSlice.length > 0 && (
              <div className="entry-cast-strip">
                {castSlice.map((c) => {
                  if (import.meta.env.DEV && c.profilePath) {
                    console.debug(`[Clastone] Cast portrait for ${c.name}: ${c.profilePath}`);
                  }
                  return (
                    <div
                      key={c.id}
                      className="entry-cast-thumb"
                      onMouseEnter={() => setHoveredCastId(c.id)}
                      onMouseLeave={() => setHoveredCastId(null)}
                    >
                      {c.profilePath ? (
                        <img src={tmdbImagePath(c.profilePath, 'w185') ?? ''} alt="" loading="lazy" />
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
                  );
                })}
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


