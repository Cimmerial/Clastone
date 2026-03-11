import { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RandomQuote } from '../components/RandomQuote';
import { RankedList } from '../components/RankedList';
import { EntryRowPerson } from '../components/EntryRowPerson';
import { usePeopleStore, PersonItem } from '../state/peopleStore';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTotalMinutesFromRecords } from '../state/moviesStore';
import { PageSearch } from '../components/PageSearch';
import { RecordWatchModal, type RecordWatchSaveParams } from '../components/RecordWatchModal';
import { ViewToggle } from '../components/ViewToggle';
import { useMobileViewMode } from '../hooks/useMobileViewMode';
import { tmdbMovieDetailsFull, tmdbTvDetailsFull } from '../lib/tmdb';

export function ActorsPage() {
  const {
    byClass,
    classOrder,
    classes,
    moveItemToClass,
    reorderWithinClass,
    moveItemWithinClass,
    updatePersonCache,
    removePersonEntry
  } = usePeopleStore();
  const { byClass: moviesByClass, addWatchToMovie, moveItemToClass: moveMovieToClass, classes: movieClasses, addMovieFromSearch } = useMoviesStore();
  const { byClass: tvByClass, addWatchToShow, moveItemToClass: moveTvToClass, classes: tvClasses, addShowFromSearch } = useTvStore();
  const { settings } = useSettingsStore();
  const mobileViewMode = useMobileViewMode();
  const navigate = useNavigate();
  const [recordTarget, setRecordTarget] = useState<PersonItem | null>(null);
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

  const flatItems = useMemo(() => Object.values(byClass).flat(), [byClass]);

  const handleOpenSettings = (item: PersonItem) => {
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

  const handleSaveRanking = (params: RecordWatchSaveParams, goToActors: boolean) => {
    if (!recordTarget) return;
    const { classKey, position } = params;
    if (classKey) {
      moveItemToClass(recordTarget.id, classKey, {
        toTop: position === 'top',
        toMiddle: position === 'middle'
      });
    }
    setRecordTarget(null);

    if (goToActors) {
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
          <h1 className="page-title">Actors</h1>
          <RandomQuote />
        </div>
        {!hasActiveModal && (
          <div className="page-actions-row">
            <ViewToggle />
          </div>
        )}
      </header>

      <RankedList<PersonItem>
        viewMode={mobileViewMode}
        classOrder={classOrder}
        itemsByClass={byClass}
        getClassLabel={(key) => classes.find(c => c.key === key)?.label ?? key}
        getClassTagline={(key) => classes.find(c => c.key === key)?.tagline}
        onReorderWithinClass={reorderWithinClass}
        renderRow={(item) => (
          <EntryRowPerson
            item={item}
            onUpdateCache={updatePersonCache}
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

      {recordTarget && (
        <RecordWatchModal
          target={{
            id: Number(recordTarget.tmdbId) || 0,
            stringId: recordTarget.id,
            title: recordTarget.title,
            poster_path: recordTarget.profilePath,
            media_type: 'person'
          }}
          rankedClasses={rankedClassesForModal}
          currentClassKey={recordTarget.classKey}
          currentClassLabel={classes.find(c => c.key === recordTarget.classKey)?.label ?? recordTarget.classKey}
          mode='person'
          onSave={handleSaveRanking}
          onClose={handleCloseModal}
          primaryButtonLabel="Save and go to Actors"
          onRemoveEntry={(id) => {
            removePersonEntry(id);
            handleCloseModal();
          }}
          isSaving={false}
          onAddToUnranked={() => {
            moveItemToClass(recordTarget.id, 'UNRANKED');
            setRecordTarget(null);
          }}
        />
      )}

      {recordMediaTarget && (
        <RecordWatchModal
          target={{
            id: recordMediaTarget.id,
            stringId: recordMediaTarget.mediaType === 'movie' ? `tmdb-movie-${recordMediaTarget.id}` : `tmdb-tv-${recordMediaTarget.id}`,
            title: recordMediaTarget.title,
            poster_path: recordMediaTarget.posterPath,
            media_type: recordMediaTarget.mediaType,
            subtitle: recordMediaTarget.releaseDate ? String(recordMediaTarget.releaseDate.slice(0, 4)) : undefined,
            releaseDate: recordMediaTarget.releaseDate
          }}
          initialRecords={[]}
          mode="first-watch"
          rankedClasses={
            recordMediaTarget.mediaType === 'movie'
              ? movieClasses.map(c => ({ key: c.key, label: c.label, tagline: c.tagline, isRanked: c.isRanked }))
              : tvClasses.map(c => ({ key: c.key, label: c.label, tagline: c.tagline, isRanked: c.isRanked }))
          }
          isSaving={isSavingMedia}
          onClose={() => setRecordMediaTarget(null)}
          onAddToUnranked={() => {
            if (recordMediaTarget.mediaType === 'movie') {
              const id = `tmdb-movie-${recordMediaTarget.id}`;
              addMovieFromSearch({
                id,
                title: recordMediaTarget.title,
                subtitle: 'Saved',
                classKey: 'UNRANKED',
                posterPath: recordMediaTarget.posterPath
              });
            } else {
              const id = `tmdb-tv-${recordMediaTarget.id}`;
              addShowFromSearch({
                id,
                title: recordMediaTarget.title,
                subtitle: 'Saved',
                classKey: 'UNRANKED'
              });
            }
            setRecordMediaTarget(null);
          }}
          onSave={handleSaveMedia}
        />
      )}
      <PageSearch
        items={flatItems.map(i => ({ id: i.id, title: i.title }))}
        onSelect={(id) => {
          const el = document.querySelector(`[data-item-id="${id}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
        placeholder="Search actors..."
      />
    </section>
  );
}
