import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RandomQuote } from '../components/RandomQuote';
import { RankedList } from '../components/RankedList';
import { EntryRowMovieShow, MovieShowItem } from '../components/EntryRowMovieShow';
import { usePageState } from '../hooks/usePageState';

import { UniversalEditModal, type UniversalEditTarget } from '../components/UniversalEditModal';
import { PersonRankingModal, type PersonRankingTarget } from '../components/PersonRankingModal';
import { ClassJumpButtons } from '../components/ClassJumpButtons';
import type { WatchRecord } from '../components/EntryRowMovieShow';
import {
  getTotalMinutesFromRecords,
  formatDuration
} from '../state/moviesStore';
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import { useTvStore } from '../state/tvStore';
import { useFilterStore } from '../state/filterStore';
import { useSettingsStore } from '../state/settingsStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { FilterModal } from '../components/FilterModal';
import { PageSearch } from '../components/PageSearch';
import { Filter as FilterIcon } from 'lucide-react';
import { ViewToggle } from '../components/ViewToggle';
import { useMobileViewMode } from '../hooks/useMobileViewMode';

function tvItemToTarget(item: MovieShowItem): UniversalEditTarget {
  const id = item.tmdbId ?? (parseInt(item.id.replace(/\D/g, ''), 10) || 0);
  return {
    id: item.id,
    tmdbId: id,
    title: item.title,
    posterPath: item.posterPath,
    mediaType: 'tv',
    subtitle: item.releaseDate ? String(item.releaseDate.slice(0, 4)) : undefined,
    releaseDate: item.releaseDate,
    totalEpisodes: item.totalEpisodes,
    existingClassKey: item.classKey,
  };
}

export function TvShowsPage() {
  const { scrollContainerRef } = usePageState<HTMLDivElement>('tv');
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
  const mobileViewMode = useMobileViewMode();
  const location = useLocation();
  const watchlist = useWatchlistStore();
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
          pageKey="tv"
        />
      )}

      <RankedList<MovieShowItem>
        ref={scrollContainerRef}
        viewMode={mobileViewMode}
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
        onMoveBetweenClasses={moveItemToClass}
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
      {/* Universal Edit Modal - handles both edit and first watch for TV shows */}
      {(settingsFor || recordWatchFor) && (
        <UniversalEditModal
          target={tvItemToTarget(settingsFor || recordWatchFor!)}
          initialWatches={(settingsFor || recordWatchFor!)?.watchRecords}
          currentClassKey={(settingsFor || recordWatchFor!)?.classKey}
          currentClassLabel={getClassLabel((settingsFor || recordWatchFor!)?.classKey || '')}
          isWatchlistItem={watchlist.isInWatchlist((settingsFor || recordWatchFor!)?.id || '')}
          rankedClasses={classes.map((c) => ({ key: c.key, label: c.label, tagline: c.tagline, isRanked: c.isRanked }))}
          isSaving={isSavingRecord}
          onClose={() => {
            setSettingsFor(null);
            setRecordWatchFor(null);
          }}
          onRemoveEntry={(id: string) => {
            removeShowEntry(id);
            setSettingsFor(null);
            setRecordWatchFor(null);
          }}
          onAddToWatchlist={() => {
            const target = settingsFor || recordWatchFor;
            if (!target) return;
            watchlist.addToWatchlist(
              {
                id: target.id,
                title: target.title,
                posterPath: target.posterPath,
                releaseDate: target.releaseDate,
              },
              'tv'
            );
          }}
          onRemoveFromWatchlist={() => {
            const target = settingsFor || recordWatchFor;
            if (!target) return;
            watchlist.removeFromWatchlist(target.id);
          }}
          onGoToWatchlist={() => {
            const target = settingsFor || recordWatchFor;
            if (!target) return;
            navigate('/watchlist', { state: { scrollToId: target.id } });
          }}
          onSave={async (params, goToMedia) => {
            const targetItem = settingsFor || recordWatchFor;
            if (!targetItem) return;
            
            // Convert WatchMatrixEntry[] to WatchRecord[]
            const watches = params.watches.map((w) => {
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
            
            if (recordWatchFor && watches.length > 0) {
              addWatchToShow(targetItem.id, watches[0]);
            } else if (settingsFor) {
              updateShowWatchRecords(targetItem.id, watches);
            }
            
            if (params.classKey) {
              moveItemToClass(targetItem.id, params.classKey, {
                toTop: params.position === 'top',
                toMiddle: params.position === 'middle'
              });
            }
            
            setSettingsFor(null);
            setRecordWatchFor(null);
            
            if (goToMedia) {
              setTimeout(() => {
                const el = document.getElementById(`entry-${targetItem.id}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 100);
            }
          }}
        />
      )}
      {/* Person Ranking Modal - for actors/directors */}
      {recordPersonTarget && (
        <PersonRankingModal
          target={{
            id: `tmdb-person-${recordPersonTarget.id}`,
            tmdbId: recordPersonTarget.id,
            name: recordPersonTarget.name,
            profilePath: recordPersonTarget.profilePath,
            mediaType: recordPersonTarget.type,
          }}
          currentClassKey={undefined}
          currentClassLabel={undefined}
          rankedClasses={
            recordPersonTarget.type === 'director'
              ? directorsClasses.map(c => ({ key: c.key, label: c.label, tagline: c.tagline, isRanked: c.isRanked }))
              : peopleClasses.map(c => ({ key: c.key, label: c.label, tagline: c.tagline, isRanked: c.isRanked }))
          }
          isSaving={isSavingRecord}
          onClose={() => {
            setRecordPersonTarget(null);
            setRecordPersonDetails(null);
          }}
          onSave={async (params, goToList) => {
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
              if (goToList) navigate(isActor ? '/actors' : '/directors', { state: { scrollToId: id } });
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

