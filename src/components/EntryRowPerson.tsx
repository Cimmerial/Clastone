import { RankedItemBase } from './RankedList';

export type PersonItem = RankedItemBase & {
  absoluteRank: string;
  rankInClass: string;
  name: string;
  birthday?: string;
  topPerformances: string[];
};

type Props = {
  item: PersonItem;
};

export function EntryRowPerson({ item }: Props) {
  return (
    <article className="entry-row">
      <div className="entry-rank-block">
        <div className="entry-rank-main">
          <span className="entry-cell-label">Absolute</span> {item.absoluteRank}
        </div>
        <div className="entry-rank-secondary">
          <span className="entry-cell-label"># in class</span> {item.rankInClass}
        </div>
      </div>

      <div className="entry-meta-row">
        <div className="entry-poster">
          <span>👤</span>
        </div>
        <div>
          <div className="entry-title">{item.name}</div>
          <div className="entry-cell-label">{item.birthday ?? 'Birthday unknown'}</div>
        </div>
      </div>

      <div className="entry-cast-stack">
        <div className="entry-cell-label">Top performances</div>
        <div className="entry-cast-pills">
          {item.topPerformances.map((title) => (
            <span key={title} className="cast-pill">
              {title}
            </span>
          ))}
        </div>
      </div>

      <div className="entry-controls-row">
        <div className="entry-cell-label">Pinned soon</div>
        <div className="entry-controls">
          <button type="button" className="entry-config-btn">
            ⚙ Person settings
          </button>
          <button type="button" className="entry-move-btn">
            ↑↓ Move
          </button>
        </div>
      </div>
    </article>
  );
}

