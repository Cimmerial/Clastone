import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  pointerWithin,
  type CollisionDetection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { forwardRef, useState, useCallback, useRef, createContext, useContext } from 'react';
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
  /** Optional: tagline for section title only (shown after label, muted). */
  getClassTagline?: (classKey: ClassKey) => string | undefined;
  /** When provided, entries can be dragged to reorder within each class. */
  onReorderWithinClass?: (classKey: ClassKey, orderedIds: string[]) => void;
  /** When provided, entries can be dragged between classes. */
  onMoveBetweenClasses?: (itemId: string, toClass: ClassKey, options?: { toTop?: boolean; toMiddle?: boolean; atIndex?: number }) => void;
  /** Optional view mode for layout adjustments */
  viewMode?: 'minimized' | 'detailed' | 'tile';
};

// Context for drag initiation
const DragInitiateContext = createContext<{
  initiateDrag: (itemId: string, item: any, classKey: ClassKey) => void;
  isDragging: boolean;
  activeItemId: string | null;
}>({ initiateDrag: () => {}, isDragging: false, activeItemId: null });

// Hook to use drag initiation
export const useDragInitiate = () => useContext(DragInitiateContext);

function DroppableClassSection({ 
  classKey, 
  children, 
  isDragOver 
}: { 
  classKey: ClassKey; 
  children: React.ReactNode; 
  isDragOver: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: classKey,
    data: { 
      type: 'class-section',
      classKey 
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`class-section-droppable ${isOver || isDragOver ? 'class-section-droppable--over' : ''}`}
    >
      {children}
    </div>
  );
}
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

function RankedListInner<T extends RankedItemBase>(
  {
    classOrder,
    itemsByClass,
    renderRow,
    getClassSubtitle,
    getClassLabel,
    getClassTagline,
    onReorderWithinClass,
    onMoveBetweenClasses,
    viewMode = 'detailed'
  }: RankedListProps<T>,
  ref: React.Ref<HTMLDivElement>
) {
  const isTile = viewMode === 'tile';
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<T | null>(null);
  const [draggedFromClass, setDraggedFromClass] = useState<ClassKey | null>(null);
  const [dragOverClass, setDragOverClass] = useState<ClassKey | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [insertAfter, setInsertAfter] = useState<boolean>(false);
  const [programmaticDrag, setProgrammaticDrag] = useState<{ itemId: string; item: T; classKey: ClassKey } | null>(null);
  const lastHoverState = useRef<{ classKey: ClassKey | null; itemId: string | null; insertAfter: boolean }>({ classKey: null, itemId: null, insertAfter: false });
  
  const isDragActive = activeId !== null || programmaticDrag !== null;
  const effectiveActiveId = activeId ?? programmaticDrag?.itemId ?? null;
  const effectiveDraggedItem = draggedItem ?? programmaticDrag?.item ?? null;
  const effectiveDraggedFromClass = draggedFromClass ?? programmaticDrag?.classKey ?? null;
  
  // Throttled hover state update to prevent lag
  const updateHoverState = useCallback((classKey: ClassKey | null, itemId: string | null, shouldInsertAfter: boolean = false) => {
    const last = lastHoverState.current;
    // Update if class, item, OR insert position changes
    if (last.classKey !== classKey || last.itemId !== itemId || last.insertAfter !== shouldInsertAfter) {
      last.classKey = classKey;
      last.itemId = itemId;
      last.insertAfter = shouldInsertAfter;
      setDragOverClass(classKey);
      setDragOverItemId(itemId);
      setInsertAfter(shouldInsertAfter);
    }
  }, []);
  
  // Initiate drag programmatically (for drag button)
  const initiateDrag = useCallback((itemId: string, item: T, classKey: ClassKey) => {
    setProgrammaticDrag({ itemId, item, classKey });
    setDraggedItem(item);
    setDraggedFromClass(classKey);
  }, []);
  
  // Cancel programmatic drag
  const cancelDrag = useCallback(() => {
    setProgrammaticDrag(null);
    setDraggedItem(null);
    setDraggedFromClass(null);
    setDragOverClass(null);
    setDragOverItemId(null);
    setInsertAfter(false);
  }, []);
  
  // Custom collision detection - optimized for performance
  // NOTE: This runs on EVERY drag frame, so it must be fast and NOT call setState directly
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    const { droppableContainers, pointerCoordinates, active } = args;
    
    if (!pointerCoordinates) {
      return [];
    }
    
    const { x, y } = pointerCoordinates;
    let classSectionCollision: { id: string; data: { type: string; classKey: ClassKey }; rect: any } | null = null;
    let hoveredItem: { id: string; data: { type?: string; classKey?: ClassKey }; rect: any } | null = null;
    const allItems: { id: string; data: { type?: string; classKey?: ClassKey }; rect: any }[] = [];
    
    for (const container of droppableContainers) {
      const rect = container.rect.current;
      if (!rect) continue;
      
      const data = container.data.current;
      const isClassSection = data?.type === 'class-section';
      
      // Check if pointer is inside this container
      const isInside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      
      if (isInside) {
        if (isClassSection) {
          classSectionCollision = {
            id: container.id as string,
            data: { type: 'class-section', classKey: data.classKey as ClassKey },
            rect
          };
        } else {
          // Track the item we're directly hovering over
          hoveredItem = {
            id: container.id as string,
            data: data || {},
            rect
          };
        }
      }
      
      // Collect all items for finding closest (but only if reasonably close to viewport)
      // This optimization prevents checking items that are way off-screen
      if (!isClassSection) {
        const viewportMargin = 500; // Check items within 500px of viewport
        const isNearViewport = rect.bottom > -viewportMargin && rect.top < window.innerHeight + viewportMargin;
        if (isNearViewport) {
          allItems.push({
            id: container.id as string,
            data: data || {},
            rect
          });
        }
      }
    }
    
    // Determine insertion point
    let targetItemId: string | null = null;
    let shouldInsertAfter = false;
    let targetClass: ClassKey | null = null;
    
    if (classSectionCollision) {
      // We're hovering a class section - find closest entry in that class
      targetClass = classSectionCollision.data.classKey;
      const itemsInClass = allItems.filter(item => item.data.classKey === targetClass);
      
      if (itemsInClass.length > 0) {
        // Find closest item by distance from pointer to item center
        // For tile view, use Euclidean distance (both X and Y)
        // For list view, use vertical distance only
        const sorted = itemsInClass.sort((a, b) => {
          const aCenterX = a.rect.left + a.rect.width / 2;
          const aCenterY = a.rect.top + a.rect.height / 2;
          const bCenterX = b.rect.left + b.rect.width / 2;
          const bCenterY = b.rect.top + b.rect.height / 2;
          
          if (isTile) {
            // Euclidean distance for tile/grid view
            const distA = Math.sqrt(Math.pow(x - aCenterX, 2) + Math.pow(y - aCenterY, 2));
            const distB = Math.sqrt(Math.pow(x - bCenterX, 2) + Math.pow(y - bCenterY, 2));
            return distA - distB;
          } else {
            // Vertical distance only for list view
            return Math.abs(y - aCenterY) - Math.abs(y - bCenterY);
          }
        });
        
        const closestItem = sorted[0];
        targetItemId = closestItem.id;
        
        // Determine if we should insert before or after based on pointer position
        const itemCenterX = closestItem.rect.left + closestItem.rect.width / 2;
        const itemCenterY = closestItem.rect.top + closestItem.rect.height / 2;
        
        if (isTile) {
          // For tile view: use whichever axis has more variance
          // If pointer is more to the right, insert after (to the right)
          // If pointer is more below, insert after (below)
          const xDiff = x - itemCenterX;
          const yDiff = y - itemCenterY;
          shouldInsertAfter = Math.abs(xDiff) > Math.abs(yDiff) ? xDiff > 0 : yDiff > 0;
        } else {
          // For list view: just check vertical
          shouldInsertAfter = y > itemCenterY;
        }
      }
    } else if (hoveredItem) {
      // We're directly hovering over an item
      targetClass = hoveredItem.data.classKey as ClassKey;
      targetItemId = hoveredItem.id;
      const itemCenterY = hoveredItem.rect.top + hoveredItem.rect.height / 2;
      shouldInsertAfter = y > itemCenterY;
    }
    
    // Use RAF to batch hover state updates outside of collision detection
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        updateHoverState(targetClass, targetItemId, shouldInsertAfter);
      });
    }
    
    // Return sortable items first for reordering, then class sections
    const result = [...(hoveredItem ? [hoveredItem] : []), ...(classSectionCollision ? [classSectionCollision] : [])];
    
    return result;
  }, [updateHoverState, isTile]);
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    
    // Find the dragged item and its class
    for (const classKey of classOrder) {
      const items = itemsByClass[classKey] ?? [];
      const item = items.find((i) => i.id === active.id);
      if (item) {
        setDraggedItem(item);
        setDraggedFromClass(classKey);
        break;
      }
    }
  };
  
  const handleDragOver = (event: DragOverEvent) => {
    // Collision detection now handles class hover state automatically
    // This handler is just for any additional logic if needed
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    // Reset drag states
    setActiveId(null);
    setDraggedItem(null);
    setDraggedFromClass(null);
    setDragOverClass(null);
    setDragOverItemId(null);
    setInsertAfter(false);
    setProgrammaticDrag(null);
    lastHoverState.current = { classKey: null, itemId: null, insertAfter: false };
    
    if (!over) {
      return;
    }
    
    const activeId = active.id as string;
    const overData = over.data.current;
    
    // Check if dropping on a class section (cross-class move)
    // This handles both dropping on class sections AND entries in other classes
    const overClassKey = overData?.type === 'class-section' 
      ? overData.classKey as ClassKey
      : overData?.classKey as ClassKey | undefined;
    
    if (onMoveBetweenClasses && draggedFromClass && overClassKey && overClassKey !== draggedFromClass) {
      const targetItems = itemsByClass[overClassKey] ?? [];
      let insertIndex = 0;
      
      // Calculate insert index based on which item we're dropping on
      if (dragOverItemId) {
        const overItemIndex = targetItems.findIndex((i) => i.id === dragOverItemId);
        if (overItemIndex !== -1) {
          insertIndex = insertAfter ? overItemIndex + 1 : overItemIndex;
        }
      }
      
      onMoveBetweenClasses(activeId, overClassKey, { atIndex: insertIndex });
      return;
    }
    
    // Handle within-class reordering
    if (!onReorderWithinClass) {
      return;
    }
    
    const classKey = active.data.current?.classKey as ClassKey | undefined;
    if (!classKey) {
      return;
    }
    
    const items = itemsByClass[classKey] ?? [];
    const oldIndex = items.findIndex((i) => i.id === activeId);
    const newIndex = items.findIndex((i) => i.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    
    const reordered = arrayMove([...items], oldIndex, newIndex);
    onReorderWithinClass(classKey, reordered.map((i) => i.id));
  };

  // Handle click-to-drop for programmatic drag
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (programmaticDrag && dragOverClass && dragOverClass !== programmaticDrag.classKey) {
      // Find the drop target
      const targetItems = itemsByClass[dragOverClass] ?? [];
      let insertIndex = 0;
      
      if (dragOverItemId) {
        const overItemIndex = targetItems.findIndex((i) => i.id === dragOverItemId);
        if (overItemIndex !== -1) {
          insertIndex = insertAfter ? overItemIndex + 1 : overItemIndex;
        }
      }
      
      onMoveBetweenClasses?.(programmaticDrag.itemId, dragOverClass, { atIndex: insertIndex });
      cancelDrag();
    }
  }, [programmaticDrag, dragOverClass, dragOverItemId, insertAfter, itemsByClass, onMoveBetweenClasses, cancelDrag]);
  const content = (
    <div className="ranked-list-body">
      {classOrder.map((classKey) => {
        const items = itemsByClass[classKey] ?? [];
        const subtitle = getClassSubtitle?.(classKey, items) ?? '';
        const isNonRankedDivider = classKey === 'BABY';
        const label = getClassLabel ? getClassLabel(classKey) : classKey;
        const tagline = getClassTagline?.(classKey);
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
            <DroppableClassSection 
              key={classKey} 
              classKey={classKey} 
              isDragOver={dragOverClass === classKey}
            >
              <section
                id={`class-section-${classKey}`}
                className={`class-section ${isNonRankedClass ? 'class-section--nonranked' : ''} ${
                  dragOverClass === classKey ? 'class-section--drag-over' : ''
                }`}
              >
              <header className="class-section-header">
                <div>
                  <h3 className="class-section-title">
                    {label}
                    {tagline ? <span className="class-section-tagline"> | {tagline}</span> : null}
                  </h3>
                  <p className="class-section-count">
                    {items.length} entries{subtitle ? ` | ${subtitle}` : ''}
                  </p>
                </div>
              </header>
              <div className={`class-section-rows ${isTile ? 'class-section-rows--tile' : ''}`}>
                {onReorderWithinClass ? (
                  <SortableContext
                    items={sortableIds}
                    strategy={isTile ? rectSortingStrategy : verticalListSortingStrategy}
                  >
                    {/* Show placeholder at top when hovering class but not a specific item */}
                    {effectiveActiveId && dragOverClass === classKey && effectiveDraggedFromClass && effectiveDraggedFromClass !== classKey && !dragOverItemId && (
                      <div className="entry-row-wrapper entry-row-wrapper--placeholder">
                        <div className="entry-row entry-row--placeholder">
                          <span className="placeholder-text">Drop here (top)</span>
                        </div>
                      </div>
                    )}
                    {items.map((item) => (
                      <>
                        {/* Show placeholder before this item when hovering it */}
                        {effectiveActiveId && dragOverClass === classKey && effectiveDraggedFromClass && effectiveDraggedFromClass !== classKey && dragOverItemId === item.id && !insertAfter && (
                          <div className="entry-row-wrapper entry-row-wrapper--placeholder">
                            <div className="entry-row entry-row--placeholder">
                              <span className="placeholder-text">Drop here (before)</span>
                            </div>
                          </div>
                        )}
                        <SortableRow
                          key={item.id}
                          item={item}
                          classKey={classKey}
                          renderRow={renderRow}
                        />
                        {/* Show placeholder after this item when hovering it */}
                        {effectiveActiveId && dragOverClass === classKey && effectiveDraggedFromClass && effectiveDraggedFromClass !== classKey && dragOverItemId === item.id && insertAfter && (
                          <div className="entry-row-wrapper entry-row-wrapper--placeholder">
                            <div className="entry-row entry-row--placeholder">
                              <span className="placeholder-text">Drop here (after)</span>
                            </div>
                          </div>
                        )}
                      </>
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
            </DroppableClassSection>
          </div>
        );
      })}
    </div>
  );

  const dragContextValue = {
    initiateDrag,
    isDragging: isDragActive,
    activeItemId: effectiveActiveId
  };

  if (onReorderWithinClass || onMoveBetweenClasses) {
    return (
      <DragInitiateContext.Provider value={dragContextValue}>
        <div 
          className={`ranked-list ranked-list--sortable mode-${viewMode} ${programmaticDrag ? 'programmatic-drag-active' : ''}`} 
          ref={ref}
          onClick={handleContainerClick}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={customCollisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {content}
            <DragOverlay>
              {effectiveActiveId && effectiveDraggedItem ? (
                <div className="drag-overlay">
                  {renderRow(effectiveDraggedItem)}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </DragInitiateContext.Provider>
    );
  }

  return <div className={`ranked-list mode-${viewMode}`} ref={ref}>{content}</div>;
}

export const RankedList = forwardRef(RankedListInner) as <T extends RankedItemBase>(
  props: RankedListProps<T> & { ref?: React.Ref<HTMLDivElement> }
) => JSX.Element;

