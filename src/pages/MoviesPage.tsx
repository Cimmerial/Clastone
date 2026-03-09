import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RandomQuote } from '../components/RandomQuote';
import { RankedList } from '../components/RankedList';
import { EntryRowMovieShow, MovieShowItem } from '../components/EntryRowMovieShow';

import { RecordWatchModal, type RecordWatchTarget } from '../components/RecordWatchModal';
import { ClassJumpButtons } from '../components/ClassJumpButtons';
import {
  useMoviesStore,
  getTotalMinutesFromRecords,
  formatDuration,
  getWatchRecordSortKey
} from '../state/moviesStore';
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import { useFilterStore } from '../state/filterStore';
import { FilterModal } from '../components/FilterModal';
import { PageSearch, type SearchableItem } from '../components/PageSearch';
import { Filter as FilterIcon } from 'lucide-react';

function movieItemToTarget(item: MovieShowItem): RecordWatchTarget {
  const id = item.tmdbId ?? (parseInt(item.id.replace(/\D/g, ''), 10) || 0);
  return {
    id,
    stringId: item.id,
    title: item.title,
    poster_path: item.posterPath,
    media_type: 'movie',
    subtitle: item.releaseDate ? String(item.releaseDate.slice(0, 4)) : undefined,
    releaseDate: item.releaseDate,
    runtimeMinutes: item.runtimeMinutes
  };
}

export function MoviesPage() {
  const [settingsFor, setSettingsFor] = useState<MovieShowItem | null>(null);
  const [recordWatchFor, setRecordWatchFor] = useState<MovieShowItem | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [recordPersonTarget, setRecordPersonTarget] = useState<{ id: number; name: string; profilePath?: string; type: 'actor' | 'director' } | null>(null);
  const [recordPersonDetails, setRecordPersonDetails] = useState<any | null>(null);
  const {
    byClass,
    classOrder,
    moveWithinClass,
    reorderWithinClass,
    moveToOtherClass,
    updateMovieWatchRecords,
    addWatchToMovie,
    moveItemToClass,
    getClassLabel,
    getClassTagline,
    isRankedClass,
    classes,
    removeMovieEntry,
    globalRanks // Added globalRanks from store
  } = useMoviesStore();
  const { addPersonFromSearch, classes: peopleClasses, moveItemToClass: movePersonToClass } = usePeopleStore();
  const { addDirectorFromSearch, classes: directorsClasses, moveItemToClass: moveDirectorToClass } = useDirectorsStore();
  const { movieFilters } = useFilterStore();
  const location = useLocation();
  const navigate = useNavigate();

  const computedByClass = useMemo(() => {
    // Removed the recalculation of globalRanks here
    const next: typeof byClass = {} as typeof byClass;
    for (const classKey of classOrder) {
      const list = byClass[classKey] ?? [];
      const ranked = isRankedClass(classKey);
      const isUnranked = classKey === 'UNRANKED';

      // Apply Filters
      const filteredList = list.filter(item => {
        // Genre Filter
        if (movieFilters.genres.length > 0) {
          const itemGenres = item.genres || [];
          if (!movieFilters.genres.some(g => itemGenres.includes(g))) return false;
        }

        // Actor Filter
        if (movieFilters.actorIds.length > 0) {
          const itemActorIds = (item.cast || []).map(c => c.id);
          if (!movieFilters.actorIds.every(id => itemActorIds.includes(id))) return false;
        }

        // Timeline Filter
        if (movieFilters.watchTimeRange) {
          const records = item.watchRecords || [];
          const hasInRange = records.some(r => {
            const t = r.type ?? 'DATE';
            if (t === 'LONG_AGO' || t === 'UNKNOWN' || t === 'DNF_LONG_AGO') {
              return movieFilters.includeLongAgo;
            }
            const year = r.year;
            return year && year >= movieFilters.watchTimeRange![0] && year <= movieFilters.watchTimeRange![1];
          });
          if (!hasInRange && records.length > 0) return false;
        }

        return true;
      });

      next[classKey] = filteredList.map((item, idx) => {
        const ranks = globalRanks.get(item.id);
        return {
          ...item,
          percentileRank: !ranked && isUnranked
            ? '—'
            : !ranked
              ? 'N/A%'
              : ranks?.percentileRank ?? '—', // Simplified to use ranks directly
          absoluteRank: !ranked ? '—' : ranks?.absoluteRank ?? '—', // Simplified to use ranks directly
          rankInClass: `#${idx + 1} in ${getClassLabel(classKey)}`
        };
      });
    }
    return next;
  }, [byClass, classOrder, getClassLabel, isRankedClass, globalRanks, movieFilters]); // Added globalRanks to dependencies

  const scrollToId = (location.state as { scrollToId?: string } | null)?.scrollToId;
  useEffect(() => {
    if (!scrollToId) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`entry-${scrollToId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      navigate('/movies', { replace: true, state: {} });
    }, 100);
    return () => clearTimeout(t);
  }, [scrollToId, navigate]);

  const hasActiveModal = !!settingsFor || !!recordWatchFor || !!recordPersonTarget || isFilterModalOpen;
  const allMovies = useMemo(() => Object.values(byClass).flat().map(i => ({ id: i.id, title: i.title })), [byClass]);

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Movies</h1>
          <RandomQuote />
        </div>
        {!hasActiveModal && (
          <button
            className="filter-toggle-btn"
            onClick={() => setIsFilterModalOpen(true)}
            title="Filter Movies"
          >
            <FilterIcon size={20} />
            <span>Filter</span>
          </button>
        )}
      </header>
      {!hasActiveModal && (
        <PageSearch
          items={allMovies}
          onSelect={(id: string) => {
            const el = document.getElementById(`entry-${id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          placeholder="Search movies..."
          className="page-search-locked"
        />
      )}
      <RankedList<MovieShowItem>
        classOrder={classOrder}
        itemsByClass={computedByClass}
        getClassLabel={getClassLabel}
        getClassTagline={getClassTagline}
        getClassSubtitle={(_, items) => {
          const totalMins = items.reduce(
            (sum, it) =>
              sum + getTotalMinutesFromRecords(it.watchRecords ?? [], it.runtimeMinutes),
            0
          );
          return totalMins > 0 ? formatDuration(totalMins) : '';
        }}
        onReorderWithinClass={reorderWithinClass}
        renderRow={(item) => {
          const list = computedByClass[item.classKey] ?? [];
          const idx = list.findIndex((m) => m.id === item.id);
          const isFirst = idx === 0;
          const isLast = idx === list.length - 1;
          const classIndex = classOrder.indexOf(item.classKey);
          const canClassUp = classIndex > 0;
          const canClassDown = classIndex < classOrder.length - 1;
          const canMoveUp = canClassUp || !isFirst;
          const canMoveDown = canClassDown || !isLast;
          return (
            <EntryRowMovieShow
              item={item}
              listType="movies"
              onOpenSettings={(entry) => setSettingsFor(entry)}
              onRecordFirstWatch={(entry) => setRecordWatchFor(entry)}
              onMoveUp={canMoveUp ? () => (isFirst ? moveToOtherClass(item.id, -1) : moveWithinClass(item.id, -1)) : undefined}
              onMoveDown={canMoveDown ? () => (isLast ? moveToOtherClass(item.id, 1) : moveWithinClass(item.id, 1)) : undefined}
              onClassUp={canClassUp ? () => moveToOtherClass(item.id, -1) : undefined}
              onClassDown={canClassDown ? () => moveToOtherClass(item.id, 1) : undefined}
              onRecordPerson={async (info) => {
                setRecordPersonTarget(info);
                setIsSavingRecord(true);
                try {
                  const cache = await import('../lib/tmdb').then(m => m.tmdbPersonDetailsFull(info.id));
                  setRecordPersonDetails(cache);
                } catch { /* ignore */ }
                finally { setIsSavingRecord(false); }
              }}
            />
          );
        }}
      />
      {settingsFor && (
        <RecordWatchModal
          target={movieItemToTarget(settingsFor)}
          initialRecords={settingsFor.watchRecords}
          showClassPicker={false}
          rankedClasses={[]}
          isSaving={false}
          onClose={() => setSettingsFor(null)}
          onRemoveEntry={(id) => {
            removeMovieEntry(id);
            setSettingsFor(null);
          }}
          onSave={(params) => {
            updateMovieWatchRecords(settingsFor.id, params.watches);
            setSettingsFor(null);
          }}
        />
      )}
      {recordPersonTarget && (
        <RecordWatchModal
          target={{
            id: recordPersonTarget.id,
            title: recordPersonTarget.name,
            poster_path: recordPersonTarget.profilePath,
            media_type: 'person'
          }}
          rankedClasses={
            recordPersonTarget.type === 'director'
              ? directorsClasses.filter(c => c.key !== 'UNRANKED').map(c => ({ key: c.key, label: c.label, tagline: c.tagline }))
              : peopleClasses.filter(c => c.key !== 'UNRANKED').map(c => ({ key: c.key, label: c.label, tagline: c.tagline }))
          }
          showClassPicker
          isSaving={isSavingRecord}
          primaryButtonLabel={recordPersonTarget.type === 'director' ? 'Add to Directors' : 'Add to Actors'}
          onClose={() => {
            setRecordPersonTarget(null);
            setRecordPersonDetails(null);
          }}
          onSave={async (params, goToPerson) => {
            const isActor = recordPersonTarget.type === 'actor';
            const id = `tmdb-person-${recordPersonTarget.id}`;
            setIsSavingRecord(true);
            try {
              if (isActor) {
                addPersonFromSearch({
                  id,
                  title: recordPersonTarget.name,
                  profilePath: recordPersonTarget.profilePath,
                  classKey: params.classKey || 'UNRANKED',
                  cache: recordPersonDetails,
                  position: params.position
                });
              } else {
                addDirectorFromSearch({
                  id,
                  title: recordPersonTarget.name,
                  profilePath: recordPersonTarget.profilePath,
                  classKey: params.classKey || 'UNRANKED',
                  cache: recordPersonDetails,
                  position: params.position
                });
              }
              setRecordPersonTarget(null);
              setRecordPersonDetails(null);
              if (goToPerson) navigate(isActor ? '/actors' : '/directors', { state: { scrollToId: id } });
            } finally {
              setIsSavingRecord(false);
            }
          }}
          onAddToUnranked={async () => {
            const isActor = recordPersonTarget.type === 'actor';
            const id = `tmdb-person-${recordPersonTarget.id}`;
            setIsSavingRecord(true);
            try {
              if (isActor) {
                addPersonFromSearch({
                  id,
                  title: recordPersonTarget.name,
                  profilePath: recordPersonTarget.profilePath,
                  classKey: 'UNRANKED',
                  cache: recordPersonDetails
                });
              } else {
                addDirectorFromSearch({
                  id,
                  title: recordPersonTarget.name,
                  profilePath: recordPersonTarget.profilePath,
                  classKey: 'UNRANKED',
                  cache: recordPersonDetails
                });
              }
              setRecordPersonTarget(null);
              setRecordPersonDetails(null);
            } finally {
              setIsSavingRecord(false);
            }
          }}
        />
      )}
      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        items={Object.values(byClass).flat()}
        type="movies"
      />
      <ClassJumpButtons classes={classOrder.map((k) => ({ key: k, label: getClassLabel(k) }))} />
    </section>
  );
}

