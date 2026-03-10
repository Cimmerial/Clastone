import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RandomQuote } from '../components/RandomQuote';
import { RankedList } from '../components/RankedList';
import { EntryRowMovieShow, MovieShowItem } from '../components/EntryRowMovieShow';

import { RecordWatchModal, type RecordWatchTarget } from '../components/RecordWatchModal';
import { ClassJumpButtons } from '../components/ClassJumpButtons';
import {
  getTotalMinutesFromRecords,
  formatDuration
} from '../state/moviesStore';
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import { useTvStore } from '../state/tvStore';
import { useFilterStore } from '../state/filterStore';
import { useSettingsStore } from '../state/settingsStore';
import { FilterModal } from '../components/FilterModal';
import { PageSearch } from '../components/PageSearch';
import { Filter as FilterIcon } from 'lucide-react';
import { ViewToggle } from '../components/ViewToggle';

function tvItemToTarget(item: MovieShowItem): RecordWatchTarget {
  const id = item.tmdbId ?? (parseInt(item.id.replace(/\D/g, ''), 10) || 0);
  return {
    id,
    stringId: item.id,
    title: item.title,
    poster_path: item.posterPath,
    media_type: 'tv',
    subtitle: item.releaseDate ? String(item.releaseDate.slice(0, 4)) : undefined,
    releaseDate: item.releaseDate,
    totalEpisodes: item.totalEpisodes
  };
}

export function TvShowsPage() {
  const [settingsFor, setSettingsFor] = useState<MovieShowItem | null>(null);
  const [recordWatchFor, setRecordWatchFor] = useState<MovieShowItem | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [recordPersonTarget, setRecordPersonTarget] = useState<{ id: number; name: string; profilePath?: string; type: 'actor' | 'director' } | null>(null);
  const [recordPersonDetails, setRecordPersonDetails] = useState<any | null>(null);
  const { byClass, classOrder, moveWithinClass, reorderWithinClass, moveToOtherClass, updateShowWatchRecords, getClassLabel, getClassTagline, isRankedClass, classes, addWatchToShow, moveItemToClass, removeShowEntry, globalRanks } =
    useTvStore();
  const { addPersonFromSearch, classes: peopleClasses } = usePeopleStore();
  const { addDirectorFromSearch, classes: directorsClasses } = useDirectorsStore();
  const { showFilters } = useFilterStore();
  const { settings } = useSettingsStore();
  const location = useLocation();
  const navigate = useNavigate();

  const computedByClass = useMemo(() => {
    const next: typeof byClass = {} as typeof byClass;
    for (const classKey of classOrder) {
      const list = byClass[classKey] ?? [];
      const ranked = isRankedClass(classKey);
      const isUnranked = classKey === 'UNRANKED';

      // Apply Filters
      const filteredList = list.filter(item => {
        // Genre Filter
        if (showFilters.genres.length > 0) {
          const itemGenres = item.genres || [];
          if (!showFilters.genres.some(g => itemGenres.includes(g))) return false;
        }

        // Actor Filter
        if (showFilters.actorIds.length > 0) {
          const itemActorIds = (item.cast || []).map(c => c.id);
          if (!showFilters.actorIds.every(id => itemActorIds.includes(id))) return false;
        }

        // Timeline Filter
        if (showFilters.watchTimeRange) {
          const records = item.watchRecords || [];
          const hasInRange = records.some(r => {
            const t = r.type ?? 'DATE';
            if (t === 'LONG_AGO' || t === 'UNKNOWN' || t === 'DNF_LONG_AGO') {
              return showFilters.includeLongAgo;
            }
            const year = r.year;
            return year && year >= showFilters.watchTimeRange![0] && year <= showFilters.watchTimeRange![1];
          });
          if (!hasInRange && records.length > 0) return false;
        }

        return true;
      });

      next[classKey] = filteredList.map((item, idx) => {
        const ranks = globalRanks.get(item.id);
        return {
          ...item,
          percentileRank: !ranked && isUnranked ? '—' : !ranked ? 'N/A%' : ranks?.percentileRank ?? '—',
          absoluteRank: !ranked ? '—' : ranks?.absoluteRank ?? '—',
          rankInClass: `#${idx + 1} in ${getClassLabel(classKey)}`
        };
      });
    }
    return next;
  }, [byClass, classOrder, getClassLabel, isRankedClass, globalRanks, showFilters]);

  const hasActiveModal = !!settingsFor || !!recordWatchFor || !!recordPersonTarget || isFilterModalOpen;

  const scrollToId = (location.state as { scrollToId?: string } | null)?.scrollToId;
  useEffect(() => {
    if (!scrollToId) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`entry-${scrollToId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      navigate('/tv', { replace: true, state: {} });
    }, 100);
    return () => clearTimeout(t);
  }, [scrollToId, navigate]);

  const allShows = useMemo(() => Object.values(byClass).flat().map(i => ({ id: i.id, title: i.title })), [byClass]);

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">TV Shows</h1>
          <RandomQuote />
        </div>
        {!hasActiveModal && (
          <div className="page-actions-row">
            <ViewToggle />
          </div>
        )}
      </header>

      {!hasActiveModal && (
        <PageSearch
          items={allShows}
          onSelect={(id: string) => {
            const el = document.getElementById(`entry-${id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          placeholder="Search TV shows..."
          className="page-search-locked"
        />
      )}

      <RankedList<MovieShowItem>
        viewMode={settings.viewMode}
        classOrder={classOrder}
        itemsByClass={computedByClass}
        getClassLabel={getClassLabel}
        getClassTagline={getClassTagline}
        getClassSubtitle={(_, items) => {
          const totalMins = items.reduce(
            (sum, it) => sum + getTotalMinutesFromRecords(it.watchRecords ?? [], it.runtimeMinutes),
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
              listType="shows"
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
          target={tvItemToTarget(settingsFor)}
          initialRecords={settingsFor.watchRecords}
          mode="edit-watch"
          currentClassKey={settingsFor.classKey}
          currentClassLabel={getClassLabel(settingsFor.classKey)}
          rankedClasses={classes.map((c) => ({ key: c.key, label: c.label, tagline: c.tagline }))}
          isSaving={false}
          onClose={() => setSettingsFor(null)}
          onRemoveEntry={(id) => {
            removeShowEntry(id);
            setSettingsFor(null);
          }}
          onSave={(params) => {
            updateShowWatchRecords(settingsFor.id, params.watches);
            if (params.classKey) {
              moveItemToClass(settingsFor.id, params.classKey, {
                toTop: params.position === 'top',
                toMiddle: params.position === 'middle'
              });
            }
            setSettingsFor(null);
          }}
        />
      )}
      {recordWatchFor && (
        <RecordWatchModal
          target={tvItemToTarget(recordWatchFor)}
          initialRecords={[]}
          mode="first-watch"
          rankedClasses={classes.map((c) => ({
            key: c.key,
            label: c.label,
            tagline: c.tagline,
            isRanked: c.isRanked
          }))}
          isSaving={false}
          onClose={() => setRecordWatchFor(null)}
          onRemoveEntry={(id) => {
            removeShowEntry(id);
            setRecordWatchFor(null);
          }}
          onAddToUnranked={() => {
            moveItemToClass(recordWatchFor.id, 'UNRANKED');
            setRecordWatchFor(null);
          }}
          onSave={(params, goToMedia) => {
            addWatchToShow(recordWatchFor.id, params.watches[0]);
            if (params.classKey) {
              moveItemToClass(recordWatchFor.id, params.classKey, {
                toTop: params.position === 'top',
                toMiddle: params.position === 'middle'
              });
            }
            setRecordWatchFor(null);
            if (goToMedia) {
              setTimeout(() => {
                const el = document.getElementById(`entry-${recordWatchFor.id}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 100);
            }
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
              ? directorsClasses.map(c => ({ key: c.key, label: c.label, tagline: c.tagline }))
              : peopleClasses.map(c => ({ key: c.key, label: c.label, tagline: c.tagline }))
          }
          mode='person'
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
        type="shows"
      />
      <div className="class-jump-buttons-mobile-hidden">
        <ClassJumpButtons classes={classOrder.map((k) => ({ key: k, label: getClassLabel(k) }))} />
      </div>
    </section>
  );
}

