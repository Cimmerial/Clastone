import { useState, useEffect, useMemo } from 'react';
import { ArrowUp, ArrowDown, X, ChevronLeft } from 'lucide-react';
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

  const isRankedItem = currentClassKey && currentClassKey !== 'UNRANKED';
  const hasNeverBeenRanked = !currentClassKey || currentClassKey === 'UNRANKED';

  const rankedPickable = useMemo(
    () => rankedClasses.filter((c) => c.key !== 'UNRANKED'),
    [rankedClasses]
  );

  // Lock body scroll when modal is open
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig || 'unset'; };
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
          <button type="button" className="prm-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
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
    </div>
  );
}
