import { createContext, useContext, useState, ReactNode } from 'react';

export type FilterState = {
    genres: string[];
    watchTimeRange: [number, number] | null; // [year_from, year_to]
    includeLongAgo: boolean;
    actorIds: number[];
    actorNames: Record<number, string>;
};

const initialFilterState: FilterState = {
    genres: [],
    watchTimeRange: null,
    includeLongAgo: true,
    actorIds: [],
    actorNames: {},
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
