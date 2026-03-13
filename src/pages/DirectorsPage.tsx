import { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RandomQuote } from '../components/RandomQuote';
import { RankedList } from '../components/RankedList';
import { EntryRowPerson } from '../components/EntryRowPerson';
import { useDirectorsStore, DirectorItem } from '../state/directorsStore';
import { usePageState } from '../hooks/usePageState';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTotalMinutesFromRecords } from '../state/moviesStore';
import { PageSearch } from '../components/PageSearch';
import { PersonRankingModal, type PersonRankingSaveParams } from '../components/PersonRankingModal';
import { UniversalEditModal, type UniversalEditSaveParams } from '../components/UniversalEditModal';
import type { WatchRecord } from '../components/EntryRowMovieShow';
import { ViewToggle } from '../components/ViewToggle';
import { useMobileViewMode } from '../hooks/useMobileViewMode';
import { ClassJumpButtons } from '../components/ClassJumpButtons';
import { tmdbMovieDetailsFull, tmdbTvDetailsFull, tmdbImagePath } from '../lib/tmdb';

export function DirectorsPage() {
  const { scrollContainerRef } = usePageState<HTMLDivElement>('directors');
  const {
    byClass,
    classOrder,
    classes,
    moveItemToClass,
    reorderWithinClass,
    moveItemWithinClass,
    updateDirectorCache,
    removeDirectorEntry
  } = useDirectorsStore();
  const { byClass: moviesByClass, addWatchToMovie, moveItemToClass: moveMovieToClass, classes: movieClasses, addMovieFromSearch } = useMoviesStore();
  const { byClass: tvByClass, addWatchToShow, moveItemToClass: moveTvToClass, classes: tvClasses, addShowFromSearch } = useTvStore();
  const watchlist = useWatchlistStore();
  const { settings } = useSettingsStore();
  const mobileViewMode = useMobileViewMode();
  const navigate = useNavigate();
  const [recordTarget, setRecordTarget] = useState<DirectorItem | null>(null);
  const [recordMediaTarget, setRecordMediaTarget] = useState<{ id: number; title: string; posterPath?: string; mediaType: 'movie' | 'tv'; releaseDate?: string } | null>(null);
  const [isSavingMedia, setIsSavingMedia] = useState(false);
  const hasActiveModal = !!recordTarget || !!recordMediaTarget;

  const location = useLocation();
  const scrollToId = location.state?.scrollToId;

  useEffect(() => {
    if (scrollToId) {
      const el = document.querySelector(`[data-item-id="${scrollToId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [scrollToId]);

  const handleOpenSettings = (item: DirectorItem) => {
    setRecordTarget(item);
  };

  const handleCloseModal = () => {
    setRecordTarget(null);
    setRecordMediaTarget(null);
  };

  const handleRecordMedia = (media: { id: number; title: string; posterPath?: string; mediaType: 'movie' | 'tv'; releaseDate?: string }) => {
    setRecordMediaTarget(media);
  };

  const handleSaveMedia = async (params: any, goToMedia: boolean) => {
    if (!recordMediaTarget) return;
    
    setIsSavingMedia(true);
    
    try {
      const id = recordMediaTarget.mediaType === 'movie' ? `tmdb-movie-${recordMediaTarget.id}` : `tmdb-tv-${recordMediaTarget.id}`;
      
      if (recordMediaTarget.mediaType === 'movie') {
        // Fetch full movie details first
        const cache = await tmdbMovieDetailsFull(recordMediaTarget.id);
        
        // Add the movie to the store with full data
        addMovieFromSearch({
          id,
          title: recordMediaTarget.title,
          subtitle: 'Saved',
          classKey: params.classKey || 'UNRANKED',
          posterPath: recordMediaTarget.posterPath,
          cache: cache || undefined,
          toTop: params.position === 'top',
          toMiddle: params.position === 'middle'
        });
        
        // Then add the watch record
        addWatchToMovie(id, params.watches[0]);
        
        // Move to class if specified (and different from initial class)
        if (params.classKey && params.classKey !== 'UNRANKED') {
          moveMovieToClass(id, params.classKey, {
            toTop: params.position === 'top',
            toMiddle: params.position === 'middle'
          });
        }
      } else {
        // Fetch full TV show details first
        const cache = await tmdbTvDetailsFull(recordMediaTarget.id);
        
        // Add the TV show to the store with full data
        addShowFromSearch({
          id,
          title: recordMediaTarget.title,
          subtitle: 'Saved',
          classKey: params.classKey || 'UNRANKED',
          cache: cache || undefined,
          toTop: params.position === 'top',
          toMiddle: params.position === 'middle'
        });
        
        // Then add the watch record
        addWatchToShow(id, params.watches[0]);
        
        // Move to class if specified (and different from initial class)
        if (params.classKey && params.classKey !== 'UNRANKED') {
          moveTvToClass(id, params.classKey, {
            toTop: params.position === 'top',
            toMiddle: params.position === 'middle'
          });
        }
      }
      
      setRecordMediaTarget(null);
      
      if (goToMedia) {
        // Navigate to the appropriate page
        const page = recordMediaTarget.mediaType === 'movie' ? '/movies' : '/tv';
        
        // Navigate to the page with scroll state
        setTimeout(() => {
          navigate(page, { state: { scrollToId: id } });
        }, 100);
      }
    } catch (error) {
      console.error('Error saving media:', error);
    } finally {
      setIsSavingMedia(false);
    }
  };

  const handleSaveRanking = (params: PersonRankingSaveParams, goToDirectors: boolean) => {
    if (!recordTarget) return;
    const { classKey, position } = params;
    if (classKey) {
      moveItemToClass(recordTarget.id, classKey, {
        toTop: position === 'top',
        toMiddle: position === 'middle'
      });
    }
    setRecordTarget(null);

    if (goToDirectors) {
      setTimeout(() => {
        const el = document.querySelector(`[data-item-id="${recordTarget.id}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };


  const rankedClassesForModal = useMemo(() =>
    classes.map(c => ({
      key: c.key,
      label: c.label,
      tagline: c.tagline,
      isRanked: c.isRanked
    }))
    , [classes]);

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Directors</h1>
          <RandomQuote />
        </div>
        {!hasActiveModal && (
          <div className="page-actions-row">
            <ViewToggle />
          </div>
        )}
      </header>

      {/* Mobile version using watchlist pattern */}
      <div className="ranked-list-mobile">
        <div className="main-page-tiles">
          {Object.values(byClass).flat().map((item: DirectorItem) => (
            <div key={item.id} className="main-page-tile">
              <div className="main-page-tile-poster">
                {item.profilePath ? (
                  <img
                    src={tmdbImagePath(item.profilePath, 'w154') || undefined}
                    alt={item.title}
                    loading="lazy"
                  />
                ) : (
                  <div className="main-page-tile-poster-placeholder">🎬</div>
                )}
              </div>
              <div className="main-page-tile-info">
                <h3 className="main-page-tile-title">{item.title}</h3>
                <p className="main-page-tile-meta">
                  {item.knownForDepartment || ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <RankedList<DirectorItem>
        ref={scrollContainerRef}
        viewMode={mobileViewMode}
        classOrder={classOrder}
        itemsByClass={byClass}
        getClassLabel={(key) => classes.find(c => c.key === key)?.label ?? key}
        getClassTagline={(key) => classes.find(c => c.key === key)?.tagline}
        onReorderWithinClass={reorderWithinClass}
        onMoveBetweenClasses={moveItemToClass}
        renderRow={(item) => (
          <EntryRowPerson
            item={item as any}
            onUpdateCache={updateDirectorCache}
            onOpenSettings={handleOpenSettings}
            onRecordMedia={handleRecordMedia}
            onMoveUp={() => moveItemWithinClass(item.id, -1)}
            onMoveDown={() => moveItemWithinClass(item.id, 1)}
            onClassUp={() => {
              const idx = classOrder.indexOf(item.classKey);
              if (idx > 0) moveItemToClass(item.id, classOrder[idx - 1]);
            }}
            onClassDown={() => {
              const idx = classOrder.indexOf(item.classKey);
              if (idx < classOrder.length - 1) moveItemToClass(item.id, classOrder[idx + 1], { toTop: true });
            }}
          />
        )}
      />

      {/* Person Ranking Modal for Director */}
      {recordTarget && (
        <PersonRankingModal
          target={{
            id: recordTarget.id,
            tmdbId: recordTarget.tmdbId,
            name: recordTarget.title,
            profilePath: recordTarget.profilePath,
            mediaType: 'director',
          }}
          currentClassKey={recordTarget.classKey}
          currentClassLabel={classes.find(c => c.key === recordTarget.classKey)?.label ?? recordTarget.classKey}
          rankedClasses={rankedClassesForModal}
          isSaving={false}
          onSave={handleSaveRanking}
          onClose={handleCloseModal}
          onRemoveEntry={(id: string) => {
            removeDirectorEntry(id);
            handleCloseModal();
          }}
        />
      )}

      {/* Universal Edit Modal for Media */}
      {recordMediaTarget && (
        <UniversalEditModal
          target={{
            id: recordMediaTarget.mediaType === 'movie' ? `tmdb-movie-${recordMediaTarget.id}` : `tmdb-tv-${recordMediaTarget.id}`,
            tmdbId: recordMediaTarget.id,
            title: recordMediaTarget.title,
            posterPath: recordMediaTarget.posterPath,
            mediaType: recordMediaTarget.mediaType,
            subtitle: recordMediaTarget.releaseDate ? String(recordMediaTarget.releaseDate.slice(0, 4)) : undefined,
            releaseDate: recordMediaTarget.releaseDate,
          }}
          currentClassKey="UNRANKED"
          currentClassLabel="Unranked"
          isWatchlistItem={watchlist.isInWatchlist(recordMediaTarget.mediaType === 'movie' ? `tmdb-movie-${recordMediaTarget.id}` : `tmdb-tv-${recordMediaTarget.id}`)}
          rankedClasses={
            recordMediaTarget.mediaType === 'movie'
              ? movieClasses.map(c => ({ key: c.key, label: c.label, tagline: c.tagline, isRanked: c.isRanked }))
              : tvClasses.map(c => ({ key: c.key, label: c.label, tagline: c.tagline, isRanked: c.isRanked }))
          }
          isSaving={isSavingMedia}
          onClose={() => setRecordMediaTarget(null)}
          onSave={async (params, goToMedia) => {
            // Convert matrix entries to watch records
            const watchRecords = params.watches.map((w) => {
              let type: WatchRecord['type'] = 'DATE';
              if (w.watchType === 'DATE_RANGE') type = 'RANGE';
              else if (w.watchType === 'LONG_AGO') {
                type = w.watchStatus === 'DNF' ? 'DNF_LONG_AGO' : 'LONG_AGO';
              }
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

            const id = recordMediaTarget.mediaType === 'movie' ? `tmdb-movie-${recordMediaTarget.id}` : `tmdb-tv-${recordMediaTarget.id}`;
            
            if (recordMediaTarget.mediaType === 'movie') {
              const cache = await tmdbMovieDetailsFull(recordMediaTarget.id);
              addMovieFromSearch({
                id,
                title: recordMediaTarget.title,
                subtitle: 'Saved',
                classKey: params.classKey || 'UNRANKED',
                posterPath: recordMediaTarget.posterPath,
                cache: cache || undefined,
                toTop: params.position === 'top',
                toMiddle: params.position === 'middle'
              });
              if (watchRecords.length > 0) addWatchToMovie(id, watchRecords[0]);
              if (params.classKey && params.classKey !== 'UNRANKED') {
                moveMovieToClass(id, params.classKey, {
                  toTop: params.position === 'top',
                  toMiddle: params.position === 'middle'
                });
              }
            } else {
              const cache = await tmdbTvDetailsFull(recordMediaTarget.id);
              addShowFromSearch({
                id,
                title: recordMediaTarget.title,
                subtitle: 'Saved',
                classKey: params.classKey || 'UNRANKED',
                cache: cache || undefined,
                toTop: params.position === 'top',
                toMiddle: params.position === 'middle'
              });
              if (watchRecords.length > 0) addWatchToShow(id, watchRecords[0]);
              if (params.classKey && params.classKey !== 'UNRANKED') {
                moveTvToClass(id, params.classKey, {
                  toTop: params.position === 'top',
                  toMiddle: params.position === 'middle'
                });
              }
            }
            
            setRecordMediaTarget(null);
            
            if (goToMedia) {
              const page = recordMediaTarget.mediaType === 'movie' ? '/movies' : '/tv';
              setTimeout(() => {
                navigate(page, { state: { scrollToId: id } });
              }, 100);
            }
          }}
          onAddToWatchlist={() => {
            const id = recordMediaTarget.mediaType === 'movie' ? `tmdb-movie-${recordMediaTarget.id}` : `tmdb-tv-${recordMediaTarget.id}`;
            watchlist.addToWatchlist(
              {
                id,
                title: recordMediaTarget.title,
                posterPath: recordMediaTarget.posterPath,
                releaseDate: recordMediaTarget.releaseDate,
              },
              recordMediaTarget.mediaType === 'movie' ? 'movies' : 'tv'
            );
          }}
          onRemoveFromWatchlist={() => {
            const id = recordMediaTarget.mediaType === 'movie' ? `tmdb-movie-${recordMediaTarget.id}` : `tmdb-tv-${recordMediaTarget.id}`;
            watchlist.removeFromWatchlist(id);
          }}
          onGoToWatchlist={() => {
            const id = recordMediaTarget.mediaType === 'movie' ? `tmdb-movie-${recordMediaTarget.id}` : `tmdb-tv-${recordMediaTarget.id}`;
            navigate('/watchlist', { state: { scrollToId: id } });
          }}
        />
      )}
      <PageSearch
        items={Object.values(byClass).flat().map(i => ({ id: i.id, title: i.title }))}
        onSelect={(id) => {
          const el = document.querySelector(`[data-item-id="${id}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
        placeholder="Search directors..."
        className="page-search-locked"
        pageKey="directors"
      />
      <div className="class-jump-buttons-mobile-hidden">
        <ClassJumpButtons classes={classOrder.map((k) => ({ key: k, label: classes.find(c => c.key === k)?.label ?? k }))} />
      </div>
    </section>
  );
}
