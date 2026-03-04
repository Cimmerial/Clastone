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
};

export function RankedList<T extends RankedItemBase>({
  classOrder,
  itemsByClass,
  renderRow,
  getClassSubtitle,
  getClassLabel
}: RankedListProps<T>) {
  return (
    <div className="ranked-list">
      <div className="ranked-list-body">
        {classOrder.map((classKey) => {
          const items = itemsByClass[classKey] ?? [];
          const subtitle = getClassSubtitle?.(classKey, items) ?? '';
          const isNonRankedDivider = classKey === 'BABY';
          const label = getClassLabel ? getClassLabel(classKey) : classKey;
          const isNonRankedClass =
            classKey === 'BABY' || classKey === 'DELICIOUS_GARBAGE' || classKey === 'UNRANKED';
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
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="entry-row-wrapper"
                      id={`entry-${item.id}`}
                    >
                      {renderRow(item)}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          );
        })}
      </div>
    </div>
  );
}

