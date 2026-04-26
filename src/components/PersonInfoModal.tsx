import React, { useState, useEffect, useMemo } from 'react';
import { X, Info, Calendar, PlayCircle, Edit, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { tmdbPersonDetailsFull, tmdbImagePath, type TmdbPersonCache } from '../lib/tmdb';
import { lockBodyScroll, unlockBodyScroll } from '../lib/bodyScrollLock';
import { useSettingsStore } from '../state/settingsStore';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { InfoModal } from './InfoModal';
import { UniversalEditModal, type UniversalEditTarget } from './UniversalEditModal';
import { watchMatrixEntriesToWatchRecords } from '../lib/watchMatrixMapping';
import { prepareWatchRecordsForSave } from '../lib/watchDayOrderUtils';
import { ThemedDropdown } from './ThemedDropdown';
import './InfoModal.css';

interface PersonInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  tmdbId: number;
  name: string;
  profilePath?: string;
  onEditPerson?: () => void;
}

interface PersonDetails {
  name: string;
  profilePath?: string;
  birthday?: string;
  deathday?: string;
  biography?: string;
  knownForDepartment?: string;
  roles: Array<{
    id: number;
    title: string;
    mediaType: 'movie' | 'tv';
    character?: string;
    job?: string;
    posterPath?: string;
    popularity: number;
    voteCount?: number;
    releaseDate?: string;
  }>;
}

type ProjectRoleFilter = 'ACTOR' | 'DIRECTOR' | 'PRODUCER' | 'CREATOR' | 'OTHER';
const ALL_PROJECT_ROLE_FILTERS: ProjectRoleFilter[] = ['ACTOR', 'DIRECTOR', 'PRODUCER', 'CREATOR', 'OTHER'];
type InfoModalProjectSort = 'default' | 'seen-watchlisted-unseen' | 'new-old';
const PROJECT_SORT_OPTIONS: Array<{ value: InfoModalProjectSort; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'seen-watchlisted-unseen', label: 'Seen->Watchlisted->Unseen' },
  { value: 'new-old', label: 'New->Old' },
];

export function PersonInfoModal({ isOpen, onClose, tmdbId, name, profilePath, onEditPerson }: PersonInfoModalProps) {
  const navigate = useNavigate();
  const [details, setDetails] = useState<PersonDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBiography, setShowBiography] = useState(false);
  const [projectTypeFilter, setProjectTypeFilter] = useState<'ALL' | 'MOVIE' | 'SHOW'>('ALL');
  const [projectRoleFilters, setProjectRoleFilters] = useState<ProjectRoleFilter[]>(ALL_PROJECT_ROLE_FILTERS);
  const [visibleProjectsCount, setVisibleProjectsCount] = useState(20);
  const [projectInfoTarget, setProjectInfoTarget] = useState<{ tmdbId: number; mediaType: 'movie' | 'tv'; title: string; posterPath?: string; releaseDate?: string } | null>(null);
  const [projectEditTarget, setProjectEditTarget] = useState<{ tmdbId: number; mediaType: 'movie' | 'tv'; title: string; posterPath?: string; releaseDate?: string } | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const { settings, updateSettings } = useSettingsStore();
  const {
    byClass: moviesByClass,
    classOrder: movieClassOrder,
    classes: movieClasses,
    getClassLabel: getMovieClassLabel,
    getMovieById,
    addMovieFromSearch,
    updateMovieWatchRecords,
    moveItemToClass: moveMovieToClass,
    removeMovieEntry,
  } = useMoviesStore();
  const {
    byClass: tvByClass,
    classOrder: tvClassOrder,
    classes: tvClasses,
    getClassLabel: getTvClassLabel,
    getShowById,
    addShowFromSearch,
    updateShowWatchRecords,
    moveItemToClass: moveShowToClass,
    removeShowEntry,
  } = useTvStore();
  const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlistStore();

  useEffect(() => {
    if (!isOpen || !tmdbId) return;

    setDetails({
      name,
      profilePath,
      roles: [],
    });
    setVisibleProjectsCount(20);

    const fetchDetails = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const abortController = new AbortController();
        
        const personDetails = await tmdbPersonDetailsFull(tmdbId, abortController.signal);

        if (!personDetails) {
          throw new Error('Failed to fetch person details');
        }

        setDetails({
          name: personDetails.name,
          profilePath: personDetails.profilePath,
          birthday: personDetails.birthday,
          deathday: personDetails.deathday,
          biography: personDetails.biography,
          knownForDepartment: personDetails.knownForDepartment,
          roles: personDetails.roles,
        });
      } catch (err) {
        console.error('Error fetching person details:', err);
        setError(err instanceof Error ? err.message : 'Failed to load details');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [isOpen, tmdbId]);

  // Apply boycott filter to roles
  const filteredRoles = useMemo(() => {
    console.log('=== PersonInfoModal Filter Debug ===');
    console.log('Settings:', settings);
    console.log('BoycottTalkShows enabled:', settings.boycottTalkShows);
    
    if (!details?.roles) {
      console.log('No roles found in details');
      return [];
    }
    
    console.log('Original roles count:', details.roles.length);
    console.log('Original roles:', details.roles.map(r => r.title));
    
    if (!settings.boycottTalkShows && !settings.excludeSelfRoles) {
      console.log('Both filters disabled, returning all roles');
      return details.roles;
    }
    
    const filtered = details.roles.filter(role => {
      const title = role.title.toLowerCase();
      const character = (role.character || '').toLowerCase();
      const job = (role.job || '').toLowerCase();
      
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
      
      const isBoycotted = isBoycottedTalkShow || (settings.excludeSelfRoles && isSelfRole);
      
      if (isBoycotted) {
        console.log('FILTERING OUT:', role.title, `(${role.character || role.job || 'Unknown Role'})`);
        if (isBoycottedTalkShow) console.log('  Reason: Talk show boycott');
        if (settings.excludeSelfRoles && isSelfRole) console.log('  Reason: Self role exclusion');
      }
      
      return !isBoycotted;
    });
    
    console.log('Filtered roles count:', filtered.length);
    console.log('Filtered roles:', filtered.map(r => r.title));
    console.log('=== End Filter Debug ===');
    
    return filtered;
  }, [details?.roles, settings.boycottTalkShows, settings.excludeSelfRoles]);

  const isDirectorJob = (job?: string) => (job || '').toLowerCase().includes('director');
  const isProducerJob = (job?: string) => (job || '').toLowerCase().includes('producer');
  const isCreatorJob = (job?: string) => (job || '').toLowerCase().includes('creator');

  useEffect(() => {
    if (!isOpen) return;
    const dept = (details?.knownForDepartment || '').toLowerCase();
    if (dept === 'acting') {
      setProjectRoleFilters(['ACTOR']);
      return;
    }
    if (dept === 'directing') {
      setProjectRoleFilters(['DIRECTOR']);
      return;
    }
    setProjectRoleFilters(ALL_PROJECT_ROLE_FILTERS);
  }, [isOpen, tmdbId, details?.knownForDepartment]);

  const formatProjectRoleSummary = (role: { character?: string; job?: string }) => {
    const char = role.character?.trim();
    const job = role.job?.trim();
    if (char && job) return `${char} · ${job}`;
    return char || job || 'Unknown Role';
  };

  const displayRoles = useMemo(() => {
    const filtered = filteredRoles.filter((role) => {
      const typeMatch =
        projectTypeFilter === 'ALL' ||
        (projectTypeFilter === 'MOVIE' && role.mediaType === 'movie') ||
        (projectTypeFilter === 'SHOW' && role.mediaType === 'tv');

      const hasCharacter = !!role.character?.trim();
      const director = isDirectorJob(role.job);
      const producer = isProducerJob(role.job);
      const creator = isCreatorJob(role.job);
      const other = !hasCharacter && !director && !producer && !creator;

      if (!projectRoleFilters.length) return false;
      if (hasCharacter && projectRoleFilters.includes('ACTOR')) return typeMatch;
      if (director && projectRoleFilters.includes('DIRECTOR')) return typeMatch;
      if (producer && projectRoleFilters.includes('PRODUCER')) return typeMatch;
      if (creator && projectRoleFilters.includes('CREATOR')) return typeMatch;
      if (other && projectRoleFilters.includes('OTHER')) return typeMatch;
      return false;
    });

    if (settings.infoModalProjectSort === 'new-old') {
      return filtered.slice().sort((a, b) => {
        const ta = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
        const tb = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
        return tb - ta;
      });
    }

    if (settings.infoModalProjectSort === 'seen-watchlisted-unseen') {
      const statusRank = (role: (typeof filtered)[number]) => {
        const entryId = `tmdb-${role.mediaType}-${role.id}`;
        const existing = role.mediaType === 'movie' ? getMovieById(entryId) : getShowById(entryId);
        const seen = (existing?.watchRecords?.length ?? 0) > 0;
        // If both seen and watchlisted, keep it in Seen.
        if (seen) return 0;
        if (isInWatchlist(entryId)) return 1;
        return 2;
      };

      const rankTuple = (role: (typeof filtered)[number]) => {
        const entryId = `tmdb-${role.mediaType}-${role.id}`;
        const byClass = role.mediaType === 'movie' ? moviesByClass : tvByClass;
        const classOrder = role.mediaType === 'movie' ? movieClassOrder : tvClassOrder;
        for (let classIndex = 0; classIndex < classOrder.length; classIndex += 1) {
          const classKey = classOrder[classIndex];
          const items = byClass[classKey] ?? [];
          const itemIndex = items.findIndex((item) => item.id === entryId);
          if (itemIndex !== -1) return [classIndex, itemIndex] as const;
        }
        return [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER] as const;
      };

      return filtered
        .map((role, index) => ({ role, status: statusRank(role), rankTuple: rankTuple(role), index }))
        .sort((a, b) => {
          if (a.status !== b.status) return a.status - b.status;
          if (a.rankTuple[0] !== b.rankTuple[0]) return a.rankTuple[0] - b.rankTuple[0];
          if (a.rankTuple[1] !== b.rankTuple[1]) return a.rankTuple[1] - b.rankTuple[1];
          return a.index - b.index;
        })
        .map((entry) => entry.role);
    }

    return filtered;
  }, [filteredRoles, projectTypeFilter, projectRoleFilters, settings.infoModalProjectSort, getMovieById, getShowById, isInWatchlist]);
  const visibleDisplayRoles = useMemo(
    () => displayRoles.slice(0, visibleProjectsCount),
    [displayRoles, visibleProjectsCount]
  );
  const totalLoadedRoles = filteredRoles.length;
  const groupedVisibleDisplayRoles = useMemo(() => {
    const groups: Record<'seen' | 'watchlisted' | 'unseen', typeof visibleDisplayRoles> = {
      seen: [],
      watchlisted: [],
      unseen: [],
    };

    for (const role of visibleDisplayRoles) {
      const entryId = `tmdb-${role.mediaType}-${role.id}`;
      const existing = role.mediaType === 'movie' ? getMovieById(entryId) : getShowById(entryId);
      const seen = (existing?.watchRecords?.length ?? 0) > 0;
      if (seen) {
        groups.seen.push(role);
        continue;
      }
      if (isInWatchlist(entryId)) {
        groups.watchlisted.push(role);
        continue;
      }
      groups.unseen.push(role);
    }

    return groups;
  }, [visibleDisplayRoles, getMovieById, getShowById, isInWatchlist]);

  useEffect(() => {
    if (!isOpen) return;
    if (visibleProjectsCount >= displayRoles.length) return;
    const timer = window.setTimeout(() => {
      setVisibleProjectsCount((prev) => Math.min(prev + 20, displayRoles.length));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [isOpen, displayRoles.length, visibleProjectsCount]);

  const resolveProjectPosterPath = (project: { id: number; mediaType: 'movie' | 'tv'; posterPath?: string }) => {
    const entryId = `tmdb-${project.mediaType}-${project.id}`;
    const saved = project.mediaType === 'movie' ? getMovieById(entryId) : getShowById(entryId);
    return saved?.posterPath ?? project.posterPath;
  };

  const displayProfilePath = profilePath ?? details?.profilePath;

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      lockBodyScroll();
      return () => {
        unlockBodyScroll();
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  if (projectInfoTarget) {
    return (
      <InfoModal
        isOpen
        onClose={() => setProjectInfoTarget(null)}
        tmdbId={projectInfoTarget.tmdbId}
        mediaType={projectInfoTarget.mediaType}
        title={projectInfoTarget.title}
        posterPath={projectInfoTarget.posterPath}
        releaseDate={projectInfoTarget.releaseDate}
        onEditWatches={() => {
          setProjectInfoTarget(null);
          setProjectEditTarget(projectInfoTarget);
        }}
      />
    );
  }

  if (projectEditTarget) {
    const targetId = `tmdb-${projectEditTarget.mediaType}-${projectEditTarget.tmdbId}`;
    const existingItem = projectEditTarget.mediaType === 'movie' ? getMovieById(targetId) : getShowById(targetId);
    const rankedClasses = (projectEditTarget.mediaType === 'movie' ? movieClasses : tvClasses).map((c) => ({
      key: c.key,
      label: c.label,
      tagline: c.tagline,
      isRanked: c.isRanked,
    }));
    const currentClassLabel = existingItem
      ? projectEditTarget.mediaType === 'movie'
        ? getMovieClassLabel(existingItem.classKey)
        : getTvClassLabel(existingItem.classKey)
      : undefined;

    return (
      <UniversalEditModal
        target={{
          id: targetId,
          tmdbId: projectEditTarget.tmdbId,
          title: projectEditTarget.title,
          posterPath: projectEditTarget.posterPath,
          mediaType: projectEditTarget.mediaType,
          subtitle: projectEditTarget.releaseDate ? String(projectEditTarget.releaseDate.slice(0, 4)) : undefined,
          releaseDate: projectEditTarget.releaseDate,
          existingClassKey: existingItem?.classKey,
        } as UniversalEditTarget}
        rankedClasses={rankedClasses}
        initialWatches={existingItem?.watchRecords}
        currentClassKey={existingItem?.classKey}
        currentClassLabel={currentClassLabel}
        isWatchlistItem={isInWatchlist(targetId)}
        onAddToWatchlist={() => {
          addToWatchlist(
            {
              id: targetId,
              title: projectEditTarget.title,
              posterPath: projectEditTarget.posterPath,
              releaseDate: projectEditTarget.releaseDate
            },
            projectEditTarget.mediaType === 'movie' ? 'movies' : 'tv'
          );
        }}
        onRemoveFromWatchlist={() => {
          removeFromWatchlist(targetId);
        }}
        onGoToWatchlist={() => {
          setProjectEditTarget(null);
          navigate('/watchlist', { state: { scrollToId: targetId } });
        }}
        onGoPickTemplate={() => {
          setProjectEditTarget(null);
          navigate(
            projectEditTarget.mediaType === 'movie' ? '/movies#movie-class-templates' : '/tv#tv-class-templates',
            { replace: true }
          );
        }}
        isSaving={isSavingProject}
        onClose={() => setProjectEditTarget(null)}
        onRemoveEntry={(itemId: string) => {
          if (projectEditTarget.mediaType === 'movie') removeMovieEntry(itemId);
          else removeShowEntry(itemId);
          setProjectEditTarget(null);
        }}
        onSave={async (params) => {
          const watches = prepareWatchRecordsForSave(
            watchMatrixEntriesToWatchRecords(params.watches),
            targetId,
            moviesByClass,
            tvByClass,
            movieClassOrder,
            tvClassOrder
          );

          setIsSavingProject(true);
          try {
            if (projectEditTarget.mediaType === 'movie') {
              if (!getMovieById(targetId)) {
                addMovieFromSearch({
                  id: targetId,
                  title: projectEditTarget.title,
                  subtitle: 'Saved',
                  classKey: params.classKey || 'UNRANKED',
                  posterPath: projectEditTarget.posterPath,
                });
              }
              updateMovieWatchRecords(targetId, watches);
              if (params.classKey) {
                moveMovieToClass(targetId, params.classKey, params.position === 'top' ? { toTop: true } : params.position === 'middle' ? { toMiddle: true } : undefined);
              }
            } else {
              if (!getShowById(targetId)) {
                addShowFromSearch({
                  id: targetId,
                  title: projectEditTarget.title,
                  subtitle: 'Saved',
                  classKey: params.classKey || 'UNRANKED',
                });
              }
              updateShowWatchRecords(targetId, watches);
              if (params.classKey) {
                moveShowToClass(targetId, params.classKey, params.position === 'top' ? { toTop: true } : params.position === 'middle' ? { toMiddle: true } : undefined);
              }
            }
            setProjectEditTarget(null);
          } finally {
            setIsSavingProject(false);
          }
        }}
      />
    );
  }

  const getYear = (date?: string) => {
    if (!date) return '';
    return date.split('-')[0];
  };

  const formatDate = (date?: string) => {
    if (!date) return 'Unknown';
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(date).toLocaleDateString(undefined, options);
  };

  const getAge = () => {
    if (!details?.birthday) return '';
    const birth = new Date(details.birthday);
    const death = details.deathday ? new Date(details.deathday) : new Date();
    const age = death.getFullYear() - birth.getFullYear();
    const monthDiff = death.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && death.getDate() < birth.getDate())) {
      return age - 1;
    }
    return age;
  };

  const getDepartmentLabel = (department?: string) => {
    switch (department) {
      case 'Acting': return 'Actor';
      case 'Directing': return 'Director';
      case 'Writing': return 'Writer';
      case 'Production': return 'Producer';
      default: return department || 'Unknown';
    }
  };
  const isRoleFilterActive = (filter: ProjectRoleFilter) => projectRoleFilters.includes(filter);
  const handleProjectTypeFilterChange = (next: 'ALL' | 'MOVIE' | 'SHOW') => {
    // Preserve the currently rendered amount when broadening/narrowing filters.
    setVisibleProjectsCount((prev) => Math.min(prev, displayRoles.length));
    setProjectTypeFilter(next);
  };
  const toggleRoleFilter = (filter: ProjectRoleFilter) => {
    // Preserve the currently rendered amount when broadening/narrowing role filters.
    setVisibleProjectsCount((prev) => Math.min(prev, displayRoles.length));
    setProjectRoleFilters((prev) => {
      if (prev.includes(filter)) {
        return prev.filter((item) => item !== filter);
      }
      return [...prev, filter];
    });
  };

  return (
    <div className="info-modal-backdrop" onClick={onClose}>
      <div className="info-modal" onClick={e => e.stopPropagation()}>
        {/* Main Content */}
        <div className="info-modal-content">
          {!details && loading ? (
            <div className="info-modal-loading">
              <div className="loading-spinner"></div>
              <p>Loading details...</p>
            </div>
          ) : error && !details ? (
            <div className="info-modal-error">
              <p>{error}</p>
              <button onClick={onClose}>Close</button>
            </div>
          ) : details ? (
            <>
              {/* Top Section: Profile + Basic Info */}
              <div className="info-modal-top">
                <div className="info-modal-poster">
                  {displayProfilePath ? (
                    <img src={tmdbImagePath(displayProfilePath, 'w300')!} alt={details.name} />
                  ) : (
                    <div className="info-modal-poster-placeholder">
                      <Info size={48} />
                    </div>
                  )}
                </div>
                
                <div className="info-modal-basic-info">
                  <div className="info-modal-title-row">
                    <h1 className="info-modal-title">{details.name}</h1>
                    <button className="info-modal-close" onClick={onClose}>
                      <X size={24} />
                    </button>
                  </div>
                  <div className="info-modal-meta">
                    {details.knownForDepartment && (
                      <span className="info-modal-genre-tag-inline">{getDepartmentLabel(details.knownForDepartment)}</span>
                    )}
                  </div>
                  
                  {/* Biography - Clickable */}
                  {details.biography && (
                    <div className="info-modal-synopsis-section">
                      <div 
                        className="info-modal-synopsis-box"
                        onClick={() => setShowBiography(!showBiography)}
                      >
                        <p>{showBiography ? details.biography : 'Click to read biography...'}</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Additional Information */}
                  <div className="info-modal-additional-info-top">
                    {details.birthday && (
                      <div className="info-modal-info-item">
                        <Calendar size={16} />
                        <span>
                          Born: {formatDate(details.birthday)}
                          {details.deathday
                            ? ` - Died: ${formatDate(details.deathday)}${getAge() ? ` (age at death ${getAge()})` : ''}`
                            : getAge()
                              ? ` (age ${getAge()})`
                              : ''}
                        </span>
                      </div>
                    )}
                    {details.knownForDepartment && (
                      <div className="info-modal-info-item">
                        <PlayCircle size={16} />
                        <span>Known for: {getDepartmentLabel(details.knownForDepartment)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Projects Section (equivalent to Cast section) */}
              <div className="info-modal-section">
                <div className="info-modal-section-header">
                  <div className="info-modal-section-title-group">
                    <h3 className="info-modal-section-title">Projects</h3>
                    <span className="info-modal-section-count">
                      {visibleDisplayRoles.length}/{totalLoadedRoles}
                    </span>
                  </div>
                  <div className="info-modal-inline-toggles">
                    <div className="info-modal-inline-toggle-group">
                      <span className="info-modal-inline-toggle-label">Sort:</span>
                      <ThemedDropdown<InfoModalProjectSort>
                        value={settings.infoModalProjectSort}
                        options={PROJECT_SORT_OPTIONS}
                        onChange={(value) => {
                          setVisibleProjectsCount((prev) => Math.min(prev, displayRoles.length));
                          updateSettings({ infoModalProjectSort: value });
                        }}
                        className="info-modal-project-sort-dropdown"
                        aria-label="Project sort"
                      />
                    </div>
                    <div className="info-modal-inline-toggle-group">
                      <span className="info-modal-inline-toggle-label">Type:</span>
                      <div className="info-modal-inline-toggle-options">
                        {(['ALL', 'MOVIE', 'SHOW'] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={`info-modal-inline-toggle-btn ${projectTypeFilter === option ? 'is-active' : ''}`}
                            onClick={() => handleProjectTypeFilterChange(option)}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="info-modal-inline-toggle-group">
                      <span className="info-modal-inline-toggle-label">Roles shown:</span>
                      <div className="info-modal-inline-toggle-options">
                        {(['ACTOR', 'DIRECTOR', 'PRODUCER', 'CREATOR', 'OTHER'] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={`info-modal-inline-toggle-btn ${isRoleFilterActive(option) ? 'is-active' : ''}`}
                            onClick={() => toggleRoleFilter(option)}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="info-modal-cast-scroll">
                  {(settings.infoModalProjectSort === 'seen-watchlisted-unseen'
                    ? ([
                        ...groupedVisibleDisplayRoles.seen.map((project) => ({ kind: 'project' as const, project })),
                        ...(groupedVisibleDisplayRoles.seen.length > 0 && groupedVisibleDisplayRoles.watchlisted.length > 0
                          ? [{ kind: 'divider' as const, key: 'seen-watchlisted' }]
                          : []),
                        ...groupedVisibleDisplayRoles.watchlisted.map((project) => ({ kind: 'project' as const, project })),
                        ...(groupedVisibleDisplayRoles.watchlisted.length > 0 && groupedVisibleDisplayRoles.unseen.length > 0
                          ? [{ kind: 'divider' as const, key: 'watchlisted-unseen' }]
                          : []),
                        ...groupedVisibleDisplayRoles.unseen.map((project) => ({ kind: 'project' as const, project })),
                      ] as Array<
                        | { kind: 'project'; project: (typeof visibleDisplayRoles)[number] }
                        | { kind: 'divider'; key: string }
                      >)
                    : visibleDisplayRoles.map((project) => ({ kind: 'project' as const, project }))
                  ).map((entry) =>
                    entry.kind === 'divider' ? (
                      <div key={entry.key} className="info-modal-cast-divider info-modal-cast-divider--projects" aria-hidden="true" />
                    ) : (
                      <div key={`${entry.project.mediaType}-${entry.project.id}`} className="info-modal-cast-member">
                        {(() => {
                          const project = entry.project;
                          const entryId = `tmdb-${project.mediaType}-${project.id}`;
                          const savedEntry = project.mediaType === 'movie' ? getMovieById(entryId) : getShowById(entryId);
                          const saved = !!savedEntry;
                          const canToggleUnranked = !savedEntry || savedEntry.classKey === 'UNRANKED';
                          const isUnranked = savedEntry?.classKey === 'UNRANKED';
                          const resolvedPosterPath = resolveProjectPosterPath(project);
                          const onWatchlist = isInWatchlist(entryId);
                          return (
                            <div className="info-modal-person-card">
                              {resolvedPosterPath ? (
                                <img src={tmdbImagePath(resolvedPosterPath, 'w300')!} alt={project.title} className="info-modal-cast-portrait" />
                              ) : (
                                <div className="info-modal-cast-placeholder info-modal-cast-portrait">{project.title[0]}</div>
                              )}
                              {onWatchlist ? (
                                <span className="info-modal-person-watchlist-badge">Watchlisted</span>
                              ) : null}
                              <div className="info-modal-project-hover-actions">
                                {canToggleUnranked ? (
                                  <button
                                    type="button"
                                    className={`info-modal-project-hover-btn ${
                                      isUnranked ? 'info-modal-project-hover-btn--minus' : 'info-modal-project-hover-btn--plus'
                                    }`}
                                    aria-label={isUnranked ? `Remove ${project.title} from unranked` : `Add ${project.title} to unranked`}
                                    onClick={() => {
                                      if (project.mediaType === 'movie') {
                                        if (isUnranked) {
                                          removeMovieEntry(entryId);
                                          return;
                                        }
                                        if (savedEntry) {
                                          moveMovieToClass(entryId, 'UNRANKED');
                                          return;
                                        }
                                        addMovieFromSearch({
                                          id: entryId,
                                          title: project.title,
                                          subtitle: project.releaseDate ? project.releaseDate.slice(0, 4) : 'Saved',
                                          classKey: 'UNRANKED',
                                          posterPath: resolvedPosterPath,
                                        });
                                        return;
                                      }

                                      if (isUnranked) {
                                        removeShowEntry(entryId);
                                        return;
                                      }
                                      if (savedEntry) {
                                        moveShowToClass(entryId, 'UNRANKED');
                                        return;
                                      }
                                      addShowFromSearch({
                                        id: entryId,
                                        title: project.title,
                                        subtitle: project.releaseDate ? project.releaseDate.slice(0, 4) : 'Saved',
                                        classKey: 'UNRANKED',
                                      });
                                    }}
                                  >
                                    {isUnranked ? 'Unranked-' : 'Unranked+'}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className={`info-modal-project-hover-btn ${
                                    onWatchlist ? 'info-modal-project-hover-btn--minus' : 'info-modal-project-hover-btn--plus'
                                  }`}
                                  aria-label={onWatchlist ? `Remove ${project.title} from watchlist` : `Add ${project.title} to watchlist`}
                                  onClick={() => {
                                    if (onWatchlist) {
                                      removeFromWatchlist(entryId);
                                      return;
                                    }
                                    addToWatchlist(
                                      {
                                        id: entryId,
                                        title: project.title,
                                        posterPath: resolvedPosterPath,
                                        releaseDate: project.releaseDate,
                                      },
                                      project.mediaType === 'movie' ? 'movies' : 'tv'
                                    );
                                  }}
                                >
                                  {onWatchlist ? 'Watchlist-' : 'Watchlist+'}
                                </button>
                              </div>
                              <div className="info-modal-person-actions">
                                <button
                                  type="button"
                                  className={`info-modal-person-action-btn ${saved ? 'info-modal-person-action-btn--saved' : ''}`}
                                  title={`View ${project.title} info`}
                                  onClick={() => setProjectInfoTarget({
                                    tmdbId: project.id,
                                    mediaType: project.mediaType,
                                    title: project.title,
                                    posterPath: resolvedPosterPath,
                                    releaseDate: project.releaseDate,
                                  })}
                                >
                                  <Info size={13} />
                                </button>
                                <button
                                  type="button"
                                  className={`info-modal-person-action-btn ${saved ? 'info-modal-person-action-btn--saved' : ''}`}
                                  title={saved ? `Edit ${project.title}` : `Add ${project.title}`}
                                  onClick={() => setProjectEditTarget({
                                    tmdbId: project.id,
                                    mediaType: project.mediaType,
                                    title: project.title,
                                    posterPath: resolvedPosterPath,
                                    releaseDate: project.releaseDate,
                                  })}
                                >
                                  {saved ? <Edit size={13} /> : <Plus size={13} />}
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                        <div className="info-modal-cast-info">
                          <div className="info-modal-cast-name">{entry.project.title}</div>
                          <div className="info-modal-cast-character">
                            {formatProjectRoleSummary(entry.project)} • {entry.project.mediaType === 'movie' ? 'Movie' : 'TV Show'}
                            {entry.project.releaseDate && ` • ${getYear(entry.project.releaseDate)}`}
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
