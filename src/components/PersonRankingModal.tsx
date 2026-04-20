import { useState, useEffect, useMemo } from 'react';
import { ArrowUp, ArrowDown, X, ChevronLeft, Info, Image as ImageIcon } from 'lucide-react';
import { lockBodyScroll, unlockBodyScroll } from '../lib/bodyScrollLock';
import { PersonInfoModal } from './PersonInfoModal';
import { tmdbImagePath, tmdbPersonProfiles } from '../lib/tmdb';
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import './PersonRankingModal.css';

/* ─── Types ──────────────────────────────────────────── */

export type PersonRankingTarget = {
  id: string;
  tmdbId?: number;
  name: string;
  profilePath?: string;
  mediaType: 'actor' | 'director';
  subtitle?: string;
  // For existing entries
  existingClassKey?: string;
};

export type PersonRankingSaveParams = {
  classKey?: string;
  position?: 'top' | 'middle' | 'bottom';
};

type Props = {
  target: PersonRankingTarget;
  rankedClasses: { key: string; label: string; tagline?: string; isRanked?: boolean }[];
  currentClassKey?: string;
  currentClassLabel?: string;
  onSave: (params: PersonRankingSaveParams, goToList: boolean) => void | Promise<void>;
  onClose: () => void;
  onRemoveEntry?: (itemId: string) => void;
  onGoPickTemplate?: () => void;
  isSaving: boolean;
};

/* ─── Main Modal ─────────────────────────────────────── */

export function PersonRankingModal({
  target,
  rankedClasses,
  currentClassKey,
  currentClassLabel,
  onSave,
  onClose,
  onRemoveEntry,
  onGoPickTemplate,
  isSaving,
}: Props) {
  const [selectedClassKey, setSelectedClassKey] = useState<string>('');
  const [selectedPosition, setSelectedPosition] = useState<'top' | 'middle' | 'bottom'>('top');
  const [showClassOverride, setShowClassOverride] = useState(false);
  const [removeClickCount, setRemoveClickCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);
  const [imagePickerLoading, setImagePickerLoading] = useState(false);
  const [imagePickerSaving, setImagePickerSaving] = useState(false);
  const [imagePickerError, setImagePickerError] = useState<string | null>(null);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [selectedImagePath, setSelectedImagePath] = useState<string | null>(target.profilePath ?? null);

  const isRankedItem = currentClassKey && currentClassKey !== 'UNRANKED';
  const hasNeverBeenRanked = !currentClassKey || currentClassKey === 'UNRANKED';

  const rankedPickable = useMemo(
    () => rankedClasses.filter((c) => c.key !== 'UNRANKED'),
    [rankedClasses]
  );
  const { getPersonById, updatePersonCache, forceSync: forceSyncPeople } = usePeopleStore();
  const { getDirectorById, updateDirectorCache, forceSync: forceSyncDirectors } = useDirectorsStore();

  useEffect(() => {
    setSelectedImagePath(target.profilePath ?? null);
  }, [target.profilePath, target.id]);

  // Lock body scroll when modal is open
  useEffect(() => {
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, []);

  // Reset remove click count after 3 seconds
  useEffect(() => {
    if (removeClickCount > 0) {
      const t = setTimeout(() => setRemoveClickCount(0), 3000);
      return () => clearTimeout(t);
    }
  }, [removeClickCount]);

  const handleRemoveClick = () => {
    if (!onRemoveEntry) return;
    if (removeClickCount === 1) {
      onRemoveEntry(target.id);
      onClose();
    } else {
      setRemoveClickCount(1);
    }
  };

  const validateAndSave = async (goToList: boolean) => {
    setError(null);

    const rankPickRequired =
      rankedPickable.length > 0 && (showClassOverride || hasNeverBeenRanked);
    if (rankPickRequired && (!selectedClassKey || !rankedPickable.some((c) => c.key === selectedClassKey))) {
      setError('Please select a class.');
      return;
    }

    if (showClassOverride && rankedPickable.length === 0) {
      setError('No ranked tiers yet. Pick a template on the Actors or Directors page, or keep your current rank.');
      return;
    }

    const effectiveClassKey = hasNeverBeenRanked
      ? (rankedPickable.length === 0 ? 'UNRANKED' : selectedClassKey)
      : showClassOverride
        ? selectedClassKey
        : undefined;

    await onSave(
      {
        classKey: effectiveClassKey,
        position: effectiveClassKey ? selectedPosition : undefined,
      },
      goToList,
    );
    onClose();
  };

  const openImagePicker = async () => {
    if (!target.tmdbId) return;
    setShowImagePickerModal(true);
    setImagePickerLoading(true);
    setImagePickerError(null);
    try {
      const profiles = await tmdbPersonProfiles(target.tmdbId);
      const current = target.profilePath;
      const withCurrent = current && !profiles.includes(current) ? [current, ...profiles] : profiles;
      setImagePaths(withCurrent);
      if (withCurrent.length === 0) {
        setImagePickerError('No alternate images found on TMDB for this person.');
      }
    } catch {
      setImagePickerError('Could not load alternate images right now.');
    } finally {
      setImagePickerLoading(false);
    }
  };

  const saveSelectedImage = async () => {
    if (!selectedImagePath || !target.tmdbId) {
      setImagePickerError('Select an image before saving.');
      return;
    }
    setImagePickerSaving(true);
    setImagePickerError(null);
    try {
      const personId = `tmdb-person-${target.tmdbId}`;
      let didUpdate = false;
      if (target.mediaType === 'actor' && getPersonById(personId)) {
        updatePersonCache(personId, { profilePath: selectedImagePath });
        didUpdate = true;
      }
      if (target.mediaType === 'director' && getDirectorById(personId)) {
        updateDirectorCache(personId, { profilePath: selectedImagePath });
        didUpdate = true;
      }
      if (didUpdate) {
        await Promise.all([forceSyncPeople(), forceSyncDirectors()]);
      }
      setShowImagePickerModal(false);
    } catch {
      setImagePickerError('Could not save selected image.');
    } finally {
      setImagePickerSaving(false);
    }
  };

  const PlacementButtons = ({ classKey }: { classKey: string }) => (
    <div className="prm-placement-btns">
      {(['top', 'middle', 'bottom'] as const).map(pos => (
        <button
          key={pos}
          type="button"
          className={`prm-place-btn${selectedClassKey === classKey && selectedPosition === pos ? ' prm-place-btn--on' : ''}`}
          onClick={() => { setSelectedClassKey(classKey); setSelectedPosition(pos); }}
          title={pos === 'top' ? 'Add to top' : pos === 'bottom' ? 'Add to bottom' : 'Add to middle'}
        >
          {pos === 'top' ? <ArrowUp size={10} /> : pos === 'bottom' ? <ArrowDown size={10} /> : '•'}
        </button>
      ))}
    </div>
  );

  const ClassList = () => (
    <div className="prm-class-list">
      {rankedPickable.length === 0 ? (
        <div className="prm-class-empty">
          <p className="prm-class-empty-msg">
            No ranked tiers are set up yet. Go pick a template on the main list, or add as Unranked below.
          </p>
          {onGoPickTemplate ? (
            <button type="button" className="prm-btn prm-btn--secondary" onClick={() => onGoPickTemplate()}>
              Go to pick template
            </button>
          ) : null}
        </div>
      ) : (
        rankedPickable.map((c) => (
        <div
          key={c.key}
          className={`prm-class-row${selectedClassKey === c.key ? ' prm-class-row--on' : ''}`}
          onClick={() => setSelectedClassKey(c.key)}
        >
          <div className="prm-class-info">
            <span className="prm-class-name">{c.label}</span>
            {c.tagline && <span className="prm-class-tagline">{c.tagline}</span>}
          </div>
          <PlacementButtons classKey={c.key} />
        </div>
        ))
      )}
    </div>
  );

  return (
    <div className="prm-backdrop" onClick={onClose}>
      <div className="prm-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="prm-header">
          <div className="prm-header-info">
            <h2 className="prm-title">{target.name}</h2>
            {target.subtitle && <span className="prm-subtitle">{target.subtitle}</span>}
            <span className="prm-type-badge">
              {target.mediaType === 'actor' ? 'Actor' : 'Director'}
            </span>
          </div>
          <div className="prm-header-actions">
            {target.tmdbId ? (
              <button
                type="button"
                className="prm-info-btn"
                onClick={() => setShowInfoModal(true)}
                aria-label={`View info for ${target.name}`}
                title={`View info for ${target.name}`}
              >
                <Info size={16} />
              </button>
            ) : null}
            {target.tmdbId ? (
              <button
                type="button"
                className="prm-image-btn"
                onClick={() => void openImagePicker()}
                aria-label={target.mediaType === 'actor' ? 'Set Actor Image' : 'Set Director Image'}
                title={target.mediaType === 'actor' ? 'Set Actor Image' : 'Set Director Image'}
              >
                <ImageIcon size={16} />
              </button>
            ) : null}
            <button type="button" className="prm-close-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="prm-body">
          {/* Current Ranking */}
          {isRankedItem && !showClassOverride ? (
            <div className="prm-current-rank">
              <div className="prm-current-rank-info">
                <span className="prm-current-rank-label">Currently ranked in</span>
                <span className="prm-current-rank-value">{currentClassLabel}</span>
              </div>
              <button
                type="button"
                className="prm-override-btn"
                onClick={() => setShowClassOverride(true)}
              >
                Change Rank
              </button>
            </div>
          ) : (
            <div className="prm-rank-selector">
              {isRankedItem && showClassOverride && (
                <button
                  type="button"
                  className="prm-cancel-override"
                  onClick={() => setShowClassOverride(false)}
                >
                  <ChevronLeft size={16} /> Keep current rank
                </button>
              )}
              
              <div className="prm-section-header">
                <h3 className="prm-section-title">
                  {hasNeverBeenRanked ? 'Select a class' : 'Change class ranking'}
                </h3>
                <p className="prm-section-subtitle">Click a class and choose placement</p>
              </div>
              
              <ClassList />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="prm-footer">
          {error && <div className="prm-error">{error}</div>}
          <div className="prm-footer-inner">
            {onRemoveEntry && (
              <button
                type="button"
                className={`prm-delete-btn${removeClickCount === 1 ? ' prm-delete-btn--confirm' : ''}`}
                onClick={handleRemoveClick}
              >
                {removeClickCount === 1 ? 'Click again to confirm' : 'Remove Entry'}
              </button>
            )}
            <div className="prm-save-btns">
              <button
                type="button"
                className="prm-btn prm-btn--secondary"
                onClick={() => void validateAndSave(false)}
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save and Exit'}
              </button>
              <button
                type="button"
                className="prm-btn prm-btn--primary"
                onClick={() => void validateAndSave(true)}
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save and Go To'}
              </button>
              {hasNeverBeenRanked && (
                <button
                  type="button"
                  className="prm-btn prm-btn--ghost"
                  onClick={() => {
                    onSave({ classKey: 'UNRANKED' }, false);
                    onClose();
                  }}
                  disabled={isSaving}
                >
                  Add as Unranked & Exit
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {showInfoModal && target.tmdbId ? (
        <PersonInfoModal
          isOpen={showInfoModal}
          onClose={() => setShowInfoModal(false)}
          tmdbId={target.tmdbId}
          name={target.name}
          profilePath={target.profilePath}
        />
      ) : null}
      {showImagePickerModal ? (
        <div className="prm-image-picker-backdrop" onClick={() => setShowImagePickerModal(false)}>
          <div className="prm-image-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prm-image-picker-header">
              <h3 className="prm-image-picker-title">{target.mediaType === 'actor' ? 'Set Actor Image' : 'Set Director Image'}</h3>
              <button type="button" className="prm-close-btn" onClick={() => setShowImagePickerModal(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="prm-image-picker-body">
              <p className="prm-image-picker-label">Current image</p>
              <div className="prm-image-picker-current">
                {target.profilePath ? (
                  <img src={tmdbImagePath(target.profilePath, 'w185') ?? ''} alt={target.name} />
                ) : (
                  <span className="prm-image-picker-empty">{target.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              {imagePickerError ? <div className="prm-error">{imagePickerError}</div> : null}
              {imagePickerLoading ? (
                <p className="prm-image-picker-loading">Loading images...</p>
              ) : (
                <div className="prm-image-picker-grid">
                  {imagePaths.map((path) => (
                    <button
                      key={path}
                      type="button"
                      className={`prm-image-picker-option${selectedImagePath === path ? ' prm-image-picker-option--selected' : ''}`}
                      onClick={() => setSelectedImagePath(path)}
                    >
                      <img src={tmdbImagePath(path, 'w185') ?? ''} alt={target.name} loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="prm-image-picker-footer">
              <button type="button" className="prm-btn prm-btn--secondary" onClick={() => setShowImagePickerModal(false)} disabled={imagePickerSaving}>
                Cancel
              </button>
              <button type="button" className="prm-btn prm-btn--primary" onClick={() => void saveSelectedImage()} disabled={imagePickerSaving || imagePickerLoading || !selectedImagePath}>
                {imagePickerSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
