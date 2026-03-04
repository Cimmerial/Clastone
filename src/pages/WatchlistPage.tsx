import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  type DragEndEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useWatchlistStore, type WatchlistEntry, type WatchlistType } from '../state/watchlistStore';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { tmdbImagePath } from '../lib/tmdb';
import './WatchlistPage.css';

function formatYear(releaseDate?: string): string {
  if (!releaseDate) return '—';
  const y = releaseDate.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : releaseDate;
}

function WatchlistRow({
  entry,
  type,
  onRecordWatch,
  onMoveUp,
  onMoveDown,
  hasWatched,
  canMoveUp,
  canMoveDown
}: {
  entry: WatchlistEntry;
  type: WatchlistType;
  onRecordWatch: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  hasWatched: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    data: { type }
  });
  const style = transform ? { transform: CSS.Transform.toString(transform), transition } : undefined;
  return (
    <div
      ref={setNodeRef}
      className={`watchlist-row ${isDragging ? 'watchlist-row--dragging' : ''}`}
      style={style}
      {...attributes}
      {...listeners}
    >
      <div className="watchlist-row-poster">
        {entry.posterPath ? (
          <img src={tmdbImagePath(entry.posterPath) ?? ''} alt="" loading="lazy" />
        ) : (
          <span>🎬</span>
        )}
      </div>
      <div className="watchlist-row-main">
        <div className="watchlist-row-title">{entry.title}</div>
        <div className="watchlist-row-year">{formatYear(entry.releaseDate)}</div>
      </div>
      <div className="watchlist-row-actions">
        <button
          type="button"
          className="watchlist-row-move-btn"
          aria-label="Move up"
          disabled={!canMoveUp}
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp();
          }}
        >
          ↑
        </button>
        <button
          type="button"
          className="watchlist-row-move-btn"
          aria-label="Move down"
          disabled={!canMoveDown}
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown();
          }}
        >
          ↓
        </button>
        <button
          type="button"
          className="watchlist-row-btn"
          onClick={(e) => {
            e.stopPropagation();
            onRecordWatch();
          }}
        >
          {hasWatched ? 'Record another watch' : 'Record first watch'}
        </button>
      </div>
    </div>
  );
}

export function WatchlistPage() {
  const navigate = useNavigate();
  const { movies, tv, reorderWatchlist, removeFromWatchlist } = useWatchlistStore();
  const { getMovieById } = useMoviesStore();
  const { getShowById } = useTvStore();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const type = active.data.current?.type as WatchlistType | undefined;
    if (!type) return;
    const list = type === 'movies' ? movies : tv;
    const oldIndex = list.findIndex((e) => e.id === active.id);
    const newIndex = list.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove([...list], oldIndex, newIndex);
    reorderWatchlist(type, reordered.map((e) => e.id));
  };

  const handleRecordWatch = (entry: WatchlistEntry, type: WatchlistType) => {
    navigate('/search', { state: { fromWatchlistId: entry.id, fromWatchlistType: type } });
  };

  const moveWatchlistEntry = (type: WatchlistType, index: number, delta: number) => {
    const list = type === 'movies' ? [...movies] : [...tv];
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= list.length) return;
    const reordered = arrayMove(list, index, newIndex);
    reorderWatchlist(type, reordered.map((e) => e.id));
  };

  const hasWatched = (id: string): boolean => {
    const movie = getMovieById(id);
    if (movie?.watchRecords && movie.watchRecords.length > 0) return true;
    const show = getShowById(id);
    return !!(show?.watchRecords && show.watchRecords.length > 0);
  };

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Watchlist</h1>
          <p className="page-tagline">MOVIES & SHOWS TO WATCH</p>
        </div>
      </header>

      <div className="watchlist-page ranked-list--sortable">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="watchlist-sections">
            <section className="watchlist-section class-section">
              <header className="class-section-header">
                <h3 className="class-section-title">Movies</h3>
                <p className="class-section-count">{movies.length} entries</p>
              </header>
              <div className="class-section-rows">
                <SortableContext items={movies.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                  {movies.map((entry, index) => (
                    <WatchlistRow
                      key={entry.id}
                      entry={entry}
                      type="movies"
                      onRecordWatch={() => handleRecordWatch(entry, 'movies')}
                      onMoveUp={() => moveWatchlistEntry('movies', index, -1)}
                      onMoveDown={() => moveWatchlistEntry('movies', index, 1)}
                      hasWatched={hasWatched(entry.id)}
                      canMoveUp={index > 0}
                      canMoveDown={index < movies.length - 1}
                    />
                  ))}
                </SortableContext>
              </div>
            </section>

            <section className="watchlist-section class-section">
              <header className="class-section-header">
                <h3 className="class-section-title">TV Shows</h3>
                <p className="class-section-count">{tv.length} entries</p>
              </header>
              <div className="class-section-rows">
                <SortableContext items={tv.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                  {tv.map((entry, index) => (
                    <WatchlistRow
                      key={entry.id}
                      entry={entry}
                      type="tv"
                      onRecordWatch={() => handleRecordWatch(entry, 'tv')}
                      onMoveUp={() => moveWatchlistEntry('tv', index, -1)}
                      onMoveDown={() => moveWatchlistEntry('tv', index, 1)}
                      hasWatched={hasWatched(entry.id)}
                      canMoveUp={index > 0}
                      canMoveDown={index < tv.length - 1}
                    />
                  ))}
                </SortableContext>
              </div>
            </section>
          </div>
        </DndContext>
      </div>
    </section>
  );
}
