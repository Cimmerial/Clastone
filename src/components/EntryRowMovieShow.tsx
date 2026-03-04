import { RankedItemBase } from './RankedList';
import { EntrySettingsModal, WatchEntry } from './EntrySettingsModal';

/** One recorded watch: at least year; month/day optional. */
export type WatchRecord = {
  id: string;
  year: number;
  month?: number;
  day?: number;
};

export type MovieShowItem = RankedItemBase & {
  percentileRank: string;
  absoluteRank: string;
  numberRanking?: string;
  rankInClass: string;
  title: string;
  viewingDates: string;
  watchTime?: string;
  watchHistory?: WatchEntry[];
  /** Source of truth for "Watched N× · Last: … · N% · Xm total". */
  watchRecords?: WatchRecord[];
  /** Minutes; used for "Xm total" when set. */
  runtimeMinutes?: number;
  topCastNames: string[];
  stickerTags: string[];
  percentCompleted: string;
};

type Props = {
  item: MovieShowItem;
  onOpenSettings?: (item: MovieShowItem) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onClassUp?: () => void;
  onClassDown?: () => void;
};

type CompactProps = {
  item: MovieShowItem;
};

export function EntryRowMovieShow({
  item,
  onOpenSettings,
  onMoveUp,
  onMoveDown,
  onClassUp,
  onClassDown
}: Props) {
  return (
    <article className="entry-row">
      <div className="entry-top-row">
        <div className="entry-top-stats">
          <div className="entry-stat-pill">{item.percentileRank}</div>
          <div className="entry-stat-pill">{item.absoluteRank}</div>
          <div className="entry-stat-pill">{item.rankInClass}</div>
        </div>
        <div className="entry-controls-column">
          <button
            type="button"
            className="entry-config-btn"
            aria-label="Move to previous class"
            disabled={!onClassUp}
            onClick={onClassUp}
          >
            ⇡
          </button>
          <button
            type="button"
            className="entry-config-btn"
            aria-label="Move to next class"
            disabled={!onClassDown}
            onClick={onClassDown}
          >
            ⇣
          </button>
          <button
            type="button"
            className="entry-config-btn"
            aria-label="Move up"
            disabled={!onMoveUp}
            onClick={onMoveUp}
          >
            ↑
          </button>
          <button
            type="button"
            className="entry-config-btn"
            aria-label="Move down"
            disabled={!onMoveDown}
            onClick={onMoveDown}
          >
            ↓
          </button>
          <button
            type="button"
            className="entry-config-btn"
            aria-label="Entry settings"
            onClick={() => onOpenSettings?.(item)}
          >
            ⚙
          </button>
        </div>
      </div>

      <div className="entry-divider" />

      <div className="entry-meta-row">
        <div className="entry-poster">
          <span>🎬</span>
        </div>
        <div>
          <div className="entry-title">{item.title}</div>
          <div className="entry-subtitle">
            {item.viewingDates}
            {item.watchTime != null && item.watchTime !== '' && ` · ${item.watchTime}`}
          </div>
        </div>
      </div>
    </article>
  );
}

export function CompactMovieRow({ item }: CompactProps) {
  return (
    <article className="entry-row entry-row--compact">
      <div className="entry-title entry-title-compact">{item.title}</div>
      <div className="entry-top-stats">
        <div className="entry-stat-pill">{item.percentileRank}</div>
        <div className="entry-stat-pill">{item.absoluteRank}</div>
        <div className="entry-stat-pill">{item.rankInClass}</div>
      </div>
    </article>
  );
}


