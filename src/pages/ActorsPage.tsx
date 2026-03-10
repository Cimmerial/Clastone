import { useMemo, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { RandomQuote } from '../components/RandomQuote';
import { RankedList } from '../components/RankedList';
import { EntryRowPerson } from '../components/EntryRowPerson';
import { usePeopleStore, PersonItem } from '../state/peopleStore';
import { useSettingsStore } from '../state/settingsStore';
import { PageSearch } from '../components/PageSearch';
import { RecordWatchModal, type RecordWatchSaveParams } from '../components/RecordWatchModal';
import { ViewToggle } from '../components/ViewToggle';

export function ActorsPage() {
  const {
    byClass,
    classOrder,
    classes,
    moveItemToClass,
    reorderWithinClass,
    moveItemWithinClass,
    updatePersonCache,
    removePersonEntry
  } = usePeopleStore();
  const { settings } = useSettingsStore();
  const [recordTarget, setRecordTarget] = useState<PersonItem | null>(null);
  const hasActiveModal = !!recordTarget;

  const location = useLocation();
  const scrollToId = location.state?.scrollToId;

  useEffect(() => {
    if (scrollToId) {
      const el = document.querySelector(`[data-item-id="${scrollToId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [scrollToId]);

  const flatItems = useMemo(() => Object.values(byClass).flat(), [byClass]);

  const handleOpenSettings = (item: PersonItem) => {
    setRecordTarget(item);
  };

  const handleCloseModal = () => setRecordTarget(null);

  const handleSaveRanking = (params: RecordWatchSaveParams, goToActors: boolean) => {
    if (!recordTarget) return;
    const { classKey, position } = params;
    if (classKey) {
      moveItemToClass(recordTarget.id, classKey, {
        toTop: position === 'top',
        toMiddle: position === 'middle'
      });
    }
    setRecordTarget(null);

    if (goToActors) {
      setTimeout(() => {
        const el = document.querySelector(`[data-item-id="${recordTarget.id}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };


  const rankedClassesForModal = useMemo(() =>
    classes.map(c => ({
      key: c.key,
      label: c.label,
      tagline: c.tagline,
      isRanked: c.isRanked
    }))
    , [classes]);

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Actors</h1>
          <RandomQuote />
        </div>
        {!hasActiveModal && (
          <div className="page-actions-row">
            <ViewToggle />
          </div>
        )}
      </header>

      <RankedList<PersonItem>
        viewMode={settings.viewMode}
        classOrder={classOrder}
        itemsByClass={byClass}
        getClassLabel={(key) => classes.find(c => c.key === key)?.label ?? key}
        getClassTagline={(key) => classes.find(c => c.key === key)?.tagline}
        onReorderWithinClass={reorderWithinClass}
        renderRow={(item) => (
          <EntryRowPerson
            item={item}
            onUpdateCache={updatePersonCache}
            onOpenSettings={handleOpenSettings}
            onMoveUp={() => moveItemWithinClass(item.id, -1)}
            onMoveDown={() => moveItemWithinClass(item.id, 1)}
            onClassUp={() => {
              const idx = classOrder.indexOf(item.classKey);
              if (idx > 0) moveItemToClass(item.id, classOrder[idx - 1]);
            }}
            onClassDown={() => {
              const idx = classOrder.indexOf(item.classKey);
              if (idx < classOrder.length - 1) moveItemToClass(item.id, classOrder[idx + 1], { toTop: true });
            }}
          />
        )}
      />

      {recordTarget && (
        <RecordWatchModal
          target={{
            id: Number(recordTarget.tmdbId) || 0,
            stringId: recordTarget.id,
            title: recordTarget.title,
            poster_path: recordTarget.profilePath,
            media_type: 'person'
          }}
          rankedClasses={rankedClassesForModal}
          currentClassKey={recordTarget.classKey}
          currentClassLabel={classes.find(c => c.key === recordTarget.classKey)?.label ?? recordTarget.classKey}
          mode='person'
          onSave={handleSaveRanking}
          onClose={handleCloseModal}
          primaryButtonLabel="Save and go to Actors"
          onRemoveEntry={(id) => {
            removePersonEntry(id);
            handleCloseModal();
          }}
          isSaving={false}
          onAddToUnranked={() => {
            moveItemToClass(recordTarget.id, 'UNRANKED');
            setRecordTarget(null);
          }}
        />
      )}
      <PageSearch
        items={flatItems.map(i => ({ id: i.id, title: i.title }))}
        onSelect={(id) => {
          const el = document.querySelector(`[data-item-id="${id}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
        placeholder="Search actors..."
      />
    </section>
  );
}
