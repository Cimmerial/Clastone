import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import { tmdbImagePath } from '../lib/tmdb';
import type {
  GlobalSuperlativeDefinition,
  ProfileSuperlativeEntry,
  ProfileSuperlativeSlot,
} from '../lib/firestoreSuperlatives';
import type { SuperlativeEntryCandidate } from '../lib/profileSuperlatives';

const MAX_SLOTS = 8;

type SearchResults = {
  saved: SuperlativeEntryCandidate[];
  tmdb: SuperlativeEntryCandidate[];
};

type Props = {
  isOwnProfile: boolean;
  slots: ProfileSuperlativeSlot[];
  definitions: GlobalSuperlativeDefinition[];
  canManageCatalog?: boolean;
  onSaveSlots?: (nextSlots: ProfileSuperlativeSlot[]) => Promise<void>;
  onCreateDefinition?: (label: string) => Promise<void>;
  onDeleteDefinition?: (superlativeId: string) => Promise<void>;
  onSearchCandidates?: (queryText: string, signal?: AbortSignal) => Promise<SearchResults>;
  onEntryClick?: (entry: ProfileSuperlativeEntry) => void;
};

type ModalState = {
  mode: 'add' | 'edit';
  slotIndex: number;
};

function makeSlotId(): string {
  return `slot_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function SortableSlotCard({
  slot,
  label,
  onClick,
}: {
  slot: ProfileSuperlativeSlot;
  label: string;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.slotId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`profile-superlative-card profile-recent-tile${isDragging ? ' profile-superlative-card--dragging' : ''}`}
    >
      <button type="button" className="profile-superlative-drag-handle" aria-label="Reorder superlative" {...attributes} {...listeners}>
        <GripVertical size={14} />
      </button>
      <button type="button" className="profile-superlative-edit-btn" onClick={onClick} aria-label="Edit superlative slot">
        <Pencil size={14} />
      </button>
      <button type="button" className="profile-superlative-entry-hitbox" onClick={onClick}>
        <div className="profile-recent-tile-poster">
          {slot.entry.posterPath ? (
            <img src={tmdbImagePath(slot.entry.posterPath, 'w300') ?? ''} alt="" loading="lazy" />
          ) : (
            <span>{slot.entry.entryType === 'person' ? '👤' : slot.entry.entryType === 'movie' ? '🎬' : '📺'}</span>
          )}
        </div>
        <div className="profile-superlative-copy">
          <span className="profile-superlative-label">{label}</span>
          <span className="profile-superlative-entry-title">{slot.entry.title}</span>
        </div>
      </button>
    </div>
  );
}

export function ProfileSuperlativesSection({
  isOwnProfile,
  slots,
  definitions,
  canManageCatalog = false,
  onSaveSlots,
  onCreateDefinition,
  onDeleteDefinition,
  onSearchCandidates,
  onEntryClick,
}: Props) {
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults>({ saved: [], tmdb: [] });
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedSuperlativeId, setSelectedSuperlativeId] = useState<string>('');
  const [selectedEntry, setSelectedEntry] = useState<SuperlativeEntryCandidate | null>(null);
  const [createLabel, setCreateLabel] = useState('');
  const [isMutatingCatalog, setIsMutatingCatalog] = useState(false);

  const definitionById = useMemo(() => {
    const map = new Map<string, GlobalSuperlativeDefinition>();
    for (const definition of definitions) map.set(definition.id, definition);
    return map;
  }, [definitions]);

  const activeSlots = useMemo(
    () => slots.filter((slot) => definitionById.has(slot.superlativeId)),
    [slots, definitionById]
  );

  const visibleSlots = isOwnProfile ? slots : activeSlots;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const closeModal = useCallback(() => {
    setModalState(null);
    setSearchQuery('');
    setSearchResults({ saved: [], tmdb: [] });
    setSearchError(null);
    setSelectedEntry(null);
    setSelectedSuperlativeId('');
    setCreateLabel('');
  }, []);

  const openModalForIndex = useCallback((slotIndex: number, mode: 'add' | 'edit') => {
    setModalState({ slotIndex, mode });
  }, []);

  const modalSlot = useMemo(() => {
    if (!modalState) return null;
    return slots[modalState.slotIndex] ?? null;
  }, [modalState, slots]);

  useEffect(() => {
    if (!modalState) return;
    if (modalSlot) {
      setSelectedSuperlativeId(modalSlot.superlativeId);
      setSelectedEntry({
        ...modalSlot.entry,
        key: `${modalSlot.entry.entryType}:${modalSlot.entry.entryId}`,
        source: 'saved',
      });
    } else {
      setSelectedSuperlativeId(definitions[0]?.id ?? '');
      setSelectedEntry(null);
    }
  }, [modalState, modalSlot, definitions]);

  useEffect(() => {
    if (!modalState) return;
    if (!onSearchCandidates) return;

    const controller = new AbortController();
    const run = async () => {
      setIsSearchLoading(true);
      setSearchError(null);
      try {
        const next = await onSearchCandidates(searchQuery, controller.signal);
        if (controller.signal.aborted) return;
        setSearchResults(next);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchError(error instanceof Error ? error.message : 'Search failed.');
      } finally {
        if (!controller.signal.aborted) setIsSearchLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [modalState, searchQuery, onSearchCandidates]);

  const saveSlots = useCallback(
    async (nextSlots: ProfileSuperlativeSlot[]) => {
      if (!onSaveSlots) return;
      setIsSaving(true);
      try {
        await onSaveSlots(nextSlots);
      } finally {
        setIsSaving(false);
      }
    },
    [onSaveSlots]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (!isOwnProfile || !onSaveSlots) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = slots.findIndex((slot) => slot.slotId === String(active.id));
      const newIndex = slots.findIndex((slot) => slot.slotId === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      await saveSlots(arrayMove(slots, oldIndex, newIndex));
    },
    [isOwnProfile, onSaveSlots, saveSlots, slots]
  );

  const handleSaveModal = useCallback(async () => {
    if (!modalState || !onSaveSlots) return;
    if (!selectedSuperlativeId || !selectedEntry) return;

    const nextSlot: ProfileSuperlativeSlot = {
      slotId: modalSlot?.slotId ?? makeSlotId(),
      superlativeId: selectedSuperlativeId,
      entry: {
        entryType: selectedEntry.entryType,
        entryId: selectedEntry.entryId,
        title: selectedEntry.title,
        posterPath: selectedEntry.posterPath,
        releaseDate: selectedEntry.releaseDate,
        subtitle: selectedEntry.subtitle,
        tmdbId: selectedEntry.tmdbId,
      },
      updatedAt: nowIso(),
    };

    let next = slots.slice();
    if (modalSlot) {
      next = next.map((slot, index) => (index === modalState.slotIndex ? nextSlot : slot));
    } else {
      next = [...next, nextSlot];
    }

    await saveSlots(next.slice(0, MAX_SLOTS));
    closeModal();
  }, [modalState, onSaveSlots, selectedSuperlativeId, selectedEntry, modalSlot, slots, saveSlots, closeModal]);

  const handleRemoveSlot = useCallback(async () => {
    if (!modalState || !modalSlot || !onSaveSlots) return;
    const next = slots.filter((_, index) => index !== modalState.slotIndex);
    await saveSlots(next);
    closeModal();
  }, [modalState, modalSlot, onSaveSlots, slots, saveSlots, closeModal]);

  const handleCreateDefinition = useCallback(async () => {
    if (!onCreateDefinition) return;
    const label = createLabel.trim();
    if (!label) return;
    setIsMutatingCatalog(true);
    try {
      await onCreateDefinition(label);
      setCreateLabel('');
    } finally {
      setIsMutatingCatalog(false);
    }
  }, [onCreateDefinition, createLabel]);

  const handleDeleteDefinition = useCallback(async () => {
    if (!onDeleteDefinition || !selectedSuperlativeId) return;
    setIsMutatingCatalog(true);
    try {
      await onDeleteDefinition(selectedSuperlativeId);
      setSelectedSuperlativeId('');
    } finally {
      setIsMutatingCatalog(false);
    }
  }, [onDeleteDefinition, selectedSuperlativeId]);

  if (!isOwnProfile && visibleSlots.length === 0) return null;

  return (
    <>
      <div className={`profile-superlatives profile-card card-surface${isOwnProfile ? '' : ' profile-superlatives--friend'}`}>
        <div className="profile-card-header">
          <h2 className="profile-card-title">Superlatives</h2>
          {isOwnProfile ? (
            <div className="profile-superlatives-actions">
              {slots.length < MAX_SLOTS ? (
                <button
                  type="button"
                  className="profile-superlatives-add-btn"
                  onClick={() => openModalForIndex(slots.length, 'add')}
                >
                  <Plus size={14} />
                  Add
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {visibleSlots.length === 0 ? (
          <p className="profile-muted">No superlatives set yet.</p>
        ) : isOwnProfile ? (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleSlots.map((slot) => slot.slotId)} strategy={rectSortingStrategy}>
              <div className="profile-recent-grid profile-superlative-grid">
                {visibleSlots.map((slot, index) => (
                  <SortableSlotCard
                    key={slot.slotId}
                    slot={slot}
                    label={definitionById.get(slot.superlativeId)?.label ?? 'Missing superlative'}
                    onClick={() => openModalForIndex(index, 'edit')}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="profile-recent-grid profile-superlative-grid">
            {visibleSlots.map((slot) => (
              <button
                key={slot.slotId}
                type="button"
                className="profile-superlative-card profile-recent-tile profile-top-item--clickable"
                onClick={() => onEntryClick?.(slot.entry)}
              >
                <div className="profile-recent-tile-poster">
                  {slot.entry.posterPath ? (
                    <img src={tmdbImagePath(slot.entry.posterPath, 'w300') ?? ''} alt="" loading="lazy" />
                  ) : (
                    <span>{slot.entry.entryType === 'person' ? '👤' : slot.entry.entryType === 'movie' ? '🎬' : '📺'}</span>
                  )}
                </div>
                <div className="profile-superlative-copy">
                  <span className="profile-superlative-label">
                    {definitionById.get(slot.superlativeId)?.label ?? 'Missing superlative'}
                  </span>
                  <span className="profile-superlative-entry-title">{slot.entry.title}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {modalState ? (
        <div className="profile-superlative-modal-backdrop" onClick={closeModal} role="presentation">
          <div className="profile-superlative-modal card-surface" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="profile-superlative-modal-header">
              <h3>{modalState.mode === 'add' ? 'Add superlative slot' : 'Edit superlative slot'}</h3>
              <button type="button" className="profile-superlative-modal-close" onClick={closeModal} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <label className="profile-superlative-field">
              <span>Superlative</span>
              <select
                value={selectedSuperlativeId}
                onChange={(e) => setSelectedSuperlativeId(e.target.value)}
                className="profile-superlative-select"
              >
                <option value="">Select one...</option>
                {definitions.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {definition.label}
                  </option>
                ))}
              </select>
            </label>

            {canManageCatalog ? (
              <div className="profile-superlative-catalog-tools">
                <div className="profile-superlative-catalog-row">
                  <input
                    value={createLabel}
                    onChange={(e) => setCreateLabel(e.target.value)}
                    placeholder="Create superlative"
                    className="profile-superlative-input"
                  />
                  <button type="button" onClick={handleCreateDefinition} disabled={isMutatingCatalog || !createLabel.trim()}>
                    Add
                  </button>
                </div>
                <button
                  type="button"
                  className="profile-superlative-danger-btn"
                  onClick={handleDeleteDefinition}
                  disabled={isMutatingCatalog || !selectedSuperlativeId}
                >
                  <Trash2 size={13} />
                  Delete selected superlative
                </button>
              </div>
            ) : null}

            <label className="profile-superlative-field">
              <span>Entry</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search saved first, then TMDB..."
                className="profile-superlative-input"
              />
            </label>

            {isSearchLoading ? <p className="profile-muted">Searching...</p> : null}
            {searchError ? <p className="profile-muted">{searchError}</p> : null}

            <div className="profile-superlative-search-results">
              {searchResults.saved.length > 0 ? (
                <div className="profile-superlative-search-group">
                  <h4>Saved</h4>
                  {searchResults.saved.map((candidate) => (
                    <button
                      type="button"
                      key={candidate.key}
                      className={`profile-superlative-search-item${selectedEntry?.key === candidate.key ? ' active' : ''}`}
                      onClick={() => setSelectedEntry(candidate)}
                    >
                      <span>{candidate.title}</span>
                      <small>{candidate.subtitle ?? candidate.entryType}</small>
                    </button>
                  ))}
                </div>
              ) : null}

              {searchResults.tmdb.length > 0 ? (
                <div className="profile-superlative-search-group">
                  <h4>TMDB</h4>
                  {searchResults.tmdb.map((candidate) => (
                    <button
                      type="button"
                      key={candidate.key}
                      className={`profile-superlative-search-item${selectedEntry?.key === candidate.key ? ' active' : ''}`}
                      onClick={() => setSelectedEntry(candidate)}
                    >
                      <span>{candidate.title}</span>
                      <small>{candidate.subtitle ?? candidate.entryType}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="profile-superlative-modal-actions">
              {modalSlot ? (
                <button type="button" className="profile-superlative-danger-btn" onClick={handleRemoveSlot} disabled={isSaving}>
                  <Trash2 size={13} />
                  Remove slot
                </button>
              ) : <span />}
              <button
                type="button"
                className="profile-superlatives-add-btn"
                onClick={handleSaveModal}
                disabled={isSaving || !selectedSuperlativeId || !selectedEntry}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
