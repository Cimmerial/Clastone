import { createContext, useContext, useState, ReactNode } from 'react';

export type FilterState = {
    genres: string[];
    watchTimeRange: [number, number] | null; // [year_from, year_to]
    releaseYearRange: [number, number] | null; // [year_from, year_to]
    includeLongAgo: boolean;
    actorIds: number[];
    actorNames: Record<number, string>;
    directorIds: number[];
    directorNames: Record<number, string>;
    listIds: string[];
    collectionIds: string[];
};

const initialFilterState: FilterState = {
    genres: [],
    watchTimeRange: null,
    releaseYearRange: null,
    includeLongAgo: true,
    actorIds: [],
    actorNames: {},
    directorIds: [],
    directorNames: {},
    listIds: [],
    collectionIds: [],
};

type FilterStore = {
    movieFilters: FilterState;
    showFilters: FilterState;
    setMovieFilters: (filters: FilterState) => void;
    setShowFilters: (filters: FilterState) => void;
    resetMovieFilters: () => void;
    resetShowFilters: () => void;
};

const FilterContext = createContext<FilterStore | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
    const [movieFilters, setMovieFilters] = useState<FilterState>(initialFilterState);
    const [showFilters, setShowFilters] = useState<FilterState>(initialFilterState);

    const resetMovieFilters = () => setMovieFilters(initialFilterState);
    const resetShowFilters = () => setShowFilters(initialFilterState);

    return (
        <FilterContext.Provider
            value={{
                movieFilters,
                showFilters,
                setMovieFilters,
                setShowFilters,
                resetMovieFilters,
                resetShowFilters,
            }}
        >
            {children}
        </FilterContext.Provider>
    );
}

export function useFilterStore() {
    const context = useContext(FilterContext);
    if (!context) throw new Error('useFilterStore must be used within a FilterProvider');
    return context;
}
