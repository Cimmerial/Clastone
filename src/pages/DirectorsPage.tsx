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
import { useListsStore } from '../state/listsStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTotalMinutesFromRecords } from '../state/moviesStore';
import { PageSearch } from '../components/PageSearch';
import { PersonRankingModal, type PersonRankingSaveParams } from '../components/PersonRankingModal';
import { UniversalEditModal, type UniversalEditSaveParams } from '../components/UniversalEditModal';
import { watchMatrixEntriesToWatchRecords } from '../lib/watchMatrixMapping';
import { prepareWatchRecordsForSave } from '../lib/watchDayOrderUtils';
import { ViewToggle } from '../components/ViewToggle';
import { useMobileViewMode } from '../hooks/useMobileViewMode';
import { ClassJumpButtons } from '../components/ClassJumpButtons';
import { tmdbMovieDetailsFull, tmdbTvDetailsFull } from '../lib/tmdb';
import { PersonInfoModal } from '../components/PersonInfoModal';
import { Maximize2, Minimize2 } from 'lucide-react';
import { canChooseOrSwapClassTemplate } from '../lib/classTemplates';
import { ClassTemplatePicker } from '../components/ClassTemplatePicker';

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
    removeDirectorEntry,
    applyDirectorTemplate,
  } = useDirectorsStore();
  const {
    byClass: moviesByClass,
    classOrder: movieClassOrder,
    addWatchToMovie,
    updateMovieWatchRecords,
    moveItemToClass: moveMovieToClass,
    classes: movieClasses,
    addMovieFromSearch,
  } = useMoviesStore();
  const {
    byClass: tvByClass,
    classOrder: tvClassOrder,
    addWatchToShow,
    updateShowWatchRecords,
    moveItemToClass: moveTvToClass,
    classes: tvClasses,
    addShowFromSearch,
  } = useTvStore();
  const { setEntryListMembership } = useListsStore();
  const watchlist = useWatchlistStore();
  const { settings } = useSettingsStore();
  const { mode: mobileViewMode } = useMobileViewMode();
  const navigate = useNavigate();
  const [recordTarget, setRecordTarget] = useState<DirectorItem | null>(null);
  const [recordMediaTarget, setRecordMediaTarget] = useState<{ id: number; title: string; posterPath?: string; mediaType: 'movie' | 'tv'; releaseDate?: string } | null>(null);
  const [isSavingMedia, setIsSavingMedia] = useState(false);
  const [personInfoModalTarget, setPersonInfoModalTarget] = useState<{ tmdbId: number; name: string; profilePath?: string } | null>(null);
  const [forcedExpandClassKey, setForcedExpandClassKey] = useState<string | null>(null);
  const [classVisibilityNonce, setClassVisibilityNonce] = useState(0);
  const [classVisibilityMode, setClassVisibilityMode] = useState<'expand-all' | 'collapse-all'>('expand-all');
  const [classVisibilitySummary, setClassVisibilitySummary] = useState({ allExpanded: true, allCollapsed: false });
  const hasActiveModal = !!recordTarget || !!recordMediaTarget;

  const location = useLocation();
  const scrollToId = location.state?.scrollToId;
  const scrollToClassKey = useMemo(
    () =>
      scrollToId
        ? classOrder.find((classKey) => (byClass[classKey] ?? []).some((item) => item.id === scrollToId)) ?? null
        : null,
    [scrollToId, classOrder, byClass]
  );

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
      const preparedWatches = prepareWatchRecordsForSave(
        watchMatrixEntriesToWatchRecords(params.watches),
        id,
        moviesByClass,
        tvByClass,
        movieClassOrder,
        tvClassOrder
      );

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
        if (preparedWatches[0]) addWatchToMovie(id, preparedWatches[0]);
        
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
        if (preparedWatches[0]) addWatchToShow(id, preparedWatches[0]);
        
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

  const needsDirectorTemplatePick = useMemo(() => canChooseOrSwapClassTemplate(byClass), [byClass]);

  useEffect(() => {
    if (location.hash !== '#directors-class-templates') return;
    requestAnimationFrame(() => {
      document.getElementById('directors-class-templates')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [location.hash, location.pathname]);

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Directors</h1>
          <RandomQuote />
        </div>
        {!hasActiveModal && (
          <div className="page-actions-row">
            <button
              className="class-visibility-btn"
              onClick={() => {
                setClassVisibilityMode('expand-all');
                setClassVisibilityNonce((prev) => prev + 1);
              }}
              title="Expand all classes"
              disabled={classVisibilitySummary.allExpanded}
            >
              <Maximize2 size={18} />
              <span className="filter-label">Expand</span>
            </button>
            <button
              className="class-visibility-btn"
              onClick={() => {
                setClassVisibilityMode('collapse-all');
                setClassVisibilityNonce((prev) => prev + 1);
              }}
              title="Collapse all classes"
              disabled={classVisibilitySummary.allCollapsed}
            >
              <Minimize2 size={18} />
              <span className="filter-label">Collapse</span>
            </button>
            <ViewToggle />
          </div>
        )}
      </header>

      {needsDirectorTemplatePick ? (
        <ClassTemplatePicker
          variant="directors"
          anchorId="directors-class-templates"
          onApply={(id) => applyDirectorTemplate(id)}
        />
      ) : null}

      <RankedList<DirectorItem>
        ref={scrollContainerRef}
        viewMode={mobileViewMode}
        minimizationScopeKey="directors"
        forceExpandClassKey={scrollToClassKey ?? forcedExpandClassKey}
        classVisibilityAction={
          classVisibilityNonce > 0
            ? { mode: classVisibilityMode, nonce: classVisibilityNonce }
            : null
        }
        onClassVisibilitySummaryChange={setClassVisibilitySummary}
        isNonRankedClassKey={(classKey) => !(classes.find((c) => c.key === classKey)?.isRanked ?? true)}
        classOrder={classOrder}
        itemsByClass={byClass}
        getClassLabel={(key) => classes.find(c => c.key === key)?.label ?? key}
        getClassTagline={(key) => classes.find(c => c.key === key)?.tagline}
        onReorderWithinClass={reorderWithinClass}
        onMoveBetweenClasses={moveItemToClass}
        renderRow={(item) => (
          <EntryRowPerson
            item={item as any}
            viewMode={mobileViewMode}
            onUpdateCache={updateDirectorCache}
            onOpenSettings={handleOpenSettings}
            onRecordMedia={handleRecordMedia}
            onInfo={(person) => {
              const tmdbId = person.tmdbId ?? parseInt(person.id.replace('tmdb-person-', ''), 10);
              setPersonInfoModalTarget({
                tmdbId,
                name: person.title,
                profilePath: person.profilePath,
              });
            }}
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
          onGoPickTemplate={() => {
            handleCloseModal();
            navigate('/directors#directors-class-templates', { replace: true });
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
          onGoPickTemplate={() => {
            const mt = recordMediaTarget.mediaType;
            setRecordMediaTarget(null);
            navigate(mt === 'movie' ? '/movies#movie-class-templates' : '/tv#tv-class-templates', { replace: true });
          }}
          onSave={async (params, goToMedia) => {
            const id = recordMediaTarget.mediaType === 'movie' ? `tmdb-movie-${recordMediaTarget.id}` : `tmdb-tv-${recordMediaTarget.id}`;
            const keepModalOpen = Boolean(params.keepModalOpen);
            const watchRecords = prepareWatchRecordsForSave(
              watchMatrixEntriesToWatchRecords(params.watches),
              id,
              moviesByClass,
              tvByClass,
              movieClassOrder,
              tvClassOrder
            );

            if (keepModalOpen) {
              if (recordMediaTarget.mediaType === 'movie') {
                updateMovieWatchRecords(id, watchRecords);
              } else {
                updateShowWatchRecords(id, watchRecords);
              }
              if (params.listMemberships?.length) {
                setEntryListMembership(id, recordMediaTarget.mediaType === 'movie' ? 'movie' : 'tv', params.listMemberships);
              }
              return;
            }

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
          const targetClassKey =
            classOrder.find((classKey) => (byClass[classKey] ?? []).some((item) => item.id === id)) ?? null;
          setForcedExpandClassKey(targetClassKey);
          const el = document.querySelector(`[data-item-id="${id}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            setTimeout(() => {
              const delayedEl = document.querySelector(`[data-item-id="${id}"]`);
              if (delayedEl) delayedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
          }
        }}
        placeholder="Search directors..."
        className="page-search-locked"
        pageKey="directors"
      />
      <div className="class-jump-buttons-mobile-hidden">
        <ClassJumpButtons classes={classOrder.map((k) => ({ key: k, label: classes.find(c => c.key === k)?.label ?? k }))} />
      </div>
      
      {/* Person Info Modal */}
      {personInfoModalTarget && (
        <PersonInfoModal
          isOpen={!!personInfoModalTarget}
          onClose={() => setPersonInfoModalTarget(null)}
          tmdbId={personInfoModalTarget.tmdbId}
          name={personInfoModalTarget.name}
          profilePath={personInfoModalTarget.profilePath}
        />
      )}
    </section>
  );
}
