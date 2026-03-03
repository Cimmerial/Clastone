import { useState } from 'react';
import { ClassKey, RankedItemBase, RankedList } from '../components/RankedList';
import { CompactMovieRow, EntryRowMovieShow, MovieShowItem } from '../components/EntryRowMovieShow';
import { EntrySettingsModal } from '../components/EntrySettingsModal';
import { movieClasses, moviesByClass } from '../mock/movies';

export function MoviesPage() {
  const [byClass, setByClass] = useState<Record<ClassKey, MovieShowItem[]>>(moviesByClass);
  const [settingsFor, setSettingsFor] = useState<MovieShowItem | null>(null);

  const moveWithinClass = (itemId: string, delta: number) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      for (const classKey of movieClasses) {
        const list = next[classKey];
        if (!list) continue;
        const index = list.findIndex((m) => m.id === itemId);
        if (index === -1) continue;
        const newIndex = index + delta;
        if (newIndex < 0 || newIndex >= list.length) {
          return prev;
        }
        const copy = [...list];
        const [moved] = copy.splice(index, 1);
        copy.splice(newIndex, 0, moved);
        next[classKey] = copy;
        return next;
      }
      return prev;
    });
  };

  const moveToOtherClass = (itemId: string, deltaClass: number) => {
    setByClass((prev) => {
      const next: Record<ClassKey, MovieShowItem[]> = { ...prev };
      let fromKey: ClassKey | null = null;
      let item: MovieShowItem | null = null;

      for (const classKey of movieClasses) {
        const list = next[classKey];
        if (!list) continue;
        const index = list.findIndex((m) => m.id === itemId);
        if (index !== -1) {
          fromKey = classKey;
          const copy = [...list];
          [item] = copy.splice(index, 1);
          next[classKey] = copy;
          break;
        }
      }

      if (!fromKey || !item) return prev;

      const fromIndex = movieClasses.indexOf(fromKey);
      const toIndex = fromIndex + deltaClass;
      if (toIndex < 0 || toIndex >= movieClasses.length) {
        return prev;
      }

      const toKey = movieClasses[toIndex];
      const targetList = next[toKey] ?? [];
      const updated = { ...item, classKey: toKey as RankedItemBase['classKey'] };

      // Moving to "lower" class (downwards in the list) -> insert at top.
      // Moving to "higher" class (upwards) -> append to bottom.
      if (deltaClass > 0) {
        next[toKey] = [updated, ...targetList];
      } else {
        next[toKey] = [...targetList, updated];
      }
      return next;
    });
  };

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Movies</h1>
          <p className="page-tagline">OLYMPUS TO DELICIOUS_GARBAGE</p>
        </div>
        <p className="page-subtitle">Your ranked film universe, class by class.</p>
      </header>
      <RankedList<MovieShowItem>
        classOrder={movieClasses}
        itemsByClass={byClass}
        renderRow={(item) => (
          <EntryRowMovieShow
            item={item}
            onOpenSettings={(entry) => setSettingsFor(entry)}
            onMoveUp={() => moveWithinClass(item.id, -1)}
            onMoveDown={() => moveWithinClass(item.id, 1)}
            onClassUp={() => moveToOtherClass(item.id, -1)}
            onClassDown={() => moveToOtherClass(item.id, 1)}
          />
        )}
      />
      {settingsFor && (
        <EntrySettingsModal
          item={settingsFor}
          onClose={() => setSettingsFor(null)}
        />
      )}
    </section>
  );
}

