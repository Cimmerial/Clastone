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
import { Filter as FilterIcon, Maximize2, Minimize2 } from 'lucide-react';
import { ViewToggle } from '../components/ViewToggle';
import { useMobileViewMode } from '../hooks/useMobileViewMode';
import { InfoModal } from '../components/InfoModal';
import { useListsStore } from '../state/listsStore';
import { canChooseOrSwapClassTemplate } from '../lib/classTemplates';
import { ClassTemplatePicker } from '../components/ClassTemplatePicker';

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
  const [infoModalTarget, setInfoModalTarget] = useState<{ tmdbId: number; title: string; posterPath?: string; releaseDate?: string } | null>(null);
  const [forcedExpandClassKey, setForcedExpandClassKey] = useState<string | null>(null);
  const [classVisibilityNonce, setClassVisibilityNonce] = useState(0);
  const [classVisibilityMode, setClassVisibilityMode] = useState<'expand-all' | 'collapse-all'>('expand-all');
  const [classVisibilitySummary, setClassVisibilitySummary] = useState({ allExpanded: true, allCollapsed: false });
  const {
    byClass,
    classOrder,
    moveWithinClass,
    reorderWithinClass,
    moveToOtherClass,
    updateShowWatchRecords,
    getClassLabel,
    getClassTagline,
    isRankedClass,
    classes,
    addWatchToShow,
    moveItemToClass,
    removeShowEntry,
    globalRanks,
    applyShowTemplate,
  } = useTvStore();
  const { addPersonFromSearch, classes: peopleClasses } = usePeopleStore();
  const { addDirectorFromSearch, classes: directorsClasses } = useDirectorsStore();
  const { showFilters } = useFilterStore();
  const { settings } = useSettingsStore();
  const { mode: mobileViewMode, isMobile } = useMobileViewMode();
  const location = useLocation();
  const watchlist = useWatchlistStore();
  const { getEditableListsForMediaType, setEntryListMembership, getSelectedListIdsForEntry, collectionIdsByEntryId, globalCollections } = useListsStore();
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

        if (showFilters.directorIds.length > 0) {
          const itemDirectorIds = (item.directors || []).map(d => d.id);
          if (!showFilters.directorIds.every(id => itemDirectorIds.includes(id))) return false;
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

        if (showFilters.releaseYearRange) {
          const releaseYear = item.releaseDate ? parseInt(item.releaseDate.slice(0, 4), 10) : NaN;
          if (Number.isNaN(releaseYear)) return false;
          if (releaseYear < showFilters.releaseYearRange[0] || releaseYear > showFilters.releaseYearRange[1]) return false;
        }

        if (showFilters.listIds.length > 0) {
          const entryListIds = getSelectedListIdsForEntry(item.id);
          if (!showFilters.listIds.every(id => entryListIds.includes(id))) return false;
        }

        if (showFilters.collectionIds.length > 0) {
          const itemCollectionIds = collectionIdsByEntryId.get(item.id) ?? [];
          if (!showFilters.collectionIds.every(id => itemCollectionIds.includes(id))) return false;
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
  }, [byClass, classOrder, getClassLabel, isRankedClass, globalRanks, showFilters, getSelectedListIdsForEntry, collectionIdsByEntryId]);

  const hasActiveModal = !!settingsFor || !!recordWatchFor || !!recordPersonTarget || isFilterModalOpen;

  const scrollToId = (location.state as { scrollToId?: string } | null)?.scrollToId;
  const scrollToClassKey = useMemo(
    () =>
      scrollToId
        ? classOrder.find((classKey) => (computedByClass[classKey] ?? []).some((item) => item.id === scrollToId)) ?? null
        : null,
    [scrollToId, classOrder, computedByClass]
  );
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

  const needsShowTemplatePick = useMemo(() => canChooseOrSwapClassTemplate(byClass), [byClass]);

  useEffect(() => {
    if (location.hash !== '#tv-class-templates') return;
    requestAnimationFrame(() => {
      document.getElementById('tv-class-templates')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [location.hash, location.pathname]);

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">TV Shows</h1>
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
            <button
              className="filter-button"
              onClick={() => setIsFilterModalOpen(true)}
              title="Filter TV shows"
            >
              <FilterIcon size={18} />
              <span className="filter-label">Filter</span>
            </button>
          </div>
        )}
      </header>

      {!hasActiveModal && (
        <PageSearch
          items={allShows}
          onSelect={(id: string) => {
            const targetClassKey =
              classOrder.find((classKey) => (computedByClass[classKey] ?? []).some((item) => item.id === id)) ?? null;
            setForcedExpandClassKey(targetClassKey);
            const el = document.getElementById(`entry-${id}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              setTimeout(() => {
                const delayedEl = document.getElementById(`entry-${id}`);
                if (delayedEl) delayedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 50);
            }
          }}
          placeholder="Search TV shows..."
          className="page-search-locked"
          pageKey="tv"
        />
      )}

      {needsShowTemplatePick ? (
        <ClassTemplatePicker variant="tv" anchorId="tv-class-templates" onApply={(id) => applyShowTemplate(id)} />
      ) : null}

      <RankedList<MovieShowItem>
        ref={scrollContainerRef}
        viewMode={mobileViewMode}
        minimizationScopeKey="tv"
        forceExpandClassKey={scrollToClassKey ?? forcedExpandClassKey}
        classVisibilityAction={
          classVisibilityNonce > 0
            ? { mode: classVisibilityMode, nonce: classVisibilityNonce }
            : null
        }
        onClassVisibilitySummaryChange={setClassVisibilitySummary}
        isNonRankedClassKey={(classKey) => !isRankedClass(classKey)}
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
              viewMode={mobileViewMode}
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
              onInfo={(entry) => {
                const tmdbId = entry.tmdbId ?? (parseInt(entry.id.replace(/\D/g, ''), 10) || 0);
                setInfoModalTarget({
                  tmdbId,
                  title: entry.title,
                  posterPath: entry.posterPath,
                  releaseDate: entry.releaseDate,
                });
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
          availableTags={getEditableListsForMediaType('tv').map((list) => ({
            listId: list.id,
            label: list.name,
            color: list.color,
            selected: getSelectedListIdsForEntry((settingsFor || recordWatchFor!)?.id || '').includes(list.id),
            href: `/lists/${list.id}`,
          }))}
          collectionTags={(collectionIdsByEntryId.get((settingsFor || recordWatchFor!)?.id || '') ?? []).map((id) => ({
            id,
            label: globalCollections.find((item) => item.id === id)?.name ?? id,
            color: globalCollections.find((item) => item.id === id)?.color,
            href: `/lists/collection/${id}`,
          }))}
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
            if (params.listMemberships?.length) {
              setEntryListMembership(targetItem.id, 'tv', params.listMemberships);
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
          onTagToggle={(listId, selected) => {
            const targetItem = settingsFor || recordWatchFor;
            if (!targetItem) return;
            setEntryListMembership(targetItem.id, 'tv', [{ listId, selected }]);
          }}
          onGoPickTemplate={() => {
            setSettingsFor(null);
            setRecordWatchFor(null);
            navigate('/tv#tv-class-templates', { replace: true });
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
          onGoPickTemplate={() => {
            const t = recordPersonTarget.type;
            setRecordPersonTarget(null);
            setRecordPersonDetails(null);
            navigate(t === 'director' ? '/directors#directors-class-templates' : '/actors#actors-class-templates', {
              replace: true,
            });
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
        availableLists={getEditableListsForMediaType('tv').map((list) => ({ id: list.id, name: list.name, color: list.color }))}
        availableCollections={globalCollections.filter((collection) => !collection.hidden).map((collection) => ({
          id: collection.id,
          name: collection.name,
          color: collection.color,
        }))}
        listIdsByEntryId={new Map(Object.values(byClass).flat().map((item) => [item.id, getSelectedListIdsForEntry(item.id)]))}
        collectionIdsByEntryId={collectionIdsByEntryId}
      />
      <div className="class-jump-buttons-mobile-hidden">
        <ClassJumpButtons classes={classOrder.map((k) => ({ key: k, label: getClassLabel(k) }))} />
      </div>

      {/* Info Modal */}
      {infoModalTarget && (
        <InfoModal
          isOpen={!!infoModalTarget}
          onClose={() => setInfoModalTarget(null)}
          tmdbId={infoModalTarget.tmdbId}
          mediaType="tv"
          title={infoModalTarget.title}
          posterPath={infoModalTarget.posterPath}
          releaseDate={infoModalTarget.releaseDate}
          onEditWatches={() => {
            // Find the TV show item from the current data
            const showItem = Object.values(byClass).flat().find(item =>
              item.tmdbId === infoModalTarget.tmdbId ||
              parseInt(item.id.replace(/\D/g, ''), 10) === infoModalTarget.tmdbId
            );
            if (showItem) {
              setInfoModalTarget(null); // Close info modal first
              setSettingsFor(showItem); // Open edit modal
            }
          }}
        />
      )}
    </section>
  );
}

