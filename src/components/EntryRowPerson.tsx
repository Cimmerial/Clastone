import { useEffect, useRef, useState, useMemo } from 'react';
import { Info } from 'lucide-react';
import type { TmdbPersonCache } from '../lib/tmdb';
import { tmdbImagePath, tmdbPersonDetailsFull } from '../lib/tmdb';
import { usePeopleStore, PersonItem } from '../state/peopleStore';
import { useDirectorsStore, DirectorItem } from '../state/directorsStore';
import { useSettingsStore } from '../state/settingsStore';
import { formatDuration, useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useNavigate } from 'react-router-dom';
import { useMobileViewMode } from '../hooks/useMobileViewMode';

type Props = {
  item: PersonItem | DirectorItem;
  onOpenSettings?: (item: any) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onClassUp?: () => void;
  onClassDown?: () => void;
  onUpdateCache?: (id: string, cache: TmdbPersonCache) => void;
  onRecordMedia?: (media: { id: number; title: string; posterPath?: string; mediaType: 'movie' | 'tv'; releaseDate?: string }) => void;
  onInfo?: (item: PersonItem | DirectorItem) => void;
  viewMode?: 'detailed' | 'minimized' | 'tile' | 'compact';
};

export function EntryRowPerson({
  item,
  onOpenSettings,
  onMoveUp,
  onMoveDown,
  onClassUp,
  onClassDown,
  onUpdateCache,
  onRecordMedia,
  onInfo,
  viewMode: propViewMode
}: Props) {
  const { settings } = useSettingsStore();
  // We'll use the passed in update function if available, otherwise fallback to peopleStore
  const { updatePersonCache: defaultUpdateCache } = usePeopleStore();
  const updatePersonCache = onUpdateCache ?? defaultUpdateCache;
  const { byClass: moviesByClass, globalRanks: moviesGlobalRanks } = useMoviesStore();
  const { byClass: tvByClass, globalRanks: tvGlobalRanks } = useTvStore();
  const navigate = useNavigate();
  const rowRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredRoleId, setHoveredRoleId] = useState<number | null>(null);

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
    if (isVisible && item.tmdbId && (!item.roles || item.roles.length === 0)) {
      tmdbPersonDetailsFull(item.tmdbId).then(cache => {
        if (cache) {
          const { profilePath: _ignoredProfilePath, ...cacheWithoutProfile } = cache;
          updatePersonCache(item.id, cacheWithoutProfile as TmdbPersonCache);
        }
      }).catch(err => console.error('[Clastone] EntryRowPerson fetch failed', err));
    }
  }, [isVisible, item.tmdbId, item.id, updatePersonCache, item.roles]);

  const seenMovies = new Set(item.moviesSeen);
  const seenShows = new Set(item.showsSeen);

  const { seenRoles, knownFor } = useMemo(() => {
    let all = item.roles ?? [];

    // Apply boycott if enabled
    if (settings.boycottTalkShows || settings.excludeSelfRoles) {
      all = all.filter(r => {
        const title = r.title.toLowerCase();
        const character = (r.character || '').toLowerCase();
        const job = (r.job || '').toLowerCase();
        
        // Boycott talk shows filter
        const isBoycottedTalkShow = title.includes('the tonight show') || 
                                    title.includes('the tonight show starring jimmy fallon') ||
                                    title.includes('the late show with stephen colbert') ||
                                    title.includes('the late night show') || 
                                    title.includes('jimmy kimmel live') || 
                                    title.includes('the graham norton show') ||
                                    title.includes('golden globe awards') ||
                                    title.includes('live with kelly') ||
                                    title.includes('the one show') ||
                                    title.includes('late night with seth meyers') ||
                                    title.includes('the late late show with james corden');
        
        // Self roles filter
        const isSelfRole = character === 'self' || 
                           character === 'self - guest' ||
                           job === 'self' || 
                           job === 'self - guest' ||
                           character.includes('self') ||
                           job.includes('self');
        
        return !isBoycottedTalkShow && !(settings.excludeSelfRoles && isSelfRole);
      });
    }

    // Exclude The Simpsons if enabled
    if (settings.excludeSimpsons) {
      all = all.filter(r => {
        const title = r.title.toLowerCase();
        return !title.includes('the simpsons');
      });
    }

    const seen = all.filter((r: any) => (r.mediaType === 'movie' && seenMovies.has(`tmdb-movie-${r.id}`)) ||
      (r.mediaType === 'tv' && seenShows.has(`tmdb-tv-${r.id}`)));
    const unseen = all.filter((r: any) => !((r.mediaType === 'movie' && seenMovies.has(`tmdb-movie-${r.id}`)) ||
      (r.mediaType === 'tv' && seenShows.has(`tmdb-tv-${r.id}`))));

    // Sort seen by percentile ranking descending
    seen.sort((a: any, b: any) => {
      const getPercentile = (r: any) => {
        const id = r.mediaType === 'movie' ? `tmdb-movie-${r.id}` : `tmdb-tv-${r.id}`;
        const ranks = r.mediaType === 'movie' ? moviesGlobalRanks : tvGlobalRanks;
        const info = ranks.get(id);
        if (!info || !info.percentileRank) return -1;
        const match = info.percentileRank.match(/^(\d+)%$/);
        return match ? parseInt(match[1], 10) : -1;
      };

      const pctA = getPercentile(a);
      const pctB = getPercentile(b);
      // Descending (higher percentile first)
      if (pctA !== pctB) return pctB - pctA;
      return (b.popularity || 0) - (a.popularity || 0);
    });

    // Sort unseen by a combine score of popularity + role quality
    unseen.sort((a: any, b: any) => {
      const isTalkShowA = a.character?.toLowerCase().includes('self') || a.character?.toLowerCase().includes('guest') || a.job?.toLowerCase().includes('self');
      const isTalkShowB = b.character?.toLowerCase().includes('self') || b.character?.toLowerCase().includes('guest') || b.job?.toLowerCase().includes('self');

      const isDirectorA = a.job?.toLowerCase().includes('director') || a.job?.toLowerCase().includes('creator');
      const isDirectorB = b.job?.toLowerCase().includes('director') || b.job?.toLowerCase().includes('creator');

      const scoreA = (a.popularity || 0) * (a.voteCount || 1) * (isTalkShowA ? 0.01 : 1) * (a.mediaType === 'movie' ? 2 : 1) * (isDirectorA ? 1.5 : 1);
      const scoreB = (b.popularity || 0) * (b.voteCount || 1) * (isTalkShowB ? 0.01 : 1) * (b.mediaType === 'movie' ? 2 : 1) * (isDirectorB ? 1.5 : 1);

      return scoreB - scoreA;
    });

    return { seenRoles: seen, knownFor: unseen };
  }, [item.roles, seenMovies, seenShows, settings.boycottTalkShows, settings.excludeSimpsons, moviesGlobalRanks, tvGlobalRanks]);


  // Combine and apply limit from settings
  const { rolesWithMetadata, lastSeenIndex } = useMemo(() => {
    const combined = [...seenRoles, ...knownFor];
    const limited = combined.slice(0, settings.personProjectsLimit);

    // Find where seen ends in the limited list
    let lastSeen = -1;
    for (let i = 0; i < limited.length; i++) {
      const r = limited[i];
      const isSeen = (r.mediaType === 'movie' && seenMovies.has(`tmdb-movie-${r.id}`)) ||
        (r.mediaType === 'tv' && seenShows.has(`tmdb-tv-${r.id}`));
      if (isSeen) lastSeen = i;
    }

    return { rolesWithMetadata: limited, lastSeenIndex: lastSeen };
  }, [seenRoles, knownFor, settings.personProjectsLimit, seenMovies, seenShows]);

  const calculateAge = (birthday?: string, deathday?: string) => {
    if (!birthday) return null;
    const birthDate = new Date(birthday);
    const endDate = deathday ? new Date(deathday) : new Date();
    let age = endDate.getFullYear() - birthDate.getFullYear();
    const m = endDate.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && endDate.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const age = calculateAge(item.birthday, item.deathday);
  const isUnranked = item.classKey === 'UNRANKED';

  const totalWatchTime = (item.movieMinutes || 0) + (item.showMinutes || 0);

  const { mode: mobileViewMode, isMobile } = useMobileViewMode();
  const finalViewMode = propViewMode ?? mobileViewMode;
  const isTile = finalViewMode === 'tile' || finalViewMode === 'compact';
  const isCompact = finalViewMode === 'compact';
  const isMinimized = finalViewMode === 'minimized';

  if (isTile) {
    const age = calculateAge(item.birthday, item.deathday);
    if (isMobile) {
      return (
        <article className="entry-tile entry-tile-person" ref={rowRef}>
          <div className="entry-tile-poster" data-item-id={item.id}>
            {item.profilePath ? (
              <img src={tmdbImagePath(item.profilePath) ?? ''} alt="" loading="lazy" />
            ) : (
              <span>👤</span>
            )}
            <div className="entry-tile-info-btn">
              <button type="button" onClick={() => onInfo?.(item)}>
                <Info size={14} />
              </button>
            </div>
            <div className="entry-tile-stats-overlay">
              <div className="entry-stat-pill">{item.moviesSeen.length + item.showsSeen.length} Projects</div>
              {totalWatchTime > 0 && <div className="entry-stat-pill">{formatDuration(totalWatchTime)}</div>}
            </div>
            <div className="entry-tile-quick-actions">
              <button type="button" className="entry-settings-btn" onClick={() => onOpenSettings?.(item)}>⚙</button>
            </div>
          </div>
          <div className={`entry-tile-title ${item.title.length > 30 ? 'entry-tile-title--small' : ''}`}>{item.title}</div>
        </article>
      );
    } else {
      // Desktop-specific Person Tile
      return (
        <article className="entry-tile entry-tile-person entry-tile--desktop" ref={rowRef}>
          <div className="entry-tile-poster" data-item-id={item.id}>
            {item.profilePath ? (
              <img src={tmdbImagePath(item.profilePath, 'w300') ?? ''} alt="" loading="lazy" />
            ) : (
              <span>👤</span>
            )}
            <div className="entry-tile-info-btn">
              <button type="button" onClick={() => onInfo?.(item)}>
                <Info size={16} />
              </button>
            </div>
            {!isCompact && <div className="entry-tile-stats-overlay">
              <div className="entry-stat-pill">{item.moviesSeen.length + item.showsSeen.length} Projects</div>
              {totalWatchTime > 0 && <div className="entry-stat-pill">{formatDuration(totalWatchTime)}</div>}
            </div>}
            <div className="entry-tile-quick-actions">
               <button type="button" className="entry-settings-btn" onClick={() => onOpenSettings?.(item)} title="Settings">⚙</button>
            </div>
          </div>
          {!isCompact && (
            <div className="entry-tile-content">
               <h4 className={`entry-tile-title ${item.title.length > 30 ? 'entry-tile-title--small' : ''}`}>{item.title}</h4>
            </div>
          )}
        </article>
      );
    }
  }

  return (
    <article className={`entry-row ${isMinimized ? 'entry-row-minimized' : ''}`} ref={rowRef}>
      <div className="entry-poster" data-item-id={item.id}>
        {item.profilePath ? (
          <img src={tmdbImagePath(item.profilePath) ?? ''} alt="" loading="lazy" />
        ) : (
          <span>👤</span>
        )}
      </div>
      <div className="entry-content">
        <div className="entry-left-col">
          <h3 className="entry-title">
            {item.title}
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
              <div className="entry-subtitle">
                {[
                  age != null && `Age: ${age}${item.deathday ? ' (Deceased)' : ''}`,
                  item.knownForDepartment && <span key="dept" className="entry-dept-badge">{item.knownForDepartment}</span>,
                  item.firstSeenDate && `First seen: ${item.firstSeenDate.slice(0, 4)}`,
                  item.lastSeenDate && `Most recently seen: ${item.lastSeenDate.slice(0, 4)}`,
                ].filter(Boolean).map((x, i, arr) => (
                  <span key={i}>
                    {x}
                    {i < arr.length - 1 && ' · '}
                  </span>
                ))}
              </div>

              <div className="entry-stats-row">
                {totalWatchTime > 0 && <span className="entry-stat-pill">{formatDuration(totalWatchTime)} total</span>}
                {item.moviesSeen.length > 0 && <span className="entry-stat-pill">{item.moviesSeen.length} {item.moviesSeen.length === 1 ? 'Movie' : 'Movies'}</span>}
                {item.showsSeen.length > 0 && <span className="entry-stat-pill">{item.showsSeen.length} {item.showsSeen.length === 1 ? 'Show' : 'Shows'}</span>}
              </div>
            </>
          )}
        </div>

        {isMinimized ? (
          <div className="entry-controls-column">
            <button type="button" className="entry-config-btn" onClick={onClassUp} disabled={!onClassUp} data-tooltip="Move to previous class">⇡</button>
            <button type="button" className="entry-config-btn" onClick={onClassDown} disabled={!onClassDown} data-tooltip="Move to next class">⇣</button>
            <button type="button" className="entry-config-btn" onClick={onMoveUp} disabled={!onMoveUp} data-tooltip="Move up">↑</button>
            <button type="button" className="entry-config-btn" onClick={onMoveDown} disabled={!onMoveDown} data-tooltip="Move down">↓</button>
            <button type="button" className="entry-config-btn entry-settings-btn" onClick={() => onOpenSettings?.(item)} data-tooltip="Settings">⚙</button>
          </div>
        ) : (
          <div className="entry-right-col">
            {isUnranked ? (
              <button
                type="button"
                className="entry-config-btn entry-record-first"
                onClick={() => onOpenSettings?.(item)}
              >
                Add to List
              </button>
            ) : (
              <div className="entry-controls-column">
                <button type="button" className="entry-config-btn" onClick={onClassUp} disabled={!onClassUp}>⇡</button>
                <button type="button" className="entry-config-btn" onClick={onClassDown} disabled={!onClassDown}>⇣</button>
                <button type="button" className="entry-config-btn" onClick={onMoveUp} disabled={!onMoveUp}>↑</button>
                <button type="button" className="entry-config-btn" onClick={onMoveDown} disabled={!onMoveDown}>↓</button>
                <button type="button" className="entry-config-btn entry-settings-btn" onClick={() => onOpenSettings?.(item)}>⚙</button>
              </div>
            )}

            <div className="entry-cast-strip">
              {rolesWithMetadata.map((role, idx) => {
                const id = role.mediaType === 'movie' ? `tmdb-movie-${role.id}` : `tmdb-tv-${role.id}`;
                const isSeen = (role.mediaType === 'movie' && seenMovies.has(id)) ||
                  (role.mediaType === 'tv' && seenShows.has(id));

                const elements = [];

                elements.push(
                  <div
                    key={`${role.mediaType}-${role.id}`}
                    className={`entry-cast-thumb ${isSeen ? 'entry-role-seen' : 'entry-role-unseen'} clickable`}
                    onMouseEnter={() => setHoveredRoleId(role.id)}
                    onMouseLeave={() => setHoveredRoleId(null)}
                    onClick={() => {
                      if (isSeen) {
                        navigate(role.mediaType === 'movie' ? '/movies' : '/tv', { state: { scrollToId: id } });
                      } else {
                        onRecordMedia?.({
                          id: role.id,
                          title: role.title,
                          posterPath: role.posterPath,
                          mediaType: role.mediaType,
                          releaseDate: role.releaseDate
                        });
                      }
                    }}
                  >
                    {role.posterPath ? (
                      <img src={tmdbImagePath(role.posterPath, 'w92') ?? ''} alt="" loading="lazy" />
                    ) : (
                      <span className="entry-cast-fallback">{role.mediaType === 'movie' ? '🎬' : '📺'}</span>
                    )}
                    {hoveredRoleId === role.id && (
                      <div className="entry-cast-tooltip">
                        <span className="entry-cast-tooltip-name">{role.title}</span>
                        {role.job && <span className="entry-cast-tooltip-job">{role.job}</span>}
                        {role.character && <span className="entry-cast-tooltip-char">{role.character}</span>}
                        {isSeen && (
                          <>
                            <span className="entry-cast-tooltip-rank">
                              {(() => {
                                const ranks = role.mediaType === 'movie' ? moviesGlobalRanks : tvGlobalRanks;
                                const info = ranks.get(id);
                                return info?.percentileRank ? `Rank: ${info.percentileRank}` : 'Seen';
                              })()}
                            </span>
                            <span className="entry-cast-tooltip-nav">Click to goto {role.title} in list</span>
                          </>
                        )}
                        {!isSeen && (
                          <span className="entry-cast-tooltip-nav">Click to record {role.title}</span>
                        )}
                      </div>
                    )}
                  </div>
                );

                // Add vertical bar after the last seen item if there are more items
                if (idx === lastSeenIndex && idx < rolesWithMetadata.length - 1) {
                  elements.push(<div key="separator" className="entry-cast-separator" />);
                }

                return elements;
              })}
            </div>
          </div>
        )}
      </div>
    </article>
  );

}
