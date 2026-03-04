import {
  DndContext,
  type DragEndEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './RankedList.css';

export type ClassKey = string;

export type RankedItemBase = {
  id: string;
  classKey: ClassKey;
};

type RankedListProps<T extends RankedItemBase> = {
  classOrder: ClassKey[];
  itemsByClass: Record<ClassKey, T[]>;
  renderRow: (item: T) => JSX.Element;
  /** Optional: e.g. " | 12h 30m total" appended after "X entries" */
  getClassSubtitle?: (classKey: ClassKey, items: T[]) => string;
  /** Optional: map a class key to a human-friendly label. Defaults to classKey. */
  getClassLabel?: (classKey: ClassKey) => string;
  /** When provided, entries can be dragged to reorder within each class. */
  onReorderWithinClass?: (classKey: ClassKey, orderedIds: string[]) => void;
};

function SortableRow<T extends RankedItemBase>({
  item,
  classKey,
  renderRow
}: {
  item: T;
  classKey: ClassKey;
  renderRow: (item: T) => JSX.Element;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { classKey }
  });
  const style = transform
    ? { transform: CSS.Transform.toString(transform), transition }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      className={`entry-row-wrapper ${isDragging ? 'entry-row-wrapper--dragging' : ''}`}
      id={`entry-${item.id}`}
      style={style}
      {...attributes}
      {...listeners}
    >
      {renderRow(item)}
    </div>
  );
}

export function RankedList<T extends RankedItemBase>({
  classOrder,
  itemsByClass,
  renderRow,
  getClassSubtitle,
  getClassLabel,
  onReorderWithinClass
}: RankedListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderWithinClass) return;
    const classKey = active.data.current?.classKey as ClassKey | undefined;
    if (!classKey) return;
    const items = itemsByClass[classKey] ?? [];
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove([...items], oldIndex, newIndex);
    onReorderWithinClass(classKey, reordered.map((i) => i.id));
  };

  const content = (
    <div className="ranked-list-body">
      {classOrder.map((classKey) => {
        const items = itemsByClass[classKey] ?? [];
        const subtitle = getClassSubtitle?.(classKey, items) ?? '';
        const isNonRankedDivider = classKey === 'BABY';
        const label = getClassLabel ? getClassLabel(classKey) : classKey;
        const isNonRankedClass =
          classKey === 'BABY' || classKey === 'DELICIOUS_GARBAGE' || classKey === 'UNRANKED';
        const sortableIds = items.map((i) => i.id);
        return (
          <div key={classKey}>
            {isNonRankedDivider && (
              <div className="class-divider" aria-hidden="true">
                <span>Saved / not ranked yet</span>
              </div>
            )}
            <section
              className={`class-section ${isNonRankedClass ? 'class-section--nonranked' : ''}`}
            >
              <header className="class-section-header">
                <div>
                  <h3 className="class-section-title">{label}</h3>
                  <p className="class-section-count">
                    {items.length} entries{subtitle ? ` | ${subtitle}` : ''}
                  </p>
                </div>
              </header>
              <div className="class-section-rows">
                {onReorderWithinClass ? (
                  <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    {items.map((item) => (
                      <SortableRow
                        key={item.id}
                        item={item}
                        classKey={classKey}
                        renderRow={renderRow}
                      />
                    ))}
                  </SortableContext>
                ) : (
                  items.map((item) => (
                    <div
                      key={item.id}
                      className="entry-row-wrapper"
                      id={`entry-${item.id}`}
                    >
                      {renderRow(item)}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        );
      })}
    </div>
  );

  if (onReorderWithinClass) {
    return (
      <div className="ranked-list ranked-list--sortable">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          {content}
        </DndContext>
      </div>
    );
  }

  return <div className="ranked-list">{content}</div>;
}

