import React, { useState, useEffect, useMemo } from 'react';
import { X, Info, Calendar, PlayCircle, Edit, Plus } from 'lucide-react';
import { tmdbPersonDetailsFull, tmdbImagePath, type TmdbPersonCache } from '../lib/tmdb';
import { useSettingsStore } from '../state/settingsStore';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { InfoModal } from './InfoModal';
import { UniversalEditModal, type UniversalEditTarget } from './UniversalEditModal';
import type { WatchRecord } from './EntryRowMovieShow';
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

export function PersonInfoModal({ isOpen, onClose, tmdbId, name, profilePath, onEditPerson }: PersonInfoModalProps) {
  const [details, setDetails] = useState<PersonDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBiography, setShowBiography] = useState(false);
  const [projectInfoTarget, setProjectInfoTarget] = useState<{ tmdbId: number; mediaType: 'movie' | 'tv'; title: string; posterPath?: string; releaseDate?: string } | null>(null);
  const [projectEditTarget, setProjectEditTarget] = useState<{ tmdbId: number; mediaType: 'movie' | 'tv'; title: string; posterPath?: string; releaseDate?: string } | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const { settings } = useSettingsStore();
  const { classes: movieClasses, getClassLabel: getMovieClassLabel, getMovieById, addMovieFromSearch, updateMovieWatchRecords, moveItemToClass: moveMovieToClass, removeMovieEntry } = useMoviesStore();
  const { classes: tvClasses, getClassLabel: getTvClassLabel, getShowById, addShowFromSearch, updateShowWatchRecords, moveItemToClass: moveShowToClass, removeShowEntry } = useTvStore();

  useEffect(() => {
    if (!isOpen || !tmdbId) return;

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
  }, [details?.roles, settings.boycottTalkShows]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = orig || 'unset'; };
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
        isSaving={isSavingProject}
        onClose={() => setProjectEditTarget(null)}
        onRemoveEntry={(itemId: string) => {
          if (projectEditTarget.mediaType === 'movie') removeMovieEntry(itemId);
          else removeShowEntry(itemId);
          setProjectEditTarget(null);
        }}
        onSave={async (params) => {
          const watches: WatchRecord[] = params.watches.map((w: any) => {
            let type: WatchRecord['type'] = 'DATE';
            if (w.watchType === 'DATE_RANGE') type = 'RANGE';
            else if (w.watchType === 'LONG_AGO') type = w.watchStatus === 'DNF' ? 'DNF_LONG_AGO' : 'LONG_AGO';
            if (w.watchStatus === 'WATCHING' && w.watchType !== 'LONG_AGO') type = 'CURRENT';
            else if (w.watchStatus === 'DNF' && w.watchType !== 'LONG_AGO') type = 'DNF';
            return {
              id: w.id,
              type,
              year: w.year,
              month: w.month,
              day: w.day,
              endYear: w.endYear,
              endMonth: w.endMonth,
              endDay: w.endDay,
              dnfPercent: w.watchPercent < 100 ? w.watchPercent : undefined,
            };
          });

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

  return (
    <div className="info-modal-backdrop" onClick={onClose}>
      <div className="info-modal" onClick={e => e.stopPropagation()}>
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
              {/* Top Section: Profile + Basic Info */}
              <div className="info-modal-top">
                <div className="info-modal-poster">
                  {details.profilePath ? (
                    <img src={tmdbImagePath(details.profilePath, 'w300')!} alt={details.name} />
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
                          {getAge() && ` (age ${getAge()})`}
                          {details.deathday && ` - Died: {formatDate(details.deathday)}`}
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
                <h3 className="info-modal-section-title">Projects</h3>
                <div className="info-modal-cast-scroll">
                  {filteredRoles.slice(0, 20).map(project => (
                    <div key={`${project.mediaType}-${project.id}`} className="info-modal-cast-member">
                      {(() => {
                        const entryId = `tmdb-${project.mediaType}-${project.id}`;
                        const saved = project.mediaType === 'movie' ? !!getMovieById(entryId) : !!getShowById(entryId);
                        return (
                          <div className="info-modal-person-card">
                            {project.posterPath ? (
                              <img src={tmdbImagePath(project.posterPath, 'w300')!} alt={project.title} className="info-modal-cast-portrait" />
                            ) : (
                              <div className="info-modal-cast-placeholder info-modal-cast-portrait">{project.title[0]}</div>
                            )}
                            <div className="info-modal-person-actions">
                              <button
                                type="button"
                                className={`info-modal-person-action-btn ${saved ? 'info-modal-person-action-btn--saved' : ''}`}
                                title={`View ${project.title} info`}
                                onClick={() => setProjectInfoTarget({
                                  tmdbId: project.id,
                                  mediaType: project.mediaType,
                                  title: project.title,
                                  posterPath: project.posterPath,
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
                                  posterPath: project.posterPath,
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
                        <div className="info-modal-cast-name">{project.title}</div>
                        <div className="info-modal-cast-character">
                          {project.character || project.job || 'Unknown Role'} • {project.mediaType === 'movie' ? 'Movie' : 'TV Show'}
                          {project.releaseDate && ` • ${getYear(project.releaseDate)}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
