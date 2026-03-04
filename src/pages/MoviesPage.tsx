import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RankedList } from '../components/RankedList';
import { EntryRowMovieShow, MovieShowItem } from '../components/EntryRowMovieShow';
import { EntrySettingsModal } from '../components/EntrySettingsModal';
import { useMoviesStore } from '../state/moviesStore';

export function MoviesPage() {
  const [settingsFor, setSettingsFor] = useState<MovieShowItem | null>(null);
  const { byClass, classOrder, moveWithinClass, moveToOtherClass, updateMovieWatchRecords } =
    useMoviesStore();
  const location = useLocation();
  const navigate = useNavigate();

  const computedByClass = useMemo(() => {
    const all: MovieShowItem[] = [];
    for (const classKey of classOrder) {
      const list = byClass[classKey] ?? [];
      for (const item of list) {
        all.push(item);
      }
    }

    const total = all.length || 1;
    const globalRanks = new Map<
      string,
      {
        absoluteRank: string;
        percentileRank: string;
      }
    >();

    all.forEach((item, index) => {
      const absoluteRank = `${index + 1} / ${total}`;
      const percentile = Math.round(((total - index) / total) * 100);
      const percentileRank = `${percentile}%`;
      globalRanks.set(item.id, { absoluteRank, percentileRank });
    });

    const next: typeof byClass = {} as typeof byClass;
    for (const classKey of classOrder) {
      const list = byClass[classKey] ?? [];
      next[classKey] = list.map((item, idx) => {
        const ranks = globalRanks.get(item.id);
        return {
          ...item,
          percentileRank: ranks?.percentileRank ?? item.percentileRank ?? '—',
          absoluteRank: ranks?.absoluteRank ?? item.absoluteRank ?? '—',
          rankInClass: `#${idx + 1} in ${classKey}`
        };
      });
    }
    return next;
  }, [byClass, classOrder]);

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
          <p className="page-tagline">OLYMPUS TO DELICIOUS GARBAGE</p>
        </div>
        <p className="page-subtitle">Your ranked film universe, class by class.</p>
      </header>
      <RankedList<MovieShowItem>
        classOrder={classOrder}
        itemsByClass={computedByClass}
        renderRow={(item) => {
          const list = computedByClass[item.classKey] ?? [];
          const idx = list.findIndex((m) => m.id === item.id);
          const isFirst = idx === 0;
          const isLast = idx === list.length - 1;
          return (
            <EntryRowMovieShow
              item={item}
              onOpenSettings={(entry) => setSettingsFor(entry)}
              onMoveUp={() =>
                isFirst ? moveToOtherClass(item.id, -1) : moveWithinClass(item.id, -1)
              }
              onMoveDown={() =>
                isLast ? moveToOtherClass(item.id, 1) : moveWithinClass(item.id, 1)
              }
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
          onSave={(records) => updateMovieWatchRecords(settingsFor.id, records)}
        />
      )}
    </section>
  );
}

