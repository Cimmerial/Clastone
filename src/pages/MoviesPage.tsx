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
  formatDuration
} from '../state/moviesStore';

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
  const location = useLocation();
  const navigate = useNavigate();

  const computedByClass = useMemo(() => {
    // Removed the recalculation of globalRanks here
    const next: typeof byClass = {} as typeof byClass;
    for (const classKey of classOrder) {
      const list = byClass[classKey] ?? [];
      const ranked = isRankedClass(classKey);
      const isUnranked = classKey === 'UNRANKED';

      next[classKey] = list.map((item, idx) => {
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
  }, [byClass, classOrder, getClassLabel, isRankedClass, globalRanks]); // Added globalRanks to dependencies

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

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Movies</h1>
          <RandomQuote />
        </div>
      </header>
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
      {recordWatchFor && (
        <RecordWatchModal
          target={movieItemToTarget(recordWatchFor)}
          rankedClasses={classes.filter((c) => c.key !== 'UNRANKED').map((c) => ({ key: c.key, label: getClassLabel(c.key), tagline: getClassTagline(c.key) }))}
          showClassPicker
          isSaving={isSavingRecord}
          primaryButtonLabel="Save and go to movie"
          onClose={() => setRecordWatchFor(null)}
          onSave={async (params, goToMovie) => {
            setIsSavingRecord(true);
            try {
              for (const w of params.watches) {
                addWatchToMovie(recordWatchFor.id, w, { posterPath: recordWatchFor.posterPath });
              }
              if (params.classKey) {
                moveItemToClass(recordWatchFor.id, params.classKey, {
                  toTop: params.position === 'top',
                  toMiddle: params.position === 'middle'
                });
              }
              setRecordWatchFor(null);
              if (goToMovie) navigate('/movies', { replace: true, state: { scrollToId: recordWatchFor.id } });
            } finally {
              setIsSavingRecord(false);
            }
          }}
        />
      )}
      <ClassJumpButtons classes={classOrder.map((k) => ({ key: k, label: getClassLabel(k) }))} />
    </section>
  );
}

