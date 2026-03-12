import { useEffect, useState, useMemo, useCallback } from 'react';
import type { TmdbPersonCache } from '../lib/tmdb';
import { tmdbImagePath, tmdbPersonDetailsFull } from '../lib/tmdb';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useSettingsStore } from '../state/settingsStore';

type Props = {
  personId: number;
  onRecordMedia?: (media: { id: number; title: string; posterPath?: string; mediaType: 'movie' | 'tv'; releaseDate?: string }) => void;
};

export function SearchPersonProjects({ personId, onRecordMedia }: Props) {
  const { settings } = useSettingsStore();
  const { byClass: moviesByClass, globalRanks: moviesGlobalRanks } = useMoviesStore();
  const { byClass: tvByClass, globalRanks: tvGlobalRanks } = useTvStore();
  const [personCache, setPersonCache] = useState<TmdbPersonCache | null>(null);
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = sessionStorage.getItem(`search_person_expanded_${personId}`);
    return saved ? JSON.parse(saved) : false;
  });

  // Persist expanded state
  useEffect(() => {
    sessionStorage.setItem(`search_person_expanded_${personId}`, JSON.stringify(isExpanded));
  }, [isExpanded, personId]);

  useEffect(() => {
    tmdbPersonDetailsFull(personId).then(cache => {
      if (cache) setPersonCache(cache);
    }).catch(err => console.error('[Clastone] SearchPersonProjects fetch failed', err));
  }, [personId]);

  const { seenRoles, knownFor } = useMemo(() => {
    if (!personCache?.roles) return { seenRoles: [], knownFor: [] };
    
    let all = personCache.roles;

    // Apply boycott if enabled
    if (settings.boycottTalkShows) {
      all = all.filter(r => {
        const title = r.title.toLowerCase();
        return !title.includes('the tonight show') && 
               !title.includes('the late night show') && 
               !title.includes('jimmy kimmel live') && 
               !title.includes('the graham norton show') &&
               !title.includes('golden globe awards') &&
               !title.includes('live with kelly') &&
               !title.includes('the one show') &&
               !title.includes('late night with seth meyers') &&
               !title.includes('the late late show with james corden');
      });
    }

    // Exclude The Simpsons if enabled
    if (settings.excludeSimpsons) {
      all = all.filter(r => {
        const title = r.title.toLowerCase();
        return !title.includes('the simpsons');
      });
    }

    // Get all movies and shows from stores
    const allMovies = Object.values(moviesByClass).flat();
    const allShows = Object.values(tvByClass).flat();
    const seenMoviesSet = new Set(allMovies.map((m: any) => m.id));
    const seenShowsSet = new Set(allShows.map((s: any) => s.id));

    const seen = all.filter((r: any) => (r.mediaType === 'movie' && seenMoviesSet.has(`tmdb-movie-${r.id}`)) ||
      (r.mediaType === 'tv' && seenShowsSet.has(`tmdb-tv-${r.id}`)));
    const unseen = all.filter((r: any) => !((r.mediaType === 'movie' && seenMoviesSet.has(`tmdb-movie-${r.id}`)) ||
      (r.mediaType === 'tv' && seenShowsSet.has(`tmdb-tv-${r.id}`))));

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
  }, [personCache, settings.boycottTalkShows, settings.excludeSimpsons, moviesGlobalRanks, tvGlobalRanks, JSON.stringify(moviesByClass), JSON.stringify(tvByClass)]);

  // Create seen check sets for render function
  const allMovies = Object.values(moviesByClass).flat();
  const allShows = Object.values(tvByClass).flat();
  const seenMoviesSet = new Set(allMovies.map((m: any) => m.id));
  const seenShowsSet = new Set(allShows.map((s: any) => s.id));

  const displayRoles = useMemo(() => {
    const allRoles = [...seenRoles, ...knownFor];
    if (isExpanded) {
      return allRoles.slice(0, 24); // Show up to 24 when expanded
    } else {
      return allRoles.slice(0, 12); // Show top 12 by default
    }
  }, [seenRoles, knownFor, isExpanded]);

  const hasMoreProjects = (seenRoles.length + knownFor.length) > 12;

  if (!personCache?.roles || personCache.roles.length === 0) {
    return null;
  }

  return (
    <div className="search-person-projects">
      <div className={`search-person-projects-grid ${isExpanded ? 'expanded' : ''}`}>
        {displayRoles.map((role) => {
          const id = role.mediaType === 'movie' ? `tmdb-movie-${role.id}` : `tmdb-tv-${role.id}`;
          const isSeen = (role.mediaType === 'movie' && seenMoviesSet.has(id)) ||
            (role.mediaType === 'tv' && seenShowsSet.has(id));
          
          return (
            <div
              key={`${role.mediaType}-${role.id}`}
              className={`search-person-project-thumb clickable ${isSeen ? 'search-person-project-seen' : 'search-person-project-unseen'}`}
              data-hover-text={isSeen ? 'Edit' : 'Save'}
              onClick={() => {
                onRecordMedia?.({
                  id: role.id,
                  title: role.title,
                  posterPath: role.posterPath,
                  mediaType: role.mediaType,
                  releaseDate: role.releaseDate
                });
              }}
            >
              {role.posterPath ? (
                <img src={tmdbImagePath(role.posterPath, 'w92') ?? ''} alt="" loading="lazy" />
              ) : (
                <span className="search-person-project-fallback">
                  {role.mediaType === 'movie' ? '🎬' : '📺'}
                </span>
              )}
            </div>
          );
        })}
      </div>
      
      {hasMoreProjects && (
        <button
          type="button"
          className="search-person-projects-expand"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Show less' : `Show ${Math.min(12, knownFor.length + seenRoles.length - 12)} more`}
        </button>
      )}
    </div>
  );
}
