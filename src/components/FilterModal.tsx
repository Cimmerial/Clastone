import { useState, useMemo, useEffect } from 'react';
import { Filter, X, Search, RotateCcw } from 'lucide-react';
import { useFilterStore, FilterState } from '../state/filterStore';
import { MovieShowItem, WatchRecord } from './EntryRowMovieShow';
import { tmdbSearchMulti, tmdbImagePath } from '../lib/tmdb';
import './FilterModal.css';
import { useMobileViewMode } from '../hooks/useMobileViewMode';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    items: MovieShowItem[];
    type: 'movies' | 'shows';
};

export function FilterModal({ isOpen, onClose, items, type }: Props) {
    const { isMobile } = useMobileViewMode();
    const { movieFilters, showFilters, setMovieFilters, setShowFilters, resetMovieFilters, resetShowFilters } = useFilterStore();

    const currentFilters = type === 'movies' ? movieFilters : showFilters;
    const setFilters = type === 'movies' ? setMovieFilters : setShowFilters;
    const resetFilters = type === 'movies' ? resetMovieFilters : resetShowFilters;

    const [actorSearch, setActorSearch] = useState('');
    const [actorResults, setActorResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Lock body scroll when modal is open (only on desktop)
    useEffect(() => {
        if (!isOpen || isMobile) return; // Don't lock scroll on mobile or when closed
        
        const orig = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = orig || 'unset'; };
    }, [isOpen, isMobile]);

    // Derived data for wordcloud and timeline
    const { allGenres, dateRange } = useMemo(() => {
        // Comprehensive list of all possible genres
        const allPossibleGenres = [
            'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 
            'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 
            'Romance', 'Science Fiction', 'TV Movie', 'Thriller', 'War', 'Western',
            'Kids', 'News', 'Reality', 'Sci-Fi & Fantasy', 'Soap', 'Talk', 'War & Politics'
        ];

        const genresMap: Record<string, number> = {};
        let minYear = Infinity;
        let maxYear = -Infinity;

        // Count genres from items
        items.forEach(item => {
            (item.genres || []).forEach(g => {
                genresMap[g] = (genresMap[g] || 0) + 1;
            });

            // Watch Dates for timeline
            (item.watchRecords || []).forEach(r => {
                const year = r.year;
                if (year && year > 0) {
                    minYear = Math.min(minYear, year);
                    maxYear = Math.max(maxYear, year);
                }
            });
        });

        // Only show genres that have at least 1 entry
        const allGenresList = allPossibleGenres
            .map(name => ({
                name,
                count: genresMap[name] || 0
            }))
            .filter(g => g.count > 0) // Only show genres with items
            .sort((a, b) => b.count - a.count); // Sort by count, highest first

        return {
            allGenres: allGenresList,
            dateRange: minYear === Infinity ? null : [minYear, maxYear] as [number, number]
        };
    }, [items]);

    useEffect(() => {
        if (actorSearch.length < 2) {
            setActorResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await tmdbSearchMulti(actorSearch);
                setActorResults(results.filter(r => r.media_type === 'person').slice(0, 5));
            } catch (err) {
                console.error('Actor search failed', err);
            } finally {
                setIsSearching(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [actorSearch]);

    if (!isOpen) return null;

    const toggleGenre = (genre: string) => {
        const newGenres = currentFilters.genres.includes(genre)
            ? currentFilters.genres.filter(g => g !== genre)
            : [...currentFilters.genres, genre];
        setFilters({ ...currentFilters, genres: newGenres });
    };

    const addActor = (actor: any) => {
        if (currentFilters.actorIds.includes(actor.id)) return;
        setFilters({
            ...currentFilters,
            actorIds: [...currentFilters.actorIds, actor.id],
            actorNames: { ...currentFilters.actorNames, [actor.id]: actor.title }
        });
        setActorSearch('');
        setActorResults([]);
    };

    const removeActor = (id: number) => {
        const newIds = currentFilters.actorIds.filter(aid => aid !== id);
        const newNames = { ...currentFilters.actorNames };
        delete newNames[id];
        setFilters({ ...currentFilters, actorIds: newIds, actorNames: newNames });
    };

    const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>, index: 0 | 1) => {
        const val = parseInt(e.target.value, 10);
        const newRange = [...(currentFilters.watchTimeRange || dateRange || [0, 0])] as [number, number];
        newRange[index] = val;
        // Ensure order
        if (index === 0 && newRange[0] > newRange[1]) newRange[1] = newRange[0];
        if (index === 1 && newRange[1] < newRange[0]) newRange[0] = newRange[1];
        setFilters({ ...currentFilters, watchTimeRange: newRange });
    };

    return (
        <div className="filter-modal-overlay" onClick={onClose}>
            <div className="filter-modal" onClick={e => e.stopPropagation()}>
                <header className="filter-header">
                    <div className="filter-header-left">
                        <Filter size={20} />
                        <h2>Filter {type === 'movies' ? 'Movies' : 'Shows'}</h2>
                    </div>
                    <button className="filter-close-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </header>

                <div className="filter-content">
                    {/* Genres Wordcloud */}
                    <section className="filter-section">
                        <h3>Genres</h3>
                        <div className="genre-wordcloud">
                            {allGenres.map(g => (
                                <button
                                    key={g.name}
                                    className={`genre-tag ${currentFilters.genres.includes(g.name) ? 'active' : ''}`}
                                    onClick={() => toggleGenre(g.name)}
                                >
                                    {g.name} <span className="genre-count">({g.count})</span>
                                </button>
                            ))}
                            {allGenres.length === 0 && <p className="filter-empty">No genre data available. Refresh items to fetch.</p>}
                        </div>
                    </section>

                    {/* Watchtime Timeline */}
                    <section className="filter-section">
                        <h3>Watch Timeline</h3>
                        {dateRange ? (
                            <div className="timeline-container">
                                <div className="timeline-inputs">
                                    <div className="timeline-input-group">
                                        <label>From: {currentFilters.watchTimeRange?.[0] || dateRange[0]}</label>
                                        <input
                                            type="range"
                                            min={dateRange[0]}
                                            max={dateRange[1]}
                                            value={currentFilters.watchTimeRange?.[0] || dateRange[0]}
                                            onChange={e => handleRangeChange(e, 0)}
                                        />
                                    </div>
                                    <div className="timeline-input-group">
                                        <label>To: {currentFilters.watchTimeRange?.[1] || dateRange[1]}</label>
                                        <input
                                            type="range"
                                            min={dateRange[0]}
                                            max={dateRange[1]}
                                            value={currentFilters.watchTimeRange?.[1] || dateRange[1]}
                                            onChange={e => handleRangeChange(e, 1)}
                                        />
                                    </div>
                                </div>
                                <label className="filter-checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={currentFilters.includeLongAgo}
                                        onChange={e => setFilters({ ...currentFilters, includeLongAgo: e.target.checked })}
                                    />
                                    <span>Include "Long Ago" watches</span>
                                </label>
                            </div>
                        ) : (
                            <p className="filter-empty">No watch dates recorded yet.</p>
                        )}
                    </section>

                    {/* Actor Search */}
                    <section className="filter-section">
                        <h3>Actors</h3>
                        <div className="actor-search-container">
                            <div className="actor-search-input-wrapper">
                                <Search size={16} className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search actors..."
                                    value={actorSearch}
                                    onChange={e => setActorSearch(e.target.value)}
                                />
                                {isSearching && <div className="search-spinner" />}
                            </div>
                            {actorResults.length > 0 && (
                                <div className="actor-results">
                                    {actorResults.map(a => (
                                        <div key={a.id} className="actor-result-item" onClick={() => addActor(a)}>
                                            {a.profile_path ? (
                                                <img src={tmdbImagePath(a.profile_path, 'w45')!} alt="" />
                                            ) : (
                                                <div className="actor-placeholder">{a.title[0]}</div>
                                            )}
                                            <span>{a.title}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="selected-actors">
                            {currentFilters.actorIds.map(id => (
                                <div key={id} className="selected-actor-tag">
                                    {currentFilters.actorNames[id]}
                                    <button onClick={() => removeActor(id)}>
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <footer className="filter-footer">
                    <div className="filter-footer-left">
                        <div className="shown-entries">
                            {items.filter(item => {
                                // Apply same filter logic as in pages
                                if (currentFilters.genres.length > 0) {
                                    const itemGenres = item.genres || [];
                                    if (!currentFilters.genres.some(g => itemGenres.includes(g))) return false;
                                }
                                if (currentFilters.actorIds.length > 0) {
                                    const itemActorIds = (item.cast || []).map(c => c.id);
                                    if (!currentFilters.actorIds.every(id => itemActorIds.includes(id))) return false;
                                }
                                if (currentFilters.watchTimeRange) {
                                    const records = item.watchRecords || [];
                                    const hasInRange = records.some(r => {
                                        const t = r.type ?? 'DATE';
                                        if (t === 'LONG_AGO' || t === 'UNKNOWN' || t === 'DNF_LONG_AGO') {
                                            return currentFilters.includeLongAgo;
                                        }
                                        const year = r.year;
                                        return year && year >= currentFilters.watchTimeRange![0] && year <= currentFilters.watchTimeRange![1];
                                    });
                                    if (!hasInRange && records.length > 0) return false;
                                }
                                return true;
                            }).length} entries shown
                        </div>
                    </div>
                    <div className="filter-footer-right">
                        <button className="filter-reset-btn" onClick={resetFilters}>
                            <RotateCcw size={16} />
                            Reset Filters
                        </button>
                        <button className="filter-apply-btn" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
