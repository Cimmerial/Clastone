import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, Eye, Info, Pencil, Plus } from 'lucide-react';
import { useListsStore } from '../state/listsStore';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { tmdbImagePath } from '../lib/tmdb';
import { deleteGlobalCollection, saveGlobalCollectionsOrder as saveCollectionsOrder, upsertGlobalCollection } from '../lib/firestoreCollections';
import { RankedList, type RankedItemBase } from '../components/RankedList';
import { EntryRowMovieShow, type MovieShowItem } from '../components/EntryRowMovieShow';
import { InfoModal } from '../components/InfoModal';
import { UniversalEditModal, type UniversalEditTarget } from '../components/UniversalEditModal';
import { watchMatrixEntriesToWatchRecords } from '../lib/watchMatrixMapping';
import { prepareWatchRecordsForSave } from '../lib/watchDayOrderUtils';
import './ListsPage.css';

type ListCard = { id: string; title: string; subtitle: string; href: string; color?: string };
type CollectionCard = { id: string; title: string; seen: number; watchlistUnseen: number; total: number; href: string; color?: string };
type ListDetailItem = RankedItemBase & { source: 'saved' | 'unseen'; mediaType: 'movie' | 'tv'; item?: MovieShowItem; title: string };
type CollectionEntryId = `tmdb-tv-${number}` | `tmdb-movie-${number}`;

function isCollectionEntryId(value: string): value is CollectionEntryId {
  return /^tmdb-(tv|movie)-\d+$/.test(value);
}

function normalizeCollectionMediaType(raw: string): 'movie' | 'tv' {
  if (raw === 'tv' || raw === 'shows' || raw === 'show') return 'tv';
  return 'movie';
}

function collectionEntryIdFor(mediaType: string, tmdbId: number): CollectionEntryId {
  return `tmdb-${normalizeCollectionMediaType(mediaType)}-${tmdbId}`;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickPosterCollage(posters: string[], seedKey: string, minCount = 3, maxCount = 6): string[] {
  if (posters.length === 0) return [];
  const unique = Array.from(new Set(posters));
  const sorted = unique
    .map((poster) => ({ poster, score: hashString(`${seedKey}:${poster}`) }))
    .sort((a, b) => a.score - b.score)
    .map((item) => item.poster);
  const desired = Math.max(minCount, Math.min(maxCount, sorted.length));
  return sorted.slice(0, desired);
}

function pickPosterCollageFixedCount(posters: string[], seedKey: string, count: number): string[] {
  if (count <= 0 || posters.length === 0) return [];
  const base = pickPosterCollage(posters, seedKey, Math.min(count, posters.length), count);
  if (base.length >= count) return base.slice(0, count);
  const filled: string[] = [];
  for (let i = 0; i < count; i += 1) {
    filled.push(base[i % base.length]);
  }
  return filled;
}

function HoverCard({
  title,
  subtitle,
  href,
  sortableId,
  color,
  posterBackgrounds = [],
}: {
  title: string;
  subtitle: string;
  href: string;
  sortableId: string;
  color?: string;
  posterBackgrounds?: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });
  const style = transform ? { transform: CSS.Transform.toString(transform), transition } : undefined;
  return (
    <article ref={setNodeRef} style={{ ...style, borderColor: color ?? undefined }} className={`lists-card-clean ${isDragging ? 'lists-card-clean--dragging' : ''}`} {...attributes} {...listeners}>
      {posterBackgrounds.length > 0 ? (
        <div className="lists-card-clean-bg" aria-hidden="true">
          {posterBackgrounds.map((posterPath, index) => (
            <div key={`${posterPath}-${index}`} className="lists-card-clean-bg-item">
              <img src={tmdbImagePath(posterPath, 'w185') ?? ''} alt="" loading="lazy" />
            </div>
          ))}
        </div>
      ) : null}
      <div className="lists-card-clean-info">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <Link to={href} className="lists-eye-btn" title="Open"><Eye size={20} /></Link>
    </article>
  );
}

function RadialProgress({ seen, watchlistUnseen, total }: { seen: number; watchlistUnseen: number; total: number }) {
  const pct = total > 0 ? Math.round((seen / total) * 100) : 0;
  const seenPct = total > 0 ? Math.min(100, (seen / total) * 100) : 0;
  const watchlistPct = total > 0 ? Math.min(100 - seenPct, (watchlistUnseen / total) * 100) : 0;
  const combinedPct = Math.min(100, seenPct + watchlistPct);
  const seenColor = pct < 33 ? '#d95858' : pct < 67 ? '#d7b24f' : pct < 100 ? '#48b66e' : '#f0cf72';
  const ringStyle = {
    background: `conic-gradient(
      ${seenColor} 0% ${seenPct}%,
      #4da3ff ${seenPct}% ${combinedPct}%,
      rgba(255, 255, 255, 0.12) ${combinedPct}% 100%
    )`,
  };
  return (
    <div className="lists-radial-wrap">
      <div className="lists-radial-ring" style={ringStyle} />
      <div className="lists-radial-center"><div className="lists-radial-frac">{seen}/{total}</div><div className="lists-radial-pct">{pct}%</div></div>
    </div>
  );
}

function SortableCollectionCard({
  card,
  disabled,
}: {
  card: CollectionCard & { posterBackgrounds?: string[] };
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled });
  const style = transform ? { transform: CSS.Transform.toString(transform), transition } : undefined;
  return (
    <article ref={setNodeRef} style={{ ...style, borderColor: card.color ?? undefined }} className={`lists-card-clean lists-card-clean--collection ${isDragging ? 'lists-card-clean--dragging' : ''}`} {...attributes} {...listeners}>
      {card.posterBackgrounds && card.posterBackgrounds.length > 0 ? (
        <div className="lists-card-clean-bg lists-card-clean-bg--collection" aria-hidden="true">
          {card.posterBackgrounds.map((posterPath, index) => (
            <div key={`${posterPath}-${index}`} className="lists-card-clean-bg-item">
              <img src={tmdbImagePath(posterPath, 'w185') ?? ''} alt="" loading="lazy" />
            </div>
          ))}
        </div>
      ) : null}
      <div className="lists-card-clean-info">
        <h3>{card.title}</h3>
        <p>{card.seen}/{card.total} complete</p>
      </div>
      <div className="lists-collection-left"><Link to={card.href} className="lists-eye-btn" title="Open"><Eye size={20} /></Link></div>
      <div className="lists-collection-center"><RadialProgress seen={card.seen} watchlistUnseen={card.watchlistUnseen} total={card.total} /></div>
    </article>
  );
}

function RenameEntityModal({
  title,
  initialName,
  initialColor,
  initialSummary,
  allowColorEdit = false,
  allowSummaryEdit = false,
  onClose,
  onSave,
}: {
  title: string;
  initialName: string;
  initialColor?: string;
  initialSummary?: string;
  allowColorEdit?: boolean;
  allowSummaryEdit?: boolean;
  onClose: () => void;
  onSave: (payload: { name: string; color?: string; summary?: string }) => void | Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor ?? '#deb55e');
  const [summary, setSummary] = useState(initialSummary ?? '');
  return (
    <div className="lists-modal-backdrop" onClick={onClose}>
      <div className="lists-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="lists-input" autoFocus />
        {allowColorEdit ? (
          <div className="lists-color-row">
            <span>Tag color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              onBlur={(e) => e.currentTarget.blur()}
              className="lists-color-input"
            />
          </div>
        ) : null}
        {allowSummaryEdit ? (
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Collection summary"
            className="lists-input"
            rows={2}
          />
        ) : null}
        <div className="lists-modal-actions">
          <button className="lists-button" onClick={onClose}>Cancel</button>
          <button
            className="lists-button"
            onClick={async () => {
              const trimmed = name.trim();
              if (!trimmed) return;
              await onSave({
                name: trimmed,
                color: allowColorEdit ? color : undefined,
                summary: allowSummaryEdit ? (summary.trim() || undefined) : undefined
              });
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateEntityModal({ onClose, onCreate, title, defaultColor }: { onClose: () => void; title: string; defaultColor?: string; onCreate: (name: string, type: 'movie' | 'tv' | 'both', color?: string) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'movie' | 'tv' | 'both'>('both');
  const [color, setColor] = useState(defaultColor ?? '#deb55e');
  return (
    <div className="lists-modal-backdrop" onClick={onClose}>
      <div className="lists-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="List name" className="lists-input" autoFocus />
        <select value={type} onChange={(e) => setType(e.target.value as 'movie' | 'tv' | 'both')} className="lists-select">
          <option value="movie">Movie</option><option value="tv">Show</option><option value="both">Movie + Show</option>
        </select>
        <div className="lists-color-row">
          <span>Tag color</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            onBlur={(e) => e.currentTarget.blur()}
            className="lists-color-input"
          />
        </div>
        <div className="lists-modal-actions">
          <button className="lists-button" onClick={onClose}>Cancel</button>
          <button className="lists-button" onClick={() => { const trimmed = name.trim(); if (!trimmed) return; onCreate(trimmed, type, color); onClose(); }}>Create</button>
        </div>
      </div>
    </div>
  );
}

function AddSavedEntryModal({ title, items, onClose, onAdd }: { title: string; items: MovieShowItem[]; onClose: () => void; onAdd: (item: MovieShowItem) => void }) {
  const [query, setQuery] = useState('');
  const fuzzyScore = (title: string, q: string) => {
    const t = title.toLowerCase();
    const needle = q.toLowerCase().trim();
    if (!needle) return 1;
    if (t === needle) return 1000;
    if (t.startsWith(needle)) return 700;
    if (t.includes(needle)) return 500;
    let score = 0;
    let i = 0;
    for (const ch of t) {
      if (ch === needle[i]) { score += 10; i += 1; if (i === needle.length) break; }
    }
    return i === needle.length ? score : -1;
  };
  const filtered = useMemo(() => {
    const scored = items.map((item) => ({ item, score: fuzzyScore(item.title, query) })).filter((row) => row.score >= 0);
    scored.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
    return scored.map((row) => row.item);
  }, [items, query]);
  return (
    <div className="lists-modal-backdrop" onClick={onClose}>
      <div className="lists-modal lists-modal--add-entry" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <input value={query} onChange={(e) => setQuery(e.target.value)} className="lists-input" placeholder="Search saved entries..." autoFocus />
        <div className="lists-saved-grid">
          {filtered.slice(0, 30).map((item) => (
            <button key={item.id} className="lists-saved-card" onClick={() => onAdd(item)}>
              <div className="lists-saved-poster">{item.posterPath ? <img src={tmdbImagePath(item.posterPath, 'w185') ?? ''} alt={item.title} loading="lazy" /> : <div className="lists-saved-poster-fallback" />}</div>
              <span className="lists-saved-title">{item.title}</span>
            </button>
          ))}
          {filtered.length === 0 ? <div className="lists-subtitle">No matches.</div> : null}
        </div>
        <div className="lists-modal-actions"><button className="lists-button" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: () => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="lists-modal-backdrop" onClick={onCancel}>
      <div className="lists-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Delete {title}</h3>
        <p className="lists-subtitle">Type <strong>DELETE</strong> to confirm.</p>
        <input value={value} onChange={(e) => setValue(e.target.value)} className="lists-input" placeholder="DELETE" autoFocus />
        <div className="lists-modal-actions">
          <button className="lists-button" onClick={onCancel}>Cancel</button>
          <button className="lists-button" disabled={value !== 'DELETE'} onClick={onConfirm}>Confirm Delete</button>
        </div>
      </div>
    </div>
  );
}

function AddDeleteActions({
  showAdd,
  onAdd,
  showDelete,
  onDelete,
  showCopyList,
  onCopyList
}: {
  showAdd: boolean;
  onAdd: () => void;
  showDelete: boolean;
  onDelete: () => void;
  showCopyList?: boolean;
  onCopyList?: () => void;
}) {
  return (
    <div className="lists-inline-actions">
      {showAdd ? <button className="lists-button lists-plus-btn" onClick={onAdd} title="Add saved entry"><Plus size={18} /></button> : null}
      {showCopyList ? <button className="lists-button" onClick={onCopyList} title="Copy list as ordered text">Copy list</button> : null}
      {showDelete ? <button className="lists-delete-icon-btn" onClick={onDelete} title="Delete"><span>×</span></button> : null}
    </div>
  );
}

function InfoTextModal({
  title,
  message,
  onClose,
}: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="lists-modal-backdrop" onClick={onClose}>
      <div className="lists-modal lists-modal--info" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="lists-subtitle">{message}</p>
        <div className="lists-modal-actions">
          <button className="lists-button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function UnseenTile({ title }: { title: string }) {
  return <article className="entry-tile entry-tile--unseen"><div className="entry-tile-poster entry-tile-poster--unseen" /><div className="entry-tile-title">{title}</div></article>;
}

function buildCollectionFallbackItem(id: string, title: string, tmdbId: number, classKey: string, posterPath?: string, releaseDate?: string): MovieShowItem {
  return {
    id,
    classKey,
    title,
    percentileRank: '',
    absoluteRank: '',
    rankInClass: '',
    viewingDates: '',
    topCastNames: [],
    stickerTags: [],
    percentCompleted: '0%',
    tmdbId,
    posterPath,
    releaseDate,
    watchRecords: [],
  };
}

export function ListsPage() {
  const watchlist = useWatchlistStore();
  const { isAdmin } = useAuth();
  const canEditCollections = isAdmin && import.meta.env.DEV;
  const { lists, listOrder, entriesByListId, globalCollections, createList, reorderLists, reorderGlobalCollections, upsertGlobalCollection: upsertGlobalCollectionLocal } = useListsStore();
  const { byClass: movieByClass } = useMoviesStore();
  const { byClass: tvByClass } = useTvStore();
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [showCreateCollectionModal, setShowCreateCollectionModal] = useState(false);
  const [showListsInfoModal, setShowListsInfoModal] = useState(false);
  const [showCollectionsInfoModal, setShowCollectionsInfoModal] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const allEntries = useMemo(() => [...Object.values(movieByClass).flat(), ...Object.values(tvByClass).flat()], [movieByClass, tvByClass]);
  const entryById = useMemo(() => new Map(allEntries.map((entry) => [entry.id, entry])), [allEntries]);
  const listById = useMemo(() => new Map(lists.map((item) => [item.id, item])), [lists]);
  const listCards = useMemo<Array<ListCard & { posterBackgrounds: string[] }>>(() => listOrder
    .map((id) => listById.get(id))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .map((list) => {
      const entryPosters = (entriesByListId[list.id] ?? [])
        .map((entry) => entryById.get(entry.entryId)?.posterPath)
        .filter((poster): poster is string => Boolean(poster));
      return {
        id: list.id,
        title: list.name,
        subtitle: `${(entriesByListId[list.id] ?? []).length} entries · ${list.mediaType}`,
        href: `/lists/${list.id}`,
        color: list.color,
        posterBackgrounds: pickPosterCollage(entryPosters, list.id),
      };
    }), [listOrder, listById, entriesByListId, entryById]);
  const collectionCards = useMemo<Array<CollectionCard & { posterBackgrounds: string[] }>>(() => globalCollections.map((collection) => {
    const total = collection.entries.length;
    const statuses = collection.entries.map((entry) => {
      const id = collectionEntryIdFor(entry.mediaType, entry.tmdbId);
      const isSeen = Boolean(allEntries.find((item) => item.id === id)?.watchRecords?.length);
      const isWatchlistUnseen = !isSeen && watchlist.isInWatchlist(id);
      return { isSeen, isWatchlistUnseen };
    });
    const seen = statuses.filter((s) => s.isSeen).length;
    const watchlistUnseen = statuses.filter((s) => s.isWatchlistUnseen).length;
    const posters = collection.entries
      .map((entry) => {
        const id = collectionEntryIdFor(entry.mediaType, entry.tmdbId);
        return entryById.get(id)?.posterPath ?? entry.posterPath;
      })
      .filter((poster): poster is string => Boolean(poster));
    return {
      id: collection.id,
      title: collection.name,
      seen,
      watchlistUnseen,
      total,
      href: `/lists/collection/${collection.id}`,
      color: collection.color,
      posterBackgrounds: pickPosterCollageFixedCount(posters, `collection:${collection.id}`, 12),
    };
  }), [globalCollections, allEntries, watchlist, entryById]);
  const onListDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = listCards.findIndex((item) => item.id === active.id);
    const newIndex = listCards.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorderLists(arrayMove(listCards.map((item) => item.id), oldIndex, newIndex));
  };
  const onCollectionDragEnd = async (event: DragEndEvent) => {
    if (!canEditCollections || !db) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = collectionCards.findIndex((item) => item.id === active.id);
    const newIndex = collectionCards.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(collectionCards.map((item) => item.id), oldIndex, newIndex);
    reorderGlobalCollections(next);
    await saveCollectionsOrder(db, next);
  };
  return (
    <section className="lists-page">
      <header className="page-heading"><div><h1 className="page-title">Lists</h1></div><div /></header>
      <section className="class-section">
        <header className="class-section-header"><div><div className="lists-section-title-row"><h3 className="class-section-title">Lists</h3><button className="lists-info-btn" onClick={() => setShowListsInfoModal(true)} title="About lists" aria-label="About lists"><Info size={13} /></button></div><p className="class-section-count">{listCards.length} entries</p></div><button className="lists-button lists-plus-btn" onClick={() => setShowCreateListModal(true)} title="Create list"><Plus size={18} /></button></header>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onListDragEnd}><SortableContext items={listCards.map((item) => item.id)} strategy={verticalListSortingStrategy}><div className="lists-card-grid">{listCards.map((card) => <div key={card.id} className="lists-card-slot"><HoverCard title={card.title} subtitle={card.subtitle} href={card.href} sortableId={card.id} color={card.color} posterBackgrounds={card.posterBackgrounds} /></div>)}</div></SortableContext></DndContext>
      </section>
      <section className="class-section">
        <header className="class-section-header"><div><div className="lists-section-title-row"><h3 className="class-section-title">Collections</h3><button className="lists-info-btn" onClick={() => setShowCollectionsInfoModal(true)} title="About collections" aria-label="About collections"><Info size={13} /></button></div><p className="class-section-count">{collectionCards.length} entries</p></div>{canEditCollections ? <button className="lists-button lists-plus-btn" onClick={() => setShowCreateCollectionModal(true)} title="Create collection"><Plus size={18} /></button> : null}</header>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCollectionDragEnd}><SortableContext items={collectionCards.map((item) => item.id)} strategy={verticalListSortingStrategy}><div className="lists-card-grid">{collectionCards.map((card) => <SortableCollectionCard key={card.id} card={card} disabled={!canEditCollections} />)}</div></SortableContext></DndContext>
      </section>
      {showCreateListModal ? <CreateEntityModal title="Create List" onClose={() => setShowCreateListModal(false)} onCreate={(name, type, color) => createList(name, type, 'list', color)} /> : null}
      {showCreateCollectionModal && canEditCollections ? <CreateEntityModal title="Create Collection" defaultColor="#48b66e" onClose={() => setShowCreateCollectionModal(false)} onCreate={async (name, type, color) => { if (!db) return; const id = `collection-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || crypto.randomUUID()}`; const next = { id, name, mediaType: type, color, hidden: false, updatedAt: new Date().toISOString(), entries: [] }; await upsertGlobalCollection(db, next); upsertGlobalCollectionLocal(next); }} /> : null}
      {showCollectionsInfoModal ? (
        <InfoTextModal
          title="About Collections"
          message="Collections are not meant to make you watch everything on every list. They are here to diversify your palette and help you discover new genres, styles, and cultures. The blue portion of the fill ring represents items currently on your watchlist."
          onClose={() => setShowCollectionsInfoModal(false)}
        />
      ) : null}
      {showListsInfoModal ? (
        <InfoTextModal
          title="About Lists"
          message="Lists are for making custom lists for fun. Once a list is made, you can add something from the Edit Watch modal."
          onClose={() => setShowListsInfoModal(false)}
        />
      ) : null}
    </section>
  );
}

export function ListDetailPage() {
  const navigate = useNavigate();
  const { listId, collectionId } = useParams<{ listId?: string; collectionId?: string }>();
  const isCollection = Boolean(collectionId);
  const { isAdmin } = useAuth();
  const watchlist = useWatchlistStore();
  const canEditCollections = isAdmin && import.meta.env.DEV;
  const canEditNameAndColor = isAdmin && import.meta.env.DEV;
  const { lists, entriesByListId, reorderEntriesInList, addEntryToListTop, globalCollections, updateList, removeGlobalCollection, deleteList, getEditableListsForMediaType, getSelectedListIdsForEntry, setEntryListMembership, collectionIdsByEntryId, upsertGlobalCollection: upsertGlobalCollectionLocal } = useListsStore();
  const {
    byClass: movieByClass,
    classOrder: movieClassOrder,
    classes: movieClasses,
    getClassLabel: getMovieClassLabel,
    updateMovieWatchRecords,
    moveItemToClass: moveMovieToClass,
    getMovieById,
    addMovieFromSearch,
    removeMovieEntry
  } = useMoviesStore();
  const {
    byClass: tvByClass,
    classOrder: tvClassOrder,
    classes: tvClasses,
    getClassLabel: getTvClassLabel,
    updateShowWatchRecords,
    moveItemToClass: moveShowToClass,
    getShowById,
    addShowFromSearch,
    removeShowEntry
  } = useTvStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddEntryModal, setShowAddEntryModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [settingsFor, setSettingsFor] = useState<MovieShowItem | null>(null);
  const [infoModalTarget, setInfoModalTarget] = useState<{ tmdbId: number; entryId?: string; title: string; posterPath?: string; releaseDate?: string; mediaType: 'movie' | 'tv' } | null>(null);
  const activeCollection = globalCollections.find((item) => item.id === collectionId);
  const activeList = lists.find((item) => item.id === listId);
  const entryMap = useMemo(() => {
    const map = new Map<string, MovieShowItem>();
    [...Object.values(movieByClass).flat(), ...Object.values(tvByClass).flat()].forEach((item) => map.set(item.id, item));
    return map;
  }, [movieByClass, tvByClass]);
  const detailItems = useMemo<ListDetailItem[]>(() => {
    if (isCollection && activeCollection) {
      return activeCollection.entries.slice().sort((a, b) => a.position - b.position).map((entry) => {
        const normalizedMediaType = normalizeCollectionMediaType(entry.mediaType);
        const id = collectionEntryIdFor(entry.mediaType, entry.tmdbId);
        const item = entryMap.get(id);
        const fallbackTitle = entry.title ?? `${entry.mediaType.toUpperCase()} #${entry.tmdbId}`;
        return {
          id,
          classKey: 'LIST',
          source: item ? 'saved' : 'unseen',
          mediaType: normalizedMediaType,
          item: item ?? buildCollectionFallbackItem(id, fallbackTitle, entry.tmdbId, 'UNRANKED', entry.posterPath, entry.releaseDate),
          title: item?.title ?? fallbackTitle
        };
      });
    }
    if (activeList) {
      return (entriesByListId[activeList.id] ?? []).slice().sort((a, b) => a.position - b.position).map((entry) => ({ id: entry.entryId, classKey: 'LIST', source: entryMap.has(entry.entryId) ? 'saved' : 'unseen', mediaType: entry.mediaType, item: entryMap.get(entry.entryId), title: entryMap.get(entry.entryId)?.title ?? entry.entryId }));
    }
    return [];
  }, [isCollection, activeCollection, activeList, entriesByListId, entryMap]);
  const movieIdsInNonUnrankedClasses = useMemo(() => {
    const ids = new Set<string>();
    for (const [classKey, items] of Object.entries(movieByClass)) {
      if (classKey === 'UNRANKED') continue;
      for (const item of items ?? []) ids.add(item.id);
    }
    return ids;
  }, [movieByClass]);
  const tvIdsInNonUnrankedClasses = useMemo(() => {
    const ids = new Set<string>();
    for (const [classKey, items] of Object.entries(tvByClass)) {
      if (classKey === 'UNRANKED') continue;
      for (const item of items ?? []) ids.add(item.id);
    }
    return ids;
  }, [tvByClass]);
  const title = isCollection ? activeCollection?.name : activeList?.name;
  const canDrag = (Boolean(activeList) && !isCollection) || (Boolean(activeCollection) && isCollection && canEditCollections);
  const allSavedItems = useMemo(() => [...Object.values(movieByClass).flat(), ...Object.values(tvByClass).flat()], [movieByClass, tvByClass]);
  const addableSavedItems = useMemo(() => {
    if (!activeList) return [];
    const existing = new Set((entriesByListId[activeList.id] ?? []).map((entry) => entry.entryId));
    return allSavedItems.filter((item) => {
      if (existing.has(item.id)) return false;
      if (activeList.mediaType === 'movie') return item.id.startsWith('tmdb-movie-');
      if (activeList.mediaType === 'tv') return item.id.startsWith('tmdb-tv-');
      return true;
    });
  }, [activeList, entriesByListId, allSavedItems]);
  const removeCollectionEntry = async (entryId: string) => {
    if (!activeCollection || !canEditCollections) return;
    const nextEntries = activeCollection.entries
      .filter((entry) => collectionEntryIdFor(entry.mediaType, entry.tmdbId) !== entryId)
      .map((entry, position) => ({ ...entry, position }));
    if (nextEntries.length === activeCollection.entries.length) return;
    const nextCollection = { ...activeCollection, entries: nextEntries, updatedAt: new Date().toISOString() };
    upsertGlobalCollectionLocal(nextCollection);
    if (db) {
      await upsertGlobalCollection(db, nextCollection);
    }
  };
  if (!title) return <section className="lists-page"><header className="page-heading"><h1 className="page-title">List not found</h1><div className="page-actions-row"><button className="lists-button" onClick={() => navigate('/lists')}>Back</button></div></header></section>;
  return (
    <section className="lists-page">
      <header className="page-heading">
        <div className="lists-detail-title-wrap">
          <div className="lists-back-title-row">
            <button className="lists-back-icon-btn" onClick={() => navigate('/lists')} aria-label="Back to lists"><ArrowLeft size={18} /></button>
            <h1 className="page-title">{title}</h1>
            {(!isCollection || canEditCollections) ? (
              <button
                type="button"
                className="lists-edit-name-btn"
                onClick={() => setShowRenameModal(true)}
                title={`${canEditNameAndColor ? 'Edit' : 'Rename'} ${title}`}
                aria-label={`${canEditNameAndColor ? 'Edit' : 'Rename'} ${title}`}
              >
                <Pencil size={13} />
              </button>
            ) : null}
          </div>
          {isCollection && activeCollection?.summary ? (
            <p className="lists-collection-summary">{activeCollection.summary}</p>
          ) : null}
        </div>
      </header>
      <RankedList<ListDetailItem>
        classOrder={['LIST']}
        viewMode="tile"
        itemsByClass={{ LIST: detailItems }}
        getClassLabel={() => `${title} | ${isCollection ? 'Collection' : 'List'}`}
        getClassTagline={() => undefined}
        renderClassActions={() => <AddDeleteActions showAdd={!isCollection && Boolean(activeList)} onAdd={() => setShowAddEntryModal(true)} showDelete={!isCollection || canEditCollections} onDelete={() => setShowDeleteConfirm(true)} showCopyList={Boolean(isCollection && canEditCollections)} onCopyList={async () => {
          const lines = detailItems.map((item) => item.title).join('\n');
          if (!lines.trim()) return;
          try {
            await navigator.clipboard.writeText(lines);
          } catch {
            console.warn('Failed to copy list to clipboard.');
          }
        }} />}
        onReorderWithinClass={canDrag ? async (_classKey, ids) => {
          if (isCollection && activeCollection) {
            const byId = new Map<CollectionEntryId, (typeof activeCollection.entries)[number]>(
              activeCollection.entries.map((entry) => [`tmdb-${entry.mediaType}-${entry.tmdbId}` as CollectionEntryId, entry])
            );
            const nextEntries = ids
              .map((id, position) => {
                if (!isCollectionEntryId(id)) return null;
                const existing = byId.get(id);
                return existing ? { ...existing, position } : null;
              })
              .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
            const nextCollection = { ...activeCollection, entries: nextEntries, updatedAt: new Date().toISOString() };
            upsertGlobalCollectionLocal(nextCollection);
            if (db) {
              await upsertGlobalCollection(db, nextCollection);
            }
            return;
          }
          if (activeList) {
            reorderEntriesInList(activeList.id, ids);
          }
        } : undefined}
        renderRow={(row) => row.item ? (() => {
          const item = row.item;
          const isSavedUnranked = isCollection && row.source === 'saved' && item.classKey === 'UNRANKED';
          const appearsInOtherClass = row.mediaType === 'movie'
            ? movieIdsInNonUnrankedClasses.has(item.id)
            : tvIdsInNonUnrankedClasses.has(item.id);
          const isUnrankedOnly = isSavedUnranked && !appearsInOtherClass;
          return (
          <div
            className={`lists-entry-tile-wrap ${
              isUnrankedOnly ? 'lists-entry-tile-wrap--unranked' : ''
            } ${
              isCollection && watchlist.isInWatchlist(item.id) ? 'lists-entry-tile-wrap--watchlisted' : ''
            }`}
          >
            {isCollection && canEditCollections ? (
              <button
                type="button"
                className="lists-entry-remove-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  void removeCollectionEntry(row.id);
                }}
                title="Remove from collection"
                aria-label={`Remove ${row.title} from collection`}
              >
                ×
              </button>
            ) : null}
            <EntryRowMovieShow
              item={item}
              listType={row.mediaType === 'movie' ? 'movies' : 'shows'}
              viewMode="tile"
              tileMinimalActions
              tileUnseenMuted={isCollection && (row.source === 'unseen' || isUnrankedOnly)}
              tileOverlayControls={
                isCollection ? (
                  <div className="lists-entry-toggle-stack">
                    {(row.source === 'unseen' || isUnrankedOnly) ? (
                      row.mediaType === 'movie' ? (
                        getMovieById(item.id)?.classKey === 'UNRANKED' ? (
                          <button
                            type="button"
                            className="lists-entry-toggle-btn lists-entry-toggle-btn--minus"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeMovieEntry(item.id);
                            }}
                          >
                            Unranked-
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="lists-entry-toggle-btn lists-entry-toggle-btn--plus"
                            onClick={(e) => {
                              e.stopPropagation();
                              const existing = getMovieById(item.id);
                              if (existing) moveMovieToClass(item.id, 'UNRANKED');
                              else {
                                addMovieFromSearch({
                                  id: item.id,
                                  title: item.title,
                                  subtitle: item.releaseDate ? item.releaseDate.slice(0, 4) : 'Saved',
                                  classKey: 'UNRANKED',
                                  posterPath: item.posterPath,
                                });
                              }
                            }}
                          >
                            Unranked+
                          </button>
                        )
                      ) : (
                        getShowById(item.id)?.classKey === 'UNRANKED' ? (
                          <button
                            type="button"
                            className="lists-entry-toggle-btn lists-entry-toggle-btn--minus"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeShowEntry(item.id);
                            }}
                          >
                            Unranked-
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="lists-entry-toggle-btn lists-entry-toggle-btn--plus"
                            onClick={(e) => {
                              e.stopPropagation();
                              const existing = getShowById(item.id);
                              if (existing) moveShowToClass(item.id, 'UNRANKED');
                              else {
                                addShowFromSearch({
                                  id: item.id,
                                  title: item.title,
                                  subtitle: item.releaseDate ? item.releaseDate.slice(0, 4) : 'Saved',
                                  classKey: 'UNRANKED',
                                });
                              }
                            }}
                          >
                            Unranked+
                          </button>
                        )
                      )
                    ) : null}
                    {watchlist.isInWatchlist(item.id) ? (
                        <button
                          type="button"
                          className="lists-entry-toggle-btn lists-entry-toggle-btn--minus"
                          onClick={(e) => {
                            e.stopPropagation();
                            watchlist.removeFromWatchlist(item.id);
                          }}
                        >
                          Watchlist-
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="lists-entry-toggle-btn lists-entry-toggle-btn--plus"
                          onClick={(e) => {
                            e.stopPropagation();
                            watchlist.addToWatchlist(
                              {
                                id: item.id,
                                title: item.title,
                                posterPath: item.posterPath,
                                releaseDate: item.releaseDate
                              },
                              row.mediaType === 'movie' ? 'movies' : 'tv'
                            );
                          }}
                        >
                          Watchlist+
                        </button>
                    )}
                  </div>
                ) : null
              }
              tileOverlayBadges={
                isCollection ? (
                  <>
                    {isUnrankedOnly ? (
                      <div className="lists-entry-status-badge lists-entry-status-badge--unranked">Unranked</div>
                    ) : null}
                    {watchlist.isInWatchlist(row.item.id) ? (
                      <div className="lists-entry-status-badge lists-entry-status-badge--watchlisted">Watchlisted</div>
                    ) : null}
                  </>
                ) : null
              }
              onInfo={(entry) => {
                const tmdbId = entry.tmdbId ?? (parseInt(entry.id.replace(/\D/g, ''), 10) || 0);
                setInfoModalTarget({ tmdbId, entryId: entry.id, title: entry.title, posterPath: entry.posterPath, releaseDate: entry.releaseDate, mediaType: row.mediaType });
              }}
              onOpenSettings={(entry) => setSettingsFor(entry)}
            />
          </div>
          );
        })() : <UnseenTile title={row.title} />}
      />
      {showAddEntryModal && activeList ? <AddSavedEntryModal title={`Add to ${activeList.name}`} items={addableSavedItems} onClose={() => setShowAddEntryModal(false)} onAdd={(item) => addEntryToListTop(activeList.id, item.id, item.id.startsWith('tmdb-tv-') ? 'tv' : 'movie')} /> : null}
      {settingsFor ? (
        (() => {
          const isTvSettingsItem = settingsFor.id.startsWith('tmdb-tv-');
          const existingSavedItem = isTvSettingsItem ? getShowById(settingsFor.id) : getMovieById(settingsFor.id);
          const effectiveClassKey = existingSavedItem?.classKey;
          const effectiveClassLabel = effectiveClassKey
            ? (isTvSettingsItem ? getTvClassLabel(effectiveClassKey) : getMovieClassLabel(effectiveClassKey))
            : undefined;
          return (
        <UniversalEditModal
          target={{
            id: settingsFor.id,
            tmdbId: settingsFor.tmdbId ?? (parseInt(settingsFor.id.replace(/\D/g, ''), 10) || 0),
            title: settingsFor.title,
            posterPath: settingsFor.posterPath,
            mediaType: settingsFor.id.startsWith('tmdb-tv-') ? 'tv' : 'movie',
            subtitle: settingsFor.releaseDate ? String(settingsFor.releaseDate.slice(0, 4)) : undefined,
            releaseDate: settingsFor.releaseDate,
            runtimeMinutes: settingsFor.runtimeMinutes,
            totalEpisodes: settingsFor.totalEpisodes,
            existingClassKey: effectiveClassKey
          } as UniversalEditTarget}
          initialWatches={settingsFor.watchRecords}
          currentClassKey={effectiveClassKey}
          currentClassLabel={effectiveClassLabel}
          rankedClasses={settingsFor.id.startsWith('tmdb-tv-') ? tvClasses : movieClasses}
          isWatchlistItem={watchlist.isInWatchlist(settingsFor.id)}
          onAddToWatchlist={() => {
            const isTv = settingsFor.id.startsWith('tmdb-tv-');
            watchlist.addToWatchlist(
              {
                id: settingsFor.id,
                title: settingsFor.title,
                posterPath: settingsFor.posterPath,
                releaseDate: settingsFor.releaseDate
              },
              isTv ? 'tv' : 'movies'
            );
          }}
          onRemoveFromWatchlist={() => watchlist.removeFromWatchlist(settingsFor.id)}
          onGoToWatchlist={() => navigate('/watchlist', { state: { scrollToId: settingsFor.id } })}
          availableTags={getEditableListsForMediaType(settingsFor.id.startsWith('tmdb-tv-') ? 'tv' : 'movie').map((list) => ({
            listId: list.id,
            label: list.name,
            color: list.color,
            selected: getSelectedListIdsForEntry(settingsFor.id).includes(list.id),
            href: `/lists/${list.id}`
          }))}
          collectionTags={(collectionIdsByEntryId.get(settingsFor.id) ?? []).map((id) => ({
            id,
            label: globalCollections.find((item) => item.id === id)?.name ?? id,
            color: globalCollections.find((item) => item.id === id)?.color,
            href: `/lists/collection/${id}`
          }))}
          onGoPickTemplate={() => {
            setSettingsFor(null);
            navigate(isTvSettingsItem ? '/tv#tv-class-templates' : '/movies#movie-class-templates', { replace: true });
          }}
          isSaving={false}
          onClose={() => setSettingsFor(null)}
          onRemoveEntry={existingSavedItem ? (itemId) => {
            const isTv = itemId.startsWith('tmdb-tv-');
            if (isTv) removeShowEntry(itemId);
            else removeMovieEntry(itemId);
            setSettingsFor(null);
          } : undefined}
          onSave={async (params, goToMedia) => {
            const watches = prepareWatchRecordsForSave(
              watchMatrixEntriesToWatchRecords(params.watches),
              settingsFor.id,
              movieByClass,
              tvByClass,
              movieClassOrder,
              tvClassOrder
            );
            const isTv = settingsFor.id.startsWith('tmdb-tv-');
            if (isTv && !getShowById(settingsFor.id)) {
              addShowFromSearch({
                id: settingsFor.id,
                title: settingsFor.title,
                subtitle: 'Saved',
                classKey: 'UNRANKED',
                cache: {
                  tmdbId: settingsFor.tmdbId ?? (parseInt(settingsFor.id.replace(/\D/g, ''), 10) || 0),
                  title: settingsFor.title,
                  posterPath: settingsFor.posterPath,
                  releaseDate: settingsFor.releaseDate,
                  genres: [],
                  cast: [],
                  creators: [],
                  seasons: []
                }
              });
            }
            if (!isTv && !getMovieById(settingsFor.id)) {
              addMovieFromSearch({
                id: settingsFor.id,
                title: settingsFor.title,
                subtitle: 'Saved',
                classKey: 'UNRANKED',
                posterPath: settingsFor.posterPath
              });
            }
            if (isTv) updateShowWatchRecords(settingsFor.id, watches);
            else updateMovieWatchRecords(settingsFor.id, watches);
            if (params.classKey) {
              const moveOptions = { toTop: params.position === 'top', toMiddle: params.position === 'middle' };
              if (isTv) moveShowToClass(settingsFor.id, params.classKey, moveOptions);
              else moveMovieToClass(settingsFor.id, params.classKey, moveOptions);
            }
            if (params.listMemberships?.length) {
              setEntryListMembership(settingsFor.id, isTv ? 'tv' : 'movie', params.listMemberships);
            }
            setSettingsFor(null);
            if (goToMedia) {
              navigate(isTv ? '/tv' : '/movies', { replace: true, state: { scrollToId: settingsFor.id } });
            }
          }}
          onTagToggle={(listId, selected) => {
            if (!settingsFor) return;
            setEntryListMembership(settingsFor.id, settingsFor.id.startsWith('tmdb-tv-') ? 'tv' : 'movie', [{ listId, selected }]);
          }}
        />
          );
        })()
      ) : null}
      {infoModalTarget ? <InfoModal isOpen onClose={() => setInfoModalTarget(null)} tmdbId={infoModalTarget.tmdbId} mediaType={infoModalTarget.mediaType} title={infoModalTarget.title} posterPath={infoModalTarget.posterPath} releaseDate={infoModalTarget.releaseDate} collectionTags={infoModalTarget.mediaType === 'movie' ? (() => { const entryId = infoModalTarget.entryId || `tmdb-movie-${infoModalTarget.tmdbId}`; return (collectionIdsByEntryId.get(entryId) ?? []).map((id) => ({ id, label: globalCollections.find((item) => item.id === id)?.name ?? id, color: globalCollections.find((item) => item.id === id)?.color })); })() : []} onEditWatches={() => { const target = detailItems.find((row) => row.id === `tmdb-${infoModalTarget.mediaType}-${infoModalTarget.tmdbId}`)?.item; if (target) { setInfoModalTarget(null); setSettingsFor(target); } }} /> : null}
      {showRenameModal ? (
        <RenameEntityModal
          title={isCollection ? (canEditNameAndColor ? 'Edit Collection' : 'Rename Collection') : (canEditNameAndColor ? 'Edit List' : 'Rename List')}
          initialName={title}
          initialColor={isCollection ? activeCollection?.color : activeList?.color}
          initialSummary={isCollection ? activeCollection?.summary : undefined}
          allowColorEdit={canEditNameAndColor}
          allowSummaryEdit={Boolean(isCollection && canEditNameAndColor)}
          onClose={() => setShowRenameModal(false)}
          onSave={async ({ name, color, summary }) => {
            if (isCollection) {
              if (!activeCollection || !canEditCollections) return;
              const next = {
                ...activeCollection,
                name,
                color: canEditNameAndColor ? color : activeCollection.color,
                summary: canEditNameAndColor ? summary : activeCollection.summary,
                updatedAt: new Date().toISOString()
              };
              upsertGlobalCollectionLocal(next);
              if (db) await upsertGlobalCollection(db, next);
              return;
            }
            if (!activeList) return;
            updateList(activeList.id, { name, ...(canEditNameAndColor ? { color } : {}) });
          }}
        />
      ) : null}
      {showDeleteConfirm ? <DeleteConfirmModal title={isCollection ? 'Collection' : 'List'} onCancel={() => setShowDeleteConfirm(false)} onConfirm={async () => { if (isCollection) { if (!canEditCollections || !db || !activeCollection) return; await deleteGlobalCollection(db, activeCollection.id); removeGlobalCollection(activeCollection.id); } else { if (!activeList) return; deleteList(activeList.id); } setShowDeleteConfirm(false); navigate('/lists'); }} /> : null}
    </section>
  );
}
