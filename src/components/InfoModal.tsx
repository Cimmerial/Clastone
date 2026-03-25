import React, { useState, useEffect, useRef } from 'react';
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
  const [watchOptionsOpen, setWatchOptionsOpen] = useState(false);
  const watchOptionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const watchOptionsTooltipRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!watchOptionsOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWatchOptionsOpen(false);
    };

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (watchOptionsButtonRef.current?.contains(target)) return;
      if (watchOptionsTooltipRef.current?.contains(target)) return;

      setWatchOptionsOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [watchOptionsOpen]);

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

  type WatchProviderCategory = 'flatrate' | 'rent' | 'buy' | 'ads';
  const WATCH_PROVIDER_CATEGORY_LABELS: Record<WatchProviderCategory, string> = {
    flatrate: 'Stream',
    rent: 'Rent',
    buy: 'Buy',
    ads: 'Ads',
  };
  const WATCH_PROVIDER_CATEGORY_ORDER: WatchProviderCategory[] = ['flatrate', 'rent', 'buy', 'ads'];

  const getWatchProviderGroups = () => {
    if (!details?.watchProviders?.results) return null;

    const results = details.watchProviders.results;
    type CountryData = (typeof results)[string];

    const countries = ['US', 'CA', 'GB'];

    let selectedCountryCode: string | null = null;
    let selectedCountryData: CountryData | null = null;

    // Prefer the first country in our priority list that has at least one watch provider category.
    for (const country of countries) {
      const countryData = results[country];
      if (!countryData) continue;

      const hasAny =
        (countryData.flatrate?.length ?? 0) +
          (countryData.rent?.length ?? 0) +
          (countryData.buy?.length ?? 0) +
          (countryData.ads?.length ?? 0) >
        0;

      if (hasAny) {
        selectedCountryCode = country;
        selectedCountryData = countryData;
        break;
      }
    }

    if (!selectedCountryData) {
      const firstKey = Object.keys(results)[0];
      if (firstKey) {
        selectedCountryCode = firstKey;
        selectedCountryData = results[firstKey];
      }
    }

    if (!selectedCountryData) return null;

    return {
      countryCode: selectedCountryCode ?? '',
      groups: {
        flatrate: selectedCountryData.flatrate ?? [],
        rent: selectedCountryData.rent ?? [],
        buy: selectedCountryData.buy ?? [],
        ads: selectedCountryData.ads ?? [],
      } as Record<WatchProviderCategory, TmdbWatchProvider[]>,
    };
  };

  const watchProviderGroups = getWatchProviderGroups();

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
                  <div className="info-modal-meta-row">
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

                    {watchProviderGroups && (
                      <div className="info-modal-watch-right">
                        <button
                          ref={watchOptionsButtonRef}
                          type="button"
                          className="info-modal-watch-options-btn"
                          onClick={() => setWatchOptionsOpen(o => !o)}
                          aria-haspopup="dialog"
                          aria-expanded={watchOptionsOpen}
                        >
                          View watch options
                          {watchOptionsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>

                        {watchOptionsOpen && (
                          <div
                            ref={watchOptionsTooltipRef}
                            className="info-modal-watch-options-tooltip"
                            role="dialog"
                            aria-label="Watch options"
                          >
                            <div className="info-modal-watch-options-tooltip-title">Watch options</div>
                            <div className="info-modal-watch-options-tooltip-sections">
                              {WATCH_PROVIDER_CATEGORY_ORDER.map(category => {
                                const providers = watchProviderGroups.groups[category];
                                if (!providers.length) return null;

                                return (
                                  <div key={category} className="info-modal-watch-options-section">
                                    <div className="info-modal-watch-options-section-title">
                                      {WATCH_PROVIDER_CATEGORY_LABELS[category]}
                                    </div>
                                    <div className="info-modal-watch-options-provider-list">
                                      {providers.map(provider => {
                                        const showPrice = category === 'rent' || category === 'buy';
                                        const priceText = showPrice ? provider.price : undefined;
                                        return (
                                          <div
                                            key={provider.provider_id}
                                            className="info-modal-watch-options-provider"
                                          >
                                            {provider.logo_path && (
                                              <img
                                                src={tmdbImagePath(provider.logo_path, 'w45')!}
                                                alt={provider.provider_name}
                                                className="info-modal-watch-options-provider-logo"
                                              />
                                            )}
                                            <div className="info-modal-watch-options-provider-info">
                                              <span className="info-modal-watch-options-provider-name">
                                                {provider.provider_name}
                                              </span>
                                              {priceText && (
                                                <span className="info-modal-watch-options-provider-price">
                                                  {priceText}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
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

              {/* Watch Providers moved to the top (right of genre tags) */}

              {/* Additional Info - Removed since moved to top */}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
