import { useState, useMemo, useEffect } from 'react';
import { Filter, X, Search, RotateCcw } from 'lucide-react';
import { useFilterStore } from '../state/filterStore';
import { MovieShowItem } from './EntryRowMovieShow';
import { tmdbSearchMulti, tmdbImagePath } from '../lib/tmdb';
import './FilterModal.css';
import { useMobileViewMode } from '../hooks/useMobileViewMode';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    items: MovieShowItem[];
    type: 'movies' | 'shows';
    availableLists: { id: string; name: string; color?: string }[];
    availableCollections: { id: string; name: string; color?: string }[];
    listIdsByEntryId: Map<string, string[]>;
    collectionIdsByEntryId: Map<string, string[]>;
};

export function FilterModal({
    isOpen,
    onClose,
    items,
    type,
    availableLists,
    availableCollections,
    listIdsByEntryId,
    collectionIdsByEntryId,
}: Props) {
    const { isMobile } = useMobileViewMode();
    const { movieFilters, showFilters, setMovieFilters, setShowFilters, resetMovieFilters, resetShowFilters } = useFilterStore();

    const currentFilters = type === 'movies' ? movieFilters : showFilters;
    const setFilters = type === 'movies' ? setMovieFilters : setShowFilters;
    const resetFilters = type === 'movies' ? resetMovieFilters : resetShowFilters;

    const [actorSearch, setActorSearch] = useState('');
    const [actorResults, setActorResults] = useState<any[]>([]);
    const [directorSearch, setDirectorSearch] = useState('');
    const [directorResults, setDirectorResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isDirectorSearching, setIsDirectorSearching] = useState(false);

    // Lock body scroll when modal is open (only on desktop)
    useEffect(() => {
        if (!isOpen || isMobile) return; // Don't lock scroll on mobile or when closed
        
        const orig = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = orig || 'unset'; };
    }, [isOpen, isMobile]);

    // Derived data for wordcloud and timeline
    const { allGenres, watchDateRange, releaseDateRange, listCounts, collectionCounts } = useMemo(() => {
        // Comprehensive list of all possible genres
        const allPossibleGenres = [
            'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 
            'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 
            'Romance', 'Science Fiction', 'TV Movie', 'Thriller', 'War', 'Western',
            'Kids', 'News', 'Reality', 'Sci-Fi & Fantasy', 'Soap', 'Talk', 'War & Politics'
        ];

        const genresMap: Record<string, number> = {};
        const listCountMap = new Map<string, number>();
        const collectionCountMap = new Map<string, number>();
        let minWatchYear = Infinity;
        let maxWatchYear = -Infinity;
        let minReleaseYear = Infinity;
        let maxReleaseYear = -Infinity;

        // Count genres from items
        items.forEach(item => {
            (item.genres || []).forEach(g => {
                genresMap[g] = (genresMap[g] || 0) + 1;
            });

            // Watch Dates for timeline
            (item.watchRecords || []).forEach(r => {
                const year = r.year;
                if (year && year > 0) {
                    minWatchYear = Math.min(minWatchYear, year);
                    maxWatchYear = Math.max(maxWatchYear, year);
                }
            });

            const releaseYear = item.releaseDate ? parseInt(item.releaseDate.slice(0, 4), 10) : NaN;
            if (!Number.isNaN(releaseYear)) {
                minReleaseYear = Math.min(minReleaseYear, releaseYear);
                maxReleaseYear = Math.max(maxReleaseYear, releaseYear);
            }

            const entryListIds = listIdsByEntryId.get(item.id) ?? [];
            entryListIds.forEach((id) => listCountMap.set(id, (listCountMap.get(id) || 0) + 1));

            const entryCollectionIds = collectionIdsByEntryId.get(item.id) ?? [];
            entryCollectionIds.forEach((id) => collectionCountMap.set(id, (collectionCountMap.get(id) || 0) + 1));
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
            watchDateRange: minWatchYear === Infinity ? null : [minWatchYear, maxWatchYear] as [number, number],
            releaseDateRange: minReleaseYear === Infinity ? null : [minReleaseYear, maxReleaseYear] as [number, number],
            listCounts: listCountMap,
            collectionCounts: collectionCountMap,
        };
    }, [items, listIdsByEntryId, collectionIdsByEntryId]);

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

    useEffect(() => {
        if (directorSearch.length < 2) {
            setDirectorResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setIsDirectorSearching(true);
            try {
                const results = await tmdbSearchMulti(directorSearch);
                setDirectorResults(results.filter(r => r.media_type === 'person').slice(0, 5));
            } catch (err) {
                console.error('Director/creator search failed', err);
            } finally {
                setIsDirectorSearching(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [directorSearch]);

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

    const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>, index: 0 | 1, key: 'watchTimeRange' | 'releaseYearRange', baseRange: [number, number] | null) => {
        const val = parseInt(e.target.value, 10);
        const newRange = [...(currentFilters[key] || baseRange || [0, 0])] as [number, number];
        newRange[index] = val;
        // Ensure order
        if (index === 0 && newRange[0] > newRange[1]) newRange[1] = newRange[0];
        if (index === 1 && newRange[1] < newRange[0]) newRange[0] = newRange[1];
        setFilters({ ...currentFilters, [key]: newRange });
    };

    const addDirector = (person: any) => {
        if (currentFilters.directorIds.includes(person.id)) return;
        setFilters({
            ...currentFilters,
            directorIds: [...currentFilters.directorIds, person.id],
            directorNames: { ...currentFilters.directorNames, [person.id]: person.title }
        });
        setDirectorSearch('');
        setDirectorResults([]);
    };

    const removeDirector = (id: number) => {
        const newIds = currentFilters.directorIds.filter(pid => pid !== id);
        const newNames = { ...currentFilters.directorNames };
        delete newNames[id];
        setFilters({ ...currentFilters, directorIds: newIds, directorNames: newNames });
    };

    const toggleList = (listId: string) => {
        const next = currentFilters.listIds.includes(listId)
            ? currentFilters.listIds.filter(id => id !== listId)
            : [...currentFilters.listIds, listId];
        setFilters({ ...currentFilters, listIds: next });
    };

    const toggleCollection = (collectionId: string) => {
        const next = currentFilters.collectionIds.includes(collectionId)
            ? currentFilters.collectionIds.filter(id => id !== collectionId)
            : [...currentFilters.collectionIds, collectionId];
        setFilters({ ...currentFilters, collectionIds: next });
    };

    const shownEntriesCount = items.filter(item => {
        if (currentFilters.genres.length > 0) {
            const itemGenres = item.genres || [];
            if (!currentFilters.genres.some(g => itemGenres.includes(g))) return false;
        }
        if (currentFilters.actorIds.length > 0) {
            const itemActorIds = (item.cast || []).map(c => c.id);
            if (!currentFilters.actorIds.every(id => itemActorIds.includes(id))) return false;
        }
        if (currentFilters.directorIds.length > 0) {
            const itemDirectorIds = (item.directors || []).map(d => d.id);
            if (!currentFilters.directorIds.every(id => itemDirectorIds.includes(id))) return false;
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
        if (currentFilters.releaseYearRange) {
            const releaseYear = item.releaseDate ? parseInt(item.releaseDate.slice(0, 4), 10) : NaN;
            if (Number.isNaN(releaseYear)) return false;
            if (releaseYear < currentFilters.releaseYearRange[0] || releaseYear > currentFilters.releaseYearRange[1]) return false;
        }
        if (currentFilters.listIds.length > 0) {
            const itemListIds = listIdsByEntryId.get(item.id) ?? [];
            if (!currentFilters.listIds.every(id => itemListIds.includes(id))) return false;
        }
        if (currentFilters.collectionIds.length > 0) {
            const itemCollectionIds = collectionIdsByEntryId.get(item.id) ?? [];
            if (!currentFilters.collectionIds.every(id => itemCollectionIds.includes(id))) return false;
        }
        return true;
    }).length;

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

                    <section className="filter-section">
                        <h3>When You Watched It</h3>
                        {watchDateRange ? (
                            <div className="timeline-container">
                                <div className="timeline-inputs">
                                    <div className="timeline-input-group">
                                        <label>From: {currentFilters.watchTimeRange?.[0] || watchDateRange[0]}</label>
                                        <input
                                            type="range"
                                            min={watchDateRange[0]}
                                            max={watchDateRange[1]}
                                            value={currentFilters.watchTimeRange?.[0] || watchDateRange[0]}
                                            onChange={e => handleRangeChange(e, 0, 'watchTimeRange', watchDateRange)}
                                        />
                                    </div>
                                    <div className="timeline-input-group">
                                        <label>To: {currentFilters.watchTimeRange?.[1] || watchDateRange[1]}</label>
                                        <input
                                            type="range"
                                            min={watchDateRange[0]}
                                            max={watchDateRange[1]}
                                            value={currentFilters.watchTimeRange?.[1] || watchDateRange[1]}
                                            onChange={e => handleRangeChange(e, 1, 'watchTimeRange', watchDateRange)}
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

                    <section className="filter-section">
                        <h3>Release Year</h3>
                        {releaseDateRange ? (
                            <div className="timeline-inputs">
                                <div className="timeline-input-group">
                                    <label>From: {currentFilters.releaseYearRange?.[0] || releaseDateRange[0]}</label>
                                    <input
                                        type="range"
                                        min={releaseDateRange[0]}
                                        max={releaseDateRange[1]}
                                        value={currentFilters.releaseYearRange?.[0] || releaseDateRange[0]}
                                        onChange={e => handleRangeChange(e, 0, 'releaseYearRange', releaseDateRange)}
                                    />
                                </div>
                                <div className="timeline-input-group">
                                    <label>To: {currentFilters.releaseYearRange?.[1] || releaseDateRange[1]}</label>
                                    <input
                                        type="range"
                                        min={releaseDateRange[0]}
                                        max={releaseDateRange[1]}
                                        value={currentFilters.releaseYearRange?.[1] || releaseDateRange[1]}
                                        onChange={e => handleRangeChange(e, 1, 'releaseYearRange', releaseDateRange)}
                                    />
                                </div>
                            </div>
                        ) : (
                            <p className="filter-empty">No release years available.</p>
                        )}
                    </section>

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

                    <section className="filter-section">
                        <h3>{type === 'shows' ? 'Creators' : 'Directors'}</h3>
                        <div className="actor-search-container">
                            <div className="actor-search-input-wrapper">
                                <Search size={16} className="search-icon" />
                                <input
                                    type="text"
                                    placeholder={`Search ${type === 'shows' ? 'creators' : 'directors'}...`}
                                    value={directorSearch}
                                    onChange={e => setDirectorSearch(e.target.value)}
                                />
                                {isDirectorSearching && <div className="search-spinner" />}
                            </div>
                            {directorResults.length > 0 && (
                                <div className="actor-results">
                                    {directorResults.map(a => (
                                        <div key={a.id} className="actor-result-item" onClick={() => addDirector(a)}>
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
                            {currentFilters.directorIds.map(id => (
                                <div key={id} className="selected-actor-tag">
                                    {currentFilters.directorNames[id]}
                                    <button onClick={() => removeDirector(id)}>
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="filter-section filter-section-span-2">
                        <h3>Tags & Collections</h3>
                        <div className="filter-tag-groups">
                            <div>
                                <p className="filter-subtitle">Tags</p>
                                <div className="genre-wordcloud">
                                    {availableLists.map((list) => (
                                        <button
                                            key={list.id}
                                            className={`genre-tag ${currentFilters.listIds.includes(list.id) ? 'active' : ''}`}
                                            style={currentFilters.listIds.includes(list.id) && list.color ? { borderColor: list.color, background: `${list.color}33` } : undefined}
                                            onClick={() => toggleList(list.id)}
                                        >
                                            {list.name} <span className="genre-count">({listCounts.get(list.id) || 0})</span>
                                        </button>
                                    ))}
                                    {availableLists.length === 0 && <p className="filter-empty">No tags available.</p>}
                                </div>
                            </div>
                            <div>
                                <p className="filter-subtitle">Collections</p>
                                <div className="genre-wordcloud">
                                    {availableCollections.map((collection) => (
                                        <button
                                            key={collection.id}
                                            className={`genre-tag ${currentFilters.collectionIds.includes(collection.id) ? 'active' : ''}`}
                                            style={currentFilters.collectionIds.includes(collection.id) && collection.color ? { borderColor: collection.color, background: `${collection.color}33` } : undefined}
                                            onClick={() => toggleCollection(collection.id)}
                                        >
                                            {collection.name} <span className="genre-count">({collectionCounts.get(collection.id) || 0})</span>
                                        </button>
                                    ))}
                                    {availableCollections.length === 0 && <p className="filter-empty">No collections available.</p>}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <footer className="filter-footer">
                    <div className="filter-footer-left">
                        <div className="shown-entries">
                            {shownEntriesCount} entries shown
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
