import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Info, ChevronDown, ChevronUp, Clock, Calendar, PlayCircle, Edit, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { tmdbMovieDetailsFull, tmdbPersonDetailsFull, tmdbTvDetailsFull, tmdbWatchProviders, tmdbImagePath, type TmdbMovieCache, type TmdbPersonCache, type TmdbTvCache, type TmdbWatchProvidersResponse, type TmdbWatchProvider } from '../lib/tmdb';
import { lockBodyScroll, unlockBodyScroll } from '../lib/bodyScrollLock';
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import { useListsStore } from '../state/listsStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { PersonInfoModal } from './PersonInfoModal';
import { PersonRankingModal, type PersonRankingTarget } from './PersonRankingModal';
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
  collectionTags?: { id: string; label: string; color?: string }[];
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

export function InfoModal({ isOpen, onClose, tmdbId, mediaType, title, posterPath, releaseDate, collectionTags = [], onEditWatches }: InfoModalProps) {
  const navigate = useNavigate();
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSynopsis, setShowSynopsis] = useState(false);
  const [showGenres, setShowGenres] = useState(false);
  const [watchOptionsOpen, setWatchOptionsOpen] = useState(false);
  const watchOptionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const watchOptionsTooltipRef = useRef<HTMLDivElement | null>(null);
  const [personInfoTarget, setPersonInfoTarget] = useState<{ tmdbId: number; name: string; profilePath?: string } | null>(null);
  const [personRankTarget, setPersonRankTarget] = useState<{ id: number; name: string; profilePath?: string; type: 'actor' | 'director' } | null>(null);
  const [personRankCache, setPersonRankCache] = useState<TmdbPersonCache | null>(null);
  const [showAgeAtRelease, setShowAgeAtRelease] = useState(false);
  const [personBirthdayCache, setPersonBirthdayCache] = useState<Record<number, string | null>>({});
  const [isSavingPerson, setIsSavingPerson] = useState(false);
  const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlistStore();
  const { collectionIdsByEntryId, globalCollections } = useListsStore();
  const { getPersonById, addPersonFromSearch, moveItemToClass: movePersonToClass, removePersonEntry, classes: peopleClasses } = usePeopleStore();
  const { getDirectorById, addDirectorFromSearch, moveItemToClass: moveDirectorToClass, removeDirectorEntry, classes: directorsClasses } = useDirectorsStore();
  const entryId = `tmdb-${mediaType}-${tmdbId}`;
  const inWatchlist = isInWatchlist(entryId);

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
      lockBodyScroll();
      return () => {
        unlockBodyScroll();
      };
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

  useEffect(() => {
    if (!isOpen) {
      setShowAgeAtRelease(false);
      return;
    }

    setPersonBirthdayCache({});
  }, [isOpen, tmdbId, mediaType]);

  const releaseDateObj = useMemo(() => {
    const date = details?.releaseDate;
    if (!date) return null;
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [details?.releaseDate]);

  useEffect(() => {
    if (!showAgeAtRelease || !releaseDateObj || !details) return;

    const leadPeople = mediaType === 'movie' ? (details.directors ?? []) : (details.creators ?? []);
    const peopleToLoad = [...leadPeople, ...details.cast.slice(0, 20)];
    const missingIds = peopleToLoad
      .map((person) => person.id)
      .filter((id) => personBirthdayCache[id] === undefined);

    if (!missingIds.length) return;

    let cancelled = false;

    void Promise.all(
      missingIds.map(async (id) => {
        try {
          const person = await tmdbPersonDetailsFull(id);
          return [id, person?.birthday ?? null] as const;
        } catch {
          return [id, null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setPersonBirthdayCache((prev) => {
        const next = { ...prev };
        for (const [id, birthday] of entries) {
          next[id] = birthday;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [showAgeAtRelease, releaseDateObj, details, mediaType, personBirthdayCache]);

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

  const getAgeAtRelease = (personId: number) => {
    if (!showAgeAtRelease || !releaseDateObj) return '';
    const birthday = personBirthdayCache[personId];
    if (!birthday) return '';

    const birthDate = new Date(birthday);
    if (Number.isNaN(birthDate.getTime())) return '';

    let age = releaseDateObj.getFullYear() - birthDate.getFullYear();
    const hasHadBirthdayThisYear =
      releaseDateObj.getMonth() > birthDate.getMonth() ||
      (releaseDateObj.getMonth() === birthDate.getMonth() && releaseDateObj.getDate() >= birthDate.getDate());
    if (!hasHadBirthdayThisYear) age -= 1;
    return age >= 0 ? ` (${age})` : '';
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

    const uniqByProviderId = (list: TmdbWatchProvider[]) => {
      const byId = new Map<number, TmdbWatchProvider>();
      for (const p of list) {
        const existing = byId.get(p.provider_id);
        // Prefer whichever entry has a usable price (rent/buy sometimes include it).
        if (!existing) byId.set(p.provider_id, p);
        else if (!existing.price && p.price) byId.set(p.provider_id, p);
      }
      return Array.from(byId.values()).sort((a, b) => (a.display_priority ?? 9999) - (b.display_priority ?? 9999));
    };

    return {
      countryCode: selectedCountryCode ?? '',
      groups: {
        flatrate: uniqByProviderId(selectedCountryData.flatrate ?? []),
        rent: uniqByProviderId(selectedCountryData.rent ?? []),
        buy: uniqByProviderId(selectedCountryData.buy ?? []),
        ads: uniqByProviderId(selectedCountryData.ads ?? []),
      } as Record<WatchProviderCategory, TmdbWatchProvider[]>,
    };
  };

  const watchProviderGroups = getWatchProviderGroups();
  const resolvedCollectionTags = useMemo(() => {
    if (collectionTags.length > 0) return collectionTags;
    const entryId = `tmdb-${mediaType}-${tmdbId}`;
    return (collectionIdsByEntryId.get(entryId) ?? []).map((id) => ({
      id,
      label: globalCollections.find((item) => item.id === id)?.name ?? id,
      color: globalCollections.find((item) => item.id === id)?.color,
    }));
  }, [collectionTags, mediaType, tmdbId, collectionIdsByEntryId, globalCollections]);
  const rankTargetSavedEntry = personRankTarget
    ? personRankTarget.type === 'actor'
      ? getPersonById(`tmdb-person-${personRankTarget.id}`)
      : getDirectorById(`tmdb-person-${personRankTarget.id}`)
    : null;
  const rankTargetClasses = personRankTarget?.type === 'director' ? directorsClasses : peopleClasses;
  const rankTargetClassLabel =
    rankTargetSavedEntry && rankTargetClasses
      ? rankTargetClasses.find((c) => c.key === rankTargetSavedEntry.classKey)?.label
      : undefined;
  const resolvedPosterPath = posterPath ?? details?.posterPath;
  const resolvedBackdropPath = details?.backdropPath;

  const getSavedPersonProfilePath = (personId: number, fallback?: string) => {
    const savedActor = getPersonById(`tmdb-person-${personId}`);
    if (savedActor?.profilePath) return savedActor.profilePath;
    const savedDirector = getDirectorById(`tmdb-person-${personId}`);
    if (savedDirector?.profilePath) return savedDirector.profilePath;
    return fallback;
  };

  const openPersonRankModal = async (person: { id: number; name: string; profilePath?: string; type: 'actor' | 'director' }) => {
    setPersonRankTarget(person);
    try {
      const cache = await tmdbPersonDetailsFull(person.id);
      setPersonRankCache(cache || null);
    } catch {
      setPersonRankCache(null);
    }
  };

  const handleSavePerson = async (
    params: { classKey?: string; position?: 'top' | 'middle' | 'bottom' },
    goToList: boolean
  ) => {
    if (!personRankTarget) return;
    const personId = `tmdb-person-${personRankTarget.id}`;
    const isActor = personRankTarget.type === 'actor';
    const existing = isActor ? getPersonById(personId) : getDirectorById(personId);
    const moveOptions = params.position === 'top'
      ? { toTop: true }
      : params.position === 'middle'
        ? { toMiddle: true }
        : undefined;

    setIsSavingPerson(true);
    try {
      if (existing) {
        if (params.classKey) {
          if (isActor) movePersonToClass(personId, params.classKey, moveOptions);
          else moveDirectorToClass(personId, params.classKey, moveOptions);
        }
      } else if (isActor) {
        addPersonFromSearch({
          id: personId,
          title: personRankTarget.name,
          profilePath: personRankTarget.profilePath,
          classKey: params.classKey || 'UNRANKED',
          cache: personRankCache || undefined,
          position: params.position,
        });
      } else {
        addDirectorFromSearch({
          id: personId,
          title: personRankTarget.name,
          profilePath: personRankTarget.profilePath,
          classKey: params.classKey || 'UNRANKED',
          cache: personRankCache || undefined,
          position: params.position,
        });
      }
      if (goToList) navigate(isActor ? '/actors' : '/directors', { state: { scrollToId: personId } });
    } finally {
      setIsSavingPerson(false);
      setPersonRankTarget(null);
      setPersonRankCache(null);
    }
  };

  // Show person info as a single active modal view to avoid stacked controls/backdrops.
  if (personInfoTarget) {
    return (
      <PersonInfoModal
        isOpen={!!personInfoTarget}
        onClose={() => setPersonInfoTarget(null)}
        tmdbId={personInfoTarget.tmdbId}
        name={personInfoTarget.name}
        profilePath={personInfoTarget.profilePath}
      />
    );
  }

  return (
    <div className="info-modal-backdrop" onClick={onClose}>
      <div className="info-modal" onClick={e => e.stopPropagation()}>
        {/* Header with backdrop */}
        <div className="info-modal-header">
          {resolvedBackdropPath && (
            <div 
              className="info-modal-header-backdrop"
              style={{ backgroundImage: `url(${tmdbImagePath(resolvedBackdropPath, 'original')})` }}
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
                  {resolvedPosterPath ? (
                    <img src={tmdbImagePath(resolvedPosterPath, 'w300')!} alt={details.title} />
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
                        <div className="info-modal-watch-actions-row">
                          <button
                            type="button"
                            className={`info-modal-watchlist-btn ${
                              inWatchlist ? 'info-modal-watchlist-btn--remove' : 'info-modal-watchlist-btn--add'
                            }`}
                            onClick={() => {
                              if (inWatchlist) {
                                removeFromWatchlist(entryId);
                                return;
                              }
                              addToWatchlist(
                                {
                                  id: entryId,
                                  title: details.title,
                                  posterPath: resolvedPosterPath,
                                  releaseDate: details.releaseDate || releaseDate,
                                },
                                mediaType === 'movie' ? 'movies' : 'tv'
                              );
                            }}
                          >
                            {inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                          </button>
                          <button
                            ref={watchOptionsButtonRef}
                            type="button"
                            className="info-modal-watch-options-btn"
                            onClick={() => setWatchOptionsOpen(o => !o)}
                            aria-haspopup="dialog"
                            aria-expanded={watchOptionsOpen}
                          >
                            Watch options
                            {watchOptionsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </div>

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
                                        const priceCandidate = showPrice ? provider.price?.trim() : undefined;
                                        const priceText =
                                          priceCandidate && /(\$|£|€)\s*\d|\d+\.\d{2}/.test(priceCandidate)
                                            ? priceCandidate
                                            : undefined;
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
                      {resolvedCollectionTags.length > 0 && (
                        <div className="info-modal-collection-tags-inline">
                          {resolvedCollectionTags.map((tag) => (
                            <span
                              key={tag.id}
                              className="info-modal-collection-tag"
                              style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
                            >
                              {tag.label}
                            </span>
                          ))}
                        </div>
                      )}
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
                <div className="info-modal-section-header">
                  <h3 className="info-modal-section-title">Cast</h3>
                  <div className="info-modal-inline-toggles">
                    <div className="info-modal-inline-toggle-group">
                      <span className="info-modal-inline-toggle-label">Ages at release:</span>
                      <div className="info-modal-inline-toggle-options">
                        <button
                          type="button"
                          className={`info-modal-inline-toggle-btn ${!showAgeAtRelease ? 'is-active' : ''}`}
                          onClick={() => setShowAgeAtRelease(false)}
                        >
                          OFF
                        </button>
                        <button
                          type="button"
                          className={`info-modal-inline-toggle-btn ${showAgeAtRelease ? 'is-active' : ''}`}
                          onClick={() => setShowAgeAtRelease(true)}
                        >
                          ON
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="info-modal-cast-scroll">
                  {(mediaType === 'movie' ? details.directors : details.creators)?.map(person => (
                    <div key={`lead-${person.id}`} className="info-modal-cast-member">
                      {(() => {
                        const saved = !!getDirectorById(`tmdb-person-${person.id}`);
                        return (
                          <div className="info-modal-person-card">
                            {getSavedPersonProfilePath(person.id, person.profilePath) ? (
                              <img
                                src={tmdbImagePath(getSavedPersonProfilePath(person.id, person.profilePath), 'w300')!}
                                alt={person.name}
                                className="info-modal-cast-portrait"
                              />
                            ) : (
                              <div className="info-modal-cast-placeholder info-modal-cast-portrait">{person.name[0]}</div>
                            )}
                            <div className="info-modal-person-actions">
                              <button
                                type="button"
                                className={`info-modal-person-action-btn ${saved ? 'info-modal-person-action-btn--saved' : ''}`}
                                title={`View ${person.name} info`}
                                onClick={() =>
                                  setPersonInfoTarget({
                                    tmdbId: person.id,
                                    name: person.name,
                                    profilePath: getSavedPersonProfilePath(person.id, person.profilePath),
                                  })
                                }
                              >
                                <Info size={13} />
                              </button>
                              <button
                                type="button"
                                className={`info-modal-person-action-btn ${saved ? 'info-modal-person-action-btn--saved' : ''}`}
                                title={saved ? `Edit ${person.name}` : `Save ${person.name}`}
                                onClick={() =>
                                  void openPersonRankModal({
                                    id: person.id,
                                    name: person.name,
                                    profilePath: getSavedPersonProfilePath(person.id, person.profilePath),
                                    type: 'director',
                                  })
                                }
                              >
                                {saved ? <Edit size={13} /> : <Plus size={13} />}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="info-modal-cast-info">
                        <div className="info-modal-cast-name">{person.name}{getAgeAtRelease(person.id)}</div>
                        <div className="info-modal-cast-character">
                          {mediaType === 'movie' ? 'Director' : 'Creator'}
                        </div>
                      </div>
                    </div>
                  ))}

                  {(mediaType === 'movie' ? details.directors?.length : details.creators?.length) && details.cast.length > 0 ? (
                    <div className="info-modal-cast-divider" aria-hidden="true" />
                  ) : null}

                  {details.cast.slice(0, 20).map(person => (
                    <div key={person.id} className="info-modal-cast-member">
                      {(() => {
                        const saved = !!getPersonById(`tmdb-person-${person.id}`);
                        return (
                          <div className="info-modal-person-card">
                            {getSavedPersonProfilePath(person.id, person.profilePath) ? (
                              <img
                                src={tmdbImagePath(getSavedPersonProfilePath(person.id, person.profilePath), 'w300')!}
                                alt={person.name}
                                className="info-modal-cast-portrait"
                              />
                            ) : (
                              <div className="info-modal-cast-placeholder info-modal-cast-portrait">{person.name[0]}</div>
                            )}
                            <div className="info-modal-person-actions">
                              <button
                                type="button"
                                className={`info-modal-person-action-btn ${saved ? 'info-modal-person-action-btn--saved' : ''}`}
                                title={`View ${person.name} info`}
                                onClick={() =>
                                  setPersonInfoTarget({
                                    tmdbId: person.id,
                                    name: person.name,
                                    profilePath: getSavedPersonProfilePath(person.id, person.profilePath),
                                  })
                                }
                              >
                                <Info size={13} />
                              </button>
                              <button
                                type="button"
                                className={`info-modal-person-action-btn ${saved ? 'info-modal-person-action-btn--saved' : ''}`}
                                title={saved ? `Edit ${person.name}` : `Save ${person.name}`}
                                onClick={() =>
                                  void openPersonRankModal({
                                    id: person.id,
                                    name: person.name,
                                    profilePath: getSavedPersonProfilePath(person.id, person.profilePath),
                                    type: 'actor',
                                  })
                                }
                              >
                                {saved ? <Edit size={13} /> : <Plus size={13} />}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="info-modal-cast-info">
                        <div className="info-modal-cast-name">{person.name}{getAgeAtRelease(person.id)}</div>
                        {person.character && (
                          <div className="info-modal-cast-character">{person.character}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Synopsis - Moved to top */}

              {/* Genres - Moved to top */}

              {/* Watch Providers moved to the top (right of genre tags) */}

              {/* Additional Info - Removed since moved to top */}
            </>
          ) : null}
        </div>

        {personRankTarget && (
          <PersonRankingModal
            target={{
              id: `tmdb-person-${personRankTarget.id}`,
              tmdbId: personRankTarget.id,
              name: personRankTarget.name,
              profilePath: personRankTarget.profilePath,
              mediaType: personRankTarget.type,
            } as PersonRankingTarget}
            currentClassKey={rankTargetSavedEntry?.classKey}
            currentClassLabel={rankTargetClassLabel}
            rankedClasses={rankTargetClasses.map((c) => ({ key: c.key, label: c.label, tagline: c.tagline, isRanked: c.isRanked }))}
            isSaving={isSavingPerson}
            onClose={() => {
              setPersonRankTarget(null);
              setPersonRankCache(null);
            }}
            onSave={handleSavePerson}
            onRemoveEntry={rankTargetSavedEntry
              ? (itemId: string) => {
                  if (personRankTarget.type === 'actor') removePersonEntry(itemId);
                  else removeDirectorEntry(itemId);
                }
              : undefined}
          />
        )}
      </div>
    </div>
  );
}
