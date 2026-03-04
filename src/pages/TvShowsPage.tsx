import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RankedList } from '../components/RankedList';
import { EntryRowMovieShow, MovieShowItem } from '../components/EntryRowMovieShow';
import { EntrySettingsModal } from '../components/EntrySettingsModal';
import { RecordFirstWatchModal } from '../components/RecordFirstWatchModal';
import { useTvStore } from '../state/tvStore';
import { getTotalMinutesFromRecords, formatDuration } from '../state/moviesStore';

export function TvShowsPage() {
  const [settingsFor, setSettingsFor] = useState<MovieShowItem | null>(null);
  const [firstWatchFor, setFirstWatchFor] = useState<MovieShowItem | null>(null);
  const { byClass, classOrder, moveWithinClass, moveToOtherClass, updateShowWatchRecords, getClassLabel, isRankedClass, classes, addWatchToShow, moveItemToClass } =
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
          <p className="page-tagline">SEASONS AS THEIR OWN ENTRIES</p>
        </div>
      </header>
      <RankedList<MovieShowItem>
        classOrder={classOrder}
        itemsByClass={computedByClass}
        getClassLabel={getClassLabel}
        getClassSubtitle={(_, items) => {
          const totalRuntime = items.reduce(
            (sum, it) => sum + (it.runtimeMinutes ?? 0),
            0
          );
          console.info('[Clastone] TvShowsPage class runtime', {
            items: items.map((it) => ({
              id: it.id,
              title: it.title,
              runtimeMinutes: it.runtimeMinutes
            })),
            totalRuntime
          });
          return totalRuntime > 0 ? formatDuration(totalRuntime) : '';
        }}
        renderRow={(item) => {
          const list = computedByClass[item.classKey] ?? [];
          const idx = list.findIndex((m) => m.id === item.id);
          const isFirst = idx === 0;
          const isLast = idx === list.length - 1;
          return (
            <EntryRowMovieShow
              item={item}
              listType="shows"
              onOpenSettings={(entry) => setSettingsFor(entry)}
              onRecordFirstWatch={(entry) => setFirstWatchFor(entry)}
              onMoveUp={() => (isFirst ? moveToOtherClass(item.id, -1) : moveWithinClass(item.id, -1))}
              onMoveDown={() => (isLast ? moveToOtherClass(item.id, 1) : moveWithinClass(item.id, 1))}
              onClassUp={() => moveToOtherClass(item.id, -1)}
              onClassDown={() => moveToOtherClass(item.id, 1)}
            />
          );
        }}
      />
      {settingsFor && (
        <EntrySettingsModal
          item={settingsFor}
          onClose={() => setSettingsFor(null)}
          onSave={(records) => updateShowWatchRecords(settingsFor.id, records)}
        />
      )}
      {firstWatchFor && (
        <RecordFirstWatchModal
          item={firstWatchFor}
          rankedClasses={classes.filter((c) => c.isRanked).map((c) => ({ key: c.key, label: c.label }))}
          onClose={() => setFirstWatchFor(null)}
          onConfirm={async (watch, toKey) => {
            addWatchToShow(firstWatchFor.id, watch, { posterPath: firstWatchFor.posterPath });
            moveItemToClass(firstWatchFor.id, toKey, { toTop: true });
          }}
        />
      )}
    </section>
  );
}

