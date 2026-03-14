import React, { useState, useEffect } from 'react';
import { X, Info, Calendar, PlayCircle, Edit } from 'lucide-react';
import { tmdbPersonDetailsFull, tmdbImagePath, type TmdbPersonCache } from '../lib/tmdb';
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

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = orig || 'unset'; };
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
                  {details.roles.slice(0, 20).map(project => (
                    <div key={`${project.mediaType}-${project.id}`} className="info-modal-cast-member">
                      {project.posterPath ? (
                        <img src={tmdbImagePath(project.posterPath, 'w300')!} alt={project.title} />
                      ) : (
                        <div className="info-modal-cast-placeholder">{project.title[0]}</div>
                      )}
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
