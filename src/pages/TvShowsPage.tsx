import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RandomQuote } from '../components/RandomQuote';
import { RankedList } from '../components/RankedList';
import { EntryRowMovieShow, MovieShowItem } from '../components/EntryRowMovieShow';

import { RecordWatchModal, type RecordWatchTarget } from '../components/RecordWatchModal';
import { ClassJumpButtons } from '../components/ClassJumpButtons';
import { useTvStore } from '../state/tvStore';
import { getTotalMinutesFromRecords, formatDuration } from '../state/moviesStore';
import { useFilterStore } from '../state/filterStore';
import { FilterModal } from '../components/FilterModal';
import { Filter as FilterIcon } from 'lucide-react';

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
  const { byClass, classOrder, moveWithinClass, reorderWithinClass, moveToOtherClass, updateShowWatchRecords, getClassLabel, getClassTagline, isRankedClass, classes, addWatchToShow, moveItemToClass, removeShowEntry, globalRanks } =
    useTvStore();
  const { showFilters } = useFilterStore();
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

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">TV Shows</h1>
          <RandomQuote />
        </div>
        <button
          className="filter-toggle-btn"
          onClick={() => setIsFilterModalOpen(true)}
          title="Filter TV Shows"
        >
          <FilterIcon size={20} />
          <span>Filter</span>
        </button>
      </header>
      <RankedList<MovieShowItem>
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
            />
          );
        }}
      />
      {settingsFor && (
        <RecordWatchModal
          target={tvItemToTarget(settingsFor)}
          initialRecords={settingsFor.watchRecords}
          showClassPicker={false}
          rankedClasses={[]}
          isSaving={false}
          onClose={() => setSettingsFor(null)}
          onRemoveEntry={(id) => {
            removeShowEntry(id);
            setSettingsFor(null);
          }}
          onSave={(params) => {
            updateShowWatchRecords(settingsFor.id, params.watches);
            setSettingsFor(null);
          }}
        />
      )}
      {recordWatchFor && (
        <RecordWatchModal
          target={tvItemToTarget(recordWatchFor)}
          rankedClasses={classes.filter((c) => c.key !== 'UNRANKED').map((c) => ({ key: c.key, label: getClassLabel(c.key), tagline: getClassTagline(c.key) }))}
          showClassPicker
          isSaving={isSavingRecord}
          primaryButtonLabel="Save and go to show"
          onClose={() => setRecordWatchFor(null)}
          onSave={async (params, goToShow) => {
            setIsSavingRecord(true);
            try {
              for (const w of params.watches) {
                addWatchToShow(recordWatchFor.id, w, { posterPath: recordWatchFor.posterPath });
              }
              if (params.classKey) {
                moveItemToClass(recordWatchFor.id, params.classKey, {
                  toTop: params.position === 'top',
                  toMiddle: params.position === 'middle'
                });
              }
              setRecordWatchFor(null);
              if (goToShow) navigate('/tv', { replace: true, state: { scrollToId: recordWatchFor.id } });
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
      <ClassJumpButtons classes={classOrder.map((k) => ({ key: k, label: getClassLabel(k) }))} />
    </section>
  );
}

