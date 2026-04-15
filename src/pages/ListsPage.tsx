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
import type { WatchRecord } from '../components/EntryRowMovieShow';
import './ListsPage.css';

type ListCard = { id: string; title: string; subtitle: string; href: string; color?: string };
type CollectionCard = { id: string; title: string; seen: number; watchlistUnseen: number; total: number; href: string; color?: string };
type ListDetailItem = RankedItemBase & { source: 'saved' | 'unseen'; mediaType: 'movie' | 'tv'; item?: MovieShowItem; title: string };
type CollectionEntryId = `tmdb-tv-${number}` | `tmdb-movie-${number}`;

function isCollectionEntryId(value: string): value is CollectionEntryId {
  return /^tmdb-(tv|movie)-\d+$/.test(value);
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
  allowColorEdit = false,
  onClose,
  onSave,
}: {
  title: string;
  initialName: string;
  initialColor?: string;
  allowColorEdit?: boolean;
  onClose: () => void;
  onSave: (payload: { name: string; color?: string }) => void | Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor ?? '#deb55e');
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
        <div className="lists-modal-actions">
          <button className="lists-button" onClick={onClose}>Cancel</button>
          <button
            className="lists-button"
            onClick={async () => {
              const trimmed = name.trim();
              if (!trimmed) return;
              await onSave({ name: trimmed, color: allowColorEdit ? color : undefined });
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
      const id = `tmdb-${entry.mediaType}-${entry.tmdbId}`;
      const isSeen = Boolean(allEntries.find((item) => item.id === id)?.watchRecords?.length);
      const isWatchlistUnseen = !isSeen && watchlist.isInWatchlist(id);
      return { isSeen, isWatchlistUnseen };
    });
    const seen = statuses.filter((s) => s.isSeen).length;
    const watchlistUnseen = statuses.filter((s) => s.isWatchlistUnseen).length;
    const posters = collection.entries
      .map((entry) => {
        const id = `tmdb-${entry.mediaType}-${entry.tmdbId}`;
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
  const { byClass: movieByClass, getClassLabel: getMovieClassLabel, updateMovieWatchRecords, getMovieById, addMovieFromSearch } = useMoviesStore();
  const { byClass: tvByClass, getClassLabel: getTvClassLabel, updateShowWatchRecords, getShowById, addShowFromSearch } = useTvStore();
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
        const id = `tmdb-${entry.mediaType}-${entry.tmdbId}`;
        const item = entryMap.get(id);
        const fallbackTitle = entry.title ?? `${entry.mediaType.toUpperCase()} #${entry.tmdbId}`;
        return {
          id,
          classKey: 'LIST',
          source: item ? 'saved' : 'unseen',
          mediaType: entry.mediaType,
          item: item ?? buildCollectionFallbackItem(id, fallbackTitle, entry.tmdbId, 'LIST', entry.posterPath, entry.releaseDate),
          title: item?.title ?? fallbackTitle
        };
      });
    }
    if (activeList) {
      return (entriesByListId[activeList.id] ?? []).slice().sort((a, b) => a.position - b.position).map((entry) => ({ id: entry.entryId, classKey: 'LIST', source: entryMap.has(entry.entryId) ? 'saved' : 'unseen', mediaType: entry.mediaType, item: entryMap.get(entry.entryId), title: entryMap.get(entry.entryId)?.title ?? entry.entryId }));
    }
    return [];
  }, [isCollection, activeCollection, activeList, entriesByListId, entryMap]);
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
      .filter((entry) => `tmdb-${entry.mediaType}-${entry.tmdbId}` !== entryId)
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
        renderRow={(row) => row.item ? (
          <div className="lists-entry-tile-wrap">
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
            <EntryRowMovieShow item={row.item} listType={row.mediaType === 'movie' ? 'movies' : 'shows'} viewMode="tile" tileMinimalActions tileUnseenMuted={isCollection && row.source === 'unseen'} onInfo={(entry) => { const tmdbId = entry.tmdbId ?? (parseInt(entry.id.replace(/\D/g, ''), 10) || 0); setInfoModalTarget({ tmdbId, entryId: entry.id, title: entry.title, posterPath: entry.posterPath, releaseDate: entry.releaseDate, mediaType: row.mediaType }); }} onOpenSettings={(entry) => setSettingsFor(entry)} />
          </div>
        ) : <UnseenTile title={row.title} />}
      />
      {showAddEntryModal && activeList ? <AddSavedEntryModal title={`Add to ${activeList.name}`} items={addableSavedItems} onClose={() => setShowAddEntryModal(false)} onAdd={(item) => addEntryToListTop(activeList.id, item.id, item.id.startsWith('tmdb-tv-') ? 'tv' : 'movie')} /> : null}
      {settingsFor ? <UniversalEditModal target={{ id: settingsFor.id, tmdbId: settingsFor.tmdbId ?? (parseInt(settingsFor.id.replace(/\D/g, ''), 10) || 0), title: settingsFor.title, posterPath: settingsFor.posterPath, mediaType: settingsFor.id.startsWith('tmdb-tv-') ? 'tv' : 'movie', subtitle: settingsFor.releaseDate ? String(settingsFor.releaseDate.slice(0, 4)) : undefined, releaseDate: settingsFor.releaseDate, runtimeMinutes: settingsFor.runtimeMinutes, totalEpisodes: settingsFor.totalEpisodes, existingClassKey: settingsFor.classKey } as UniversalEditTarget} initialWatches={settingsFor.watchRecords} currentClassKey={settingsFor.classKey} currentClassLabel={settingsFor.id.startsWith('tmdb-tv-') ? getTvClassLabel(settingsFor.classKey) : getMovieClassLabel(settingsFor.classKey)} rankedClasses={[]} isWatchlistItem={watchlist.isInWatchlist(settingsFor.id)} onAddToWatchlist={() => { const isTv = settingsFor.id.startsWith('tmdb-tv-'); watchlist.addToWatchlist({ id: settingsFor.id, title: settingsFor.title, posterPath: settingsFor.posterPath, releaseDate: settingsFor.releaseDate }, isTv ? 'tv' : 'movies'); }} onRemoveFromWatchlist={() => watchlist.removeFromWatchlist(settingsFor.id)} onGoToWatchlist={() => navigate('/watchlist', { state: { scrollToId: settingsFor.id } })} availableTags={getEditableListsForMediaType(settingsFor.id.startsWith('tmdb-tv-') ? 'tv' : 'movie').map((list) => ({ listId: list.id, label: list.name, color: list.color, selected: getSelectedListIdsForEntry(settingsFor.id).includes(list.id), href: `/lists/${list.id}` }))} collectionTags={(collectionIdsByEntryId.get(settingsFor.id) ?? []).map((id) => ({ id, label: globalCollections.find((item) => item.id === id)?.name ?? id, color: globalCollections.find((item) => item.id === id)?.color, href: `/lists/collection/${id}` }))} isSaving={false} onClose={() => setSettingsFor(null)} onSave={async (params) => { const watches: WatchRecord[] = params.watches.map((w) => { let type: WatchRecord['type'] = 'DATE'; if (w.watchType === 'DATE_RANGE') type = 'RANGE'; else if (w.watchType === 'LONG_AGO') type = w.watchStatus === 'DNF' ? 'DNF_LONG_AGO' : 'LONG_AGO'; if (w.watchStatus === 'WATCHING' && w.watchType !== 'LONG_AGO') type = 'CURRENT'; else if (w.watchStatus === 'DNF' && w.watchType !== 'LONG_AGO') type = 'DNF'; return { id: w.id, type, year: w.year, month: w.month, day: w.day, endYear: w.endYear, endMonth: w.endMonth, endDay: w.endDay, dnfPercent: w.watchPercent < 100 ? w.watchPercent : undefined }; }); const isTv = settingsFor.id.startsWith('tmdb-tv-'); if (isTv && !getShowById(settingsFor.id)) { addShowFromSearch({ id: settingsFor.id, title: settingsFor.title, subtitle: 'Saved', classKey: 'UNRANKED', cache: { tmdbId: settingsFor.tmdbId ?? (parseInt(settingsFor.id.replace(/\D/g, ''), 10) || 0), title: settingsFor.title, posterPath: settingsFor.posterPath, releaseDate: settingsFor.releaseDate, genres: [], cast: [], creators: [], seasons: [] } }); } if (!isTv && !getMovieById(settingsFor.id)) { addMovieFromSearch({ id: settingsFor.id, title: settingsFor.title, subtitle: 'Saved', classKey: 'UNRANKED', posterPath: settingsFor.posterPath }); } if (isTv) updateShowWatchRecords(settingsFor.id, watches); else updateMovieWatchRecords(settingsFor.id, watches); if (params.listMemberships?.length) setEntryListMembership(settingsFor.id, isTv ? 'tv' : 'movie', params.listMemberships); setSettingsFor(null); }} onTagToggle={(listId, selected) => { if (!settingsFor) return; setEntryListMembership(settingsFor.id, settingsFor.id.startsWith('tmdb-tv-') ? 'tv' : 'movie', [{ listId, selected }]); }} /> : null}
      {infoModalTarget ? <InfoModal isOpen onClose={() => setInfoModalTarget(null)} tmdbId={infoModalTarget.tmdbId} mediaType={infoModalTarget.mediaType} title={infoModalTarget.title} posterPath={infoModalTarget.posterPath} releaseDate={infoModalTarget.releaseDate} collectionTags={infoModalTarget.mediaType === 'movie' ? (() => { const entryId = infoModalTarget.entryId || `tmdb-movie-${infoModalTarget.tmdbId}`; return (collectionIdsByEntryId.get(entryId) ?? []).map((id) => ({ id, label: globalCollections.find((item) => item.id === id)?.name ?? id, color: globalCollections.find((item) => item.id === id)?.color })); })() : []} onEditWatches={() => { const target = detailItems.find((row) => row.id === `tmdb-${infoModalTarget.mediaType}-${infoModalTarget.tmdbId}`)?.item; if (target) { setInfoModalTarget(null); setSettingsFor(target); } }} /> : null}
      {showRenameModal ? (
        <RenameEntityModal
          title={isCollection ? (canEditNameAndColor ? 'Edit Collection' : 'Rename Collection') : (canEditNameAndColor ? 'Edit List' : 'Rename List')}
          initialName={title}
          initialColor={isCollection ? activeCollection?.color : activeList?.color}
          allowColorEdit={canEditNameAndColor}
          onClose={() => setShowRenameModal(false)}
          onSave={async ({ name, color }) => {
            if (isCollection) {
              if (!activeCollection || !canEditCollections) return;
              const next = { ...activeCollection, name, color: canEditNameAndColor ? color : activeCollection.color, updatedAt: new Date().toISOString() };
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
