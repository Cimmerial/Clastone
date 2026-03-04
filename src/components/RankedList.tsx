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
};

export function RankedList<T extends RankedItemBase>({
  classOrder,
  itemsByClass,
  renderRow
}: RankedListProps<T>) {
  return (
    <div className="ranked-list">
      <div className="ranked-list-body">
        {classOrder.map((classKey) => {
          const items = itemsByClass[classKey] ?? [];
          return (
            <section key={classKey} className="class-section">
              <header className="class-section-header">
                <div>
                  <h3 className="class-section-title">{classKey}</h3>
                  <p className="class-section-count">{items.length} entries</p>
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
          );
        })}
      </div>
    </div>
  );
}

