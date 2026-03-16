import React, { useState, useEffect } from 'react';
import { X, Info, ChevronDown, ChevronUp, Clock, Calendar, PlayCircle, DollarSign, Edit } from 'lucide-react';
import { tmdbMovieDetailsFull, tmdbTvDetailsFull, tmdbWatchProviders, tmdbImagePath, type TmdbMovieCache, type TmdbTvCache, type TmdbWatchProvidersResponse, type TmdbWatchProvider } from '../lib/tmdb';
import './InfoModal.css';

type MediaType = 'movie' | 'tv';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string;
  releaseDate?: string;
  onEditWatches?: () => void;
}

interface MediaDetails {
  title: string;
  posterPath?: string;
  backdropPath?: string;
  overview?: string;
  releaseDate?: string;
  runtimeMinutes?: number;
  totalSeasons?: number;
  totalEpisodes?: number;
  episodeRuntimeMinutes?: number;
  lastAirDate?: string;
  genres: string[];
  cast: Array<{ id: number; name: string; character?: string; profilePath?: string }>;
  directors?: Array<{ id: number; name: string; profilePath?: string }>;
  creators?: Array<{ id: number; name: string; profilePath?: string }>;
  watchProviders?: TmdbWatchProvidersResponse;
}

export function InfoModal({ isOpen, onClose, tmdbId, mediaType, title, posterPath, releaseDate, onEditWatches }: InfoModalProps) {
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSynopsis, setShowSynopsis] = useState(false);
  const [showGenres, setShowGenres] = useState(false);

  useEffect(() => {
    if (!isOpen || !tmdbId) return;

    const fetchDetails = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const abortController = new AbortController();
        
        // Fetch basic details
        let mediaDetails: TmdbMovieCache | TmdbTvCache | null;
        if (mediaType === 'movie') {
          mediaDetails = await tmdbMovieDetailsFull(tmdbId, abortController.signal);
        } else {
          mediaDetails = await tmdbTvDetailsFull(tmdbId, abortController.signal);
        }

        if (!mediaDetails) {
          throw new Error('Failed to fetch media details');
        }

        // Fetch watch providers
        const watchProviders = await tmdbWatchProviders(tmdbId, mediaType, abortController.signal);

        const processedDetails: MediaDetails = {
          title: mediaDetails.title,
          posterPath: mediaDetails.posterPath,
          backdropPath: mediaDetails.backdropPath,
          overview: mediaDetails.overview,
          releaseDate: mediaDetails.releaseDate,
          genres: mediaDetails.genres,
          cast: mediaDetails.cast,
          watchProviders: watchProviders || undefined,
        };

        if (mediaType === 'movie') {
          const movieDetails = mediaDetails as TmdbMovieCache;
          processedDetails.runtimeMinutes = movieDetails.runtimeMinutes;
          processedDetails.directors = movieDetails.directors;
        } else {
          const tvDetails = mediaDetails as TmdbTvCache;
          processedDetails.totalSeasons = tvDetails.totalSeasons;
          processedDetails.totalEpisodes = tvDetails.totalEpisodes;
          processedDetails.episodeRuntimeMinutes = tvDetails.episodeRuntimeMinutes;
          processedDetails.lastAirDate = tvDetails.lastAirDate;
          processedDetails.creators = tvDetails.creators;
        }

        setDetails(processedDetails);
      } catch (err) {
        console.error('Error fetching media details:', err);
        setError(err instanceof Error ? err.message : 'Failed to load details');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [isOpen, tmdbId, mediaType]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = orig || 'unset'; };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatRuntime = (minutes?: number) => {
    if (!minutes) return 'Unknown';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  };

  const formatTotalRuntime = () => {
    if (mediaType === 'movie') {
      return formatRuntime(details?.runtimeMinutes);
    } else {
      const episodeRuntime = details?.episodeRuntimeMinutes;
      const totalEpisodes = details?.totalEpisodes;
      const totalSeasons = details?.totalSeasons;
      
      if (episodeRuntime && totalEpisodes) {
        const totalMinutes = episodeRuntime * totalEpisodes;
        const seasonText = totalSeasons ? ` over ${totalSeasons} seasons` : '';
        return `${formatRuntime(totalMinutes)} (${totalEpisodes} episodes${seasonText})`;
      }
      if (totalEpisodes && totalSeasons) {
        return `${totalEpisodes} episodes over ${totalSeasons} seasons`;
      }
      return totalEpisodes ? `${totalEpisodes} episodes` : 'Unknown';
    }
  };

  const getYear = (date?: string) => {
    if (!date) return '';
    return date.split('-')[0];
  };

  const getWatchProviders = () => {
    if (!details?.watchProviders?.results) return [];
    
    // Try US first, then CA, then GB, then first available
    const countries = ['US', 'CA', 'GB'];
    let providers: TmdbWatchProvider[] = [];
    
    for (const country of countries) {
      const countryData = details.watchProviders.results[country];
      if (countryData?.flatrate?.length) {
        providers = countryData.flatrate;
        break;
      }
    }
    
    return providers.slice(0, 5); // Limit to 5 providers
  };

  return (
    <div className="info-modal-backdrop" onClick={onClose}>
      <div className="info-modal" onClick={e => e.stopPropagation()}>
        {/* Header with backdrop */}
        <div className="info-modal-header">
          {details?.backdropPath && (
            <div 
              className="info-modal-header-backdrop"
              style={{ backgroundImage: `url(${tmdbImagePath(details.backdropPath, 'original')})` }}
            />
          )}
          <div className="info-modal-header-content">
            <div className="info-modal-header-buttons">
              {onEditWatches && (
                <button className="info-modal-edit-btn" onClick={onEditWatches}>
                  <Edit size={16} />
                  Edit Watches
                </button>
              )}
              <button className="info-modal-close" onClick={onClose}>
                <X size={24} />
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="info-modal-content">
          {loading ? (
            <div className="info-modal-loading">
              <div className="loading-spinner"></div>
              <p>Loading details...</p>
            </div>
          ) : error ? (
            <div className="info-modal-error">
              <p>{error}</p>
              <button onClick={onClose}>Close</button>
            </div>
          ) : details ? (
            <>
              {/* Top Section: Poster + Basic Info */}
              <div className="info-modal-top">
                <div className="info-modal-poster">
                  {details.posterPath ? (
                    <img src={tmdbImagePath(details.posterPath, 'w300')!} alt={details.title} />
                  ) : (
                    <div className="info-modal-poster-placeholder">
                      <PlayCircle size={48} />
                    </div>
                  )}
                </div>
                
                <div className="info-modal-basic-info">
                  <h1 className="info-modal-title">{details.title}</h1>
                  <div className="info-modal-meta">
                    <span className="info-modal-year">{getYear(details.releaseDate)}</span>
                    {details.genres.length > 0 && (
                      <div className="info-modal-genres-inline">
                        {details.genres.slice(0, 3).map(genre => (
                          <span key={genre} className="info-modal-genre-tag-inline">{genre}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Synopsis - Clickable */}
                  {details.overview && (
                    <div className="info-modal-synopsis-section">
                      <div 
                        className="info-modal-synopsis-box"
                        onClick={() => setShowSynopsis(!showSynopsis)}
                      >
                        <p>{showSynopsis ? details.overview : 'Click to read synopsis...'}</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Additional Information */}
                  <div className="info-modal-additional-info-top">
                    <div className="info-modal-info-item">
                      <Calendar size={16} />
                      <span>Released: {details.releaseDate || 'Unknown'}</span>
                    </div>
                    <div className="info-modal-info-item">
                      <Clock size={16} />
                      <span>Total runtime: {formatTotalRuntime()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cast Section */}
              <div className="info-modal-section">
                <h3 className="info-modal-section-title">Cast</h3>
                <div className="info-modal-cast-scroll">
                  {details.cast.slice(0, 20).map(person => (
                    <div key={person.id} className="info-modal-cast-member">
                      {person.profilePath ? (
                        <img src={tmdbImagePath(person.profilePath, 'w300')!} alt={person.name} />
                      ) : (
                        <div className="info-modal-cast-placeholder">{person.name[0]}</div>
                      )}
                      <div className="info-modal-cast-info">
                        <div className="info-modal-cast-name">{person.name}</div>
                        {person.character && (
                          <div className="info-modal-cast-character">{person.character}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Directors/Creators Section */}
              {(details.directors?.length || details.creators?.length) && (
                <div className="info-modal-section">
                  <h3 className="info-modal-section-title">
                    {mediaType === 'movie' ? 'Director' : 'Creators'}
                  </h3>
                  <div className="info-modal-directors">
                    {(mediaType === 'movie' ? details.directors : details.creators)?.map(person => (
                      <div key={person.id} className="info-modal-director">
                        {person.profilePath ? (
                          <img src={tmdbImagePath(person.profilePath, 'w185')!} alt={person.name} />
                        ) : (
                          <div className="info-modal-director-placeholder">{person.name[0]}</div>
                        )}
                        <span className="info-modal-director-name">{person.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Synopsis - Moved to top */}

              {/* Genres - Moved to top */}

              {/* Watch Providers Section */}
              {getWatchProviders().length > 0 && (
                <div className="info-modal-section">
                  <h3 className="info-modal-section-title">Where to Watch</h3>
                  <div className="info-modal-providers">
                    {getWatchProviders().map(provider => (
                      <div key={provider.provider_id} className="info-modal-provider">
                        {provider.logo_path && (
                          <img 
                            src={tmdbImagePath(provider.logo_path, 'w45')!} 
                            alt={provider.provider_name}
                            title={provider.provider_name}
                          />
                        )}
                        <span className="info-modal-provider-name">{provider.provider_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Info - Removed since moved to top */}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
