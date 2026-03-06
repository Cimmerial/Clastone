import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RandomQuote } from '../components/RandomQuote';
import { RankedList } from '../components/RankedList';
import { EntryRowMovieShow, MovieShowItem } from '../components/EntryRowMovieShow';
import { EntrySettingsModal } from '../components/EntrySettingsModal';
import { RecordWatchModal, type RecordWatchTarget } from '../components/RecordWatchModal';
import { ClassJumpButtons } from '../components/ClassJumpButtons';
import { useTvStore } from '../state/tvStore';
import { getTotalMinutesFromRecords, formatDuration } from '../state/moviesStore';

function tvItemToTarget(item: MovieShowItem): RecordWatchTarget {
  const id = item.tmdbId ?? (parseInt(item.id.replace(/\D/g, ''), 10) || 0);
  return {
    id,
    title: item.title,
    poster_path: item.posterPath,
    media_type: 'tv',
    subtitle: item.releaseDate ? String(item.releaseDate.slice(0, 4)) : undefined
  };
}

export function TvShowsPage() {
  const [settingsFor, setSettingsFor] = useState<MovieShowItem | null>(null);
  const [recordWatchFor, setRecordWatchFor] = useState<MovieShowItem | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const { byClass, classOrder, moveWithinClass, reorderWithinClass, moveToOtherClass, updateShowWatchRecords, getClassLabel, getClassTagline, isRankedClass, classes, addWatchToShow, moveItemToClass, removeShowEntry } =
    useTvStore();
  const location = useLocation();
  const navigate = useNavigate();

  const computedByClass = useMemo(() => {
    const rankedItems: MovieShowItem[] = [];
    for (const classKey of classOrder) {
      if (!isRankedClass(classKey)) continue;
      const list = byClass[classKey] ?? [];
      for (const item of list) rankedItems.push(item);
    }
    const total = rankedItems.length || 1;
    const globalRanks = new Map<string, { absoluteRank: string; percentileRank: string }>();
    rankedItems.forEach((item, index) => {
      globalRanks.set(item.id, {
        absoluteRank: `${index + 1} / ${total}`,
        percentileRank: `${Math.round(((total - index) / total) * 100)}%`
      });
    });

    const next: typeof byClass = {} as typeof byClass;
    for (const classKey of classOrder) {
      const list = byClass[classKey] ?? [];
      const ranked = isRankedClass(classKey);
      next[classKey] = list.map((item, idx) => {
        const ranks = globalRanks.get(item.id);
        const isUnranked = classKey === 'UNRANKED';
        return {
          ...item,
          percentileRank: !ranked && isUnranked ? '—' : !ranked ? 'N/A%' : ranks?.percentileRank ?? '—',
          absoluteRank: !ranked ? '—' : ranks?.absoluteRank ?? '—',
          rankInClass: `#${idx + 1} in ${getClassLabel(classKey)}`
        };
      });
    }
    return next;
  }, [byClass, classOrder, getClassLabel, isRankedClass]);

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
        <EntrySettingsModal
          item={settingsFor}
          onClose={() => setSettingsFor(null)}
          onSave={(records) => updateShowWatchRecords(settingsFor.id, records)}
          onRemoveEntry={(id) => {
            removeShowEntry(id);
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
              addWatchToShow(recordWatchFor.id, params.watch, { posterPath: recordWatchFor.posterPath });
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
      <ClassJumpButtons classes={classOrder.map((k) => ({ key: k, label: getClassLabel(k) }))} />
    </section>
  );
}

