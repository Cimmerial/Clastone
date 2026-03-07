import { useEffect, useRef, useState, useMemo } from 'react';
import type { TmdbPersonCache } from '../lib/tmdb';
import { tmdbImagePath, tmdbPersonDetailsFull } from '../lib/tmdb';
import { usePeopleStore, PersonItem } from '../state/peopleStore';
import { useSettingsStore } from '../state/settingsStore';
import { formatDuration, useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';

type Props = {
  item: PersonItem;
  onOpenSettings?: (item: PersonItem) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onClassUp?: () => void;
  onClassDown?: () => void;
};

export function EntryRowPerson({
  item,
  onOpenSettings,
  onMoveUp,
  onMoveDown,
  onClassUp,
  onClassDown
}: Props) {
  const { settings } = useSettingsStore();
  const { updatePersonCache } = usePeopleStore();
  const { byClass: moviesByClass } = useMoviesStore();
  const { byClass: tvByClass } = useTvStore();
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
        if (cache) updatePersonCache(item.id, cache);
      });
    }
  }, [isVisible, item.tmdbId, item.id, updatePersonCache, item.roles]);

  const seenMovies = new Set(item.moviesSeen);
  const seenShows = new Set(item.showsSeen);

  const { seenRoles, knownFor } = useMemo(() => {
    let all = item.roles ?? [];

    // Apply boycott if enabled
    if (settings.boycottTalkShows) {
      all = all.filter(r => {
        const title = r.title.toLowerCase();
        return !title.includes('the tonight show') && !title.includes('the late night show');
      });
    }

    const seen = all.filter(r => (r.mediaType === 'movie' && seenMovies.has(`tmdb-movie-${r.id}`)) ||
      (r.mediaType === 'tv' && seenShows.has(`tmdb-tv-${r.id}`)));
    const unseen = all.filter(r => !((r.mediaType === 'movie' && seenMovies.has(`tmdb-movie-${r.id}`)) ||
      (r.mediaType === 'tv' && seenShows.has(`tmdb-tv-${r.id}`))));

    // Sort seen by percentile ranking descending
    seen.sort((a, b) => {
      const getPercentile = (r: typeof a) => {
        const id = r.mediaType === 'movie' ? `tmdb-movie-${r.id}` : `tmdb-tv-${r.id}`;
        const store = r.mediaType === 'movie' ? moviesByClass : tvByClass;
        let foundItem = null;
        for (const list of Object.values(store)) {
          foundItem = (list as any[]).find((it: any) => it.id === id);
          if (foundItem) break;
        }
        if (!foundItem || !foundItem.percentileRank) return -1;
        const match = foundItem.percentileRank.match(/^(\d+)%$/);
        return match ? parseInt(match[1], 10) : -1;
      };

      const pctA = getPercentile(a);
      const pctB = getPercentile(b);
      // Descending (higher percentile first)
      if (pctA !== pctB) return pctB - pctA;
      return (b.popularity || 0) - (a.popularity || 0);
    });

    // Sort unseen by a combine score of popularity + role quality
    unseen.sort((a, b) => {
      const isTalkShowA = a.character?.toLowerCase().includes('self') || a.character?.toLowerCase().includes('guest');
      const isTalkShowB = b.character?.toLowerCase().includes('self') || b.character?.toLowerCase().includes('guest');

      const scoreA = (a.popularity || 0) * (a.voteCount || 1) * (isTalkShowA ? 0.01 : 1) * (a.mediaType === 'movie' ? 2 : 1);
      const scoreB = (b.popularity || 0) * (b.voteCount || 1) * (isTalkShowB ? 0.01 : 1) * (b.mediaType === 'movie' ? 2 : 1);

      return scoreB - scoreA;
    });

    return { seenRoles: seen, knownFor: unseen };
  }, [item.roles, seenMovies, seenShows, settings.boycottTalkShows, moviesByClass, tvByClass]);


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

  return (
    <article className="entry-row" ref={rowRef}>
      <div className="entry-poster" data-item-id={item.id}>
        {item.profilePath ? (
          <img src={tmdbImagePath(item.profilePath) ?? ''} alt="" loading="lazy" />
        ) : (
          <span>👤</span>
        )}
      </div>
      <div className="entry-content">
        <div className="entry-left-col">
          <h3 className="entry-title">{item.title}</h3>
          <div className="entry-subtitle">
            {[
              age != null && `Age: ${age}${item.deathday ? ' (Deceased)' : ''}`,
              item.firstSeenDate && `First seen: ${item.firstSeenDate.slice(0, 4)}`,
              item.lastSeenDate && `Most recently seen: ${item.lastSeenDate.slice(0, 4)}`,
            ].filter(Boolean).join(' · ')}
          </div>

          <div className="entry-stats-row">
            {totalWatchTime > 0 && <span className="entry-stat-pill">{formatDuration(totalWatchTime)} total</span>}
            {item.moviesSeen.length > 0 && <span className="entry-stat-pill">{item.moviesSeen.length} {item.moviesSeen.length === 1 ? 'Movie' : 'Movies'}</span>}
            {item.showsSeen.length > 0 && <span className="entry-stat-pill">{item.showsSeen.length} {item.showsSeen.length === 1 ? 'Show' : 'Shows'}</span>}
          </div>
        </div>

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
              <button type="button" className="entry-config-btn" onClick={() => onOpenSettings?.(item)}>⚙</button>
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
                  className={`entry-cast-thumb ${isSeen ? 'entry-role-seen' : ''}`}
                  onMouseEnter={() => setHoveredRoleId(role.id)}
                  onMouseLeave={() => setHoveredRoleId(null)}
                >
                  {role.posterPath ? (
                    <img src={tmdbImagePath(role.posterPath, 'w92') ?? ''} alt="" loading="lazy" />
                  ) : (
                    <span className="entry-cast-fallback">{role.mediaType === 'movie' ? '🎬' : '📺'}</span>
                  )}
                  {hoveredRoleId === role.id && (
                    <div className="entry-cast-tooltip">
                      <span className="entry-cast-tooltip-name">{role.title}</span>
                      {role.character && <span className="entry-cast-tooltip-char">{role.character}</span>}
                      {isSeen && <span className="entry-cast-tooltip-seen">Seen</span>}
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
      </div>
    </article>
  );

}
