import { useState } from 'react';
import { X, CheckSquare, Square, RotateCcw } from 'lucide-react';
import './GenreEditModal.css';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  selectedGenres: string[];
  onGenresChange: (genres: string[]) => void;
};

// Comprehensive genre pool from FilterModal
const ALL_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 
  'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 
  'Romance', 'Science Fiction', 'TV Movie', 'Thriller', 'War', 'Western',
  'Kids', 'News', 'Reality', 'Sci-Fi & Fantasy', 'Soap', 'Talk', 'War & Politics'
];

export function GenreEditModal({ isOpen, onClose, selectedGenres, onGenresChange }: Props) {
  const [localSelected, setLocalSelected] = useState<string[]>(selectedGenres);

  const toggleGenre = (genre: string) => {
    setLocalSelected(prev => 
      prev.includes(genre) 
        ? prev.filter(g => g !== genre)
        : [...prev, genre]
    );
  };

  const selectAll = () => {
    setLocalSelected(ALL_GENRES);
  };

  const deselectAll = () => {
    setLocalSelected([]);
  };

  const disableFilter = () => {
    setLocalSelected([]);
    onGenresChange([]);
    onClose();
  };

  const handleApply = () => {
    onGenresChange(localSelected);
    onClose();
  };

  const handleCancel = () => {
    setLocalSelected(selectedGenres); // Reset to original
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="genre-edit-modal-overlay" onClick={handleCancel}>
      <div className="genre-edit-modal" onClick={e => e.stopPropagation()}>
        <header className="genre-edit-header">
          <div className="genre-edit-header-left">
            <h2>Edit Genres</h2>
            <span className="genre-edit-count">
              {localSelected.length} of {ALL_GENRES.length} selected
            </span>
          </div>
          <button className="genre-edit-close-btn" onClick={handleCancel}>
            <X size={24} />
          </button>
        </header>

        <div className="genre-edit-controls">
          <button 
            type="button" 
            className="genre-edit-control-btn"
            onClick={selectAll}
          >
            <CheckSquare size={16} />
            Select All
          </button>
          <button 
            type="button" 
            className="genre-edit-control-btn"
            onClick={deselectAll}
          >
            <Square size={16} />
            Deselect All
          </button>
          <button 
            type="button" 
            className="genre-edit-control-btn genre-edit-disable-btn"
            onClick={disableFilter}
          >
            <RotateCcw size={16} />
            Disable Filter
          </button>
        </div>

        <div className="genre-edit-content">
          <div className="genre-grid">
            {ALL_GENRES.map(genre => (
              <button
                key={genre}
                className={`genre-chip ${localSelected.includes(genre) ? 'selected' : ''}`}
                onClick={() => toggleGenre(genre)}
              >
                {localSelected.includes(genre) ? (
                  <CheckSquare size={16} className="genre-chip-icon" />
                ) : (
                  <Square size={16} className="genre-chip-icon" />
                )}
                {genre}
              </button>
            ))}
          </div>
        </div>

        <footer className="genre-edit-footer">
          <button 
            type="button" 
            className="genre-edit-cancel-btn"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="genre-edit-apply-btn"
            onClick={handleApply}
          >
            Apply ({localSelected.length} selected)
          </button>
        </footer>
      </div>
    </div>
  );
}
