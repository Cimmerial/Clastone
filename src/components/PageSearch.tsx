import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Settings } from 'lucide-react';
import { usePageState } from '../hooks/usePageState';
import './PageSearch.css';

export interface SearchableItem {
    id: string;
    title: string;
}

interface PageSearchProps {
    items: SearchableItem[];
    onSelect: (id: string) => void;
    /** When set, shows a control on each result row to edit without running onSelect (e.g. open settings modal). */
    onEdit?: (id: string) => void;
    offsetRight?: string;
    placeholder?: string;
    className?: string;
    pageKey?: string; // Add pageKey for state persistence
}

export function PageSearch({ items, onSelect, onEdit, offsetRight = '1.5rem', placeholder = 'Search page...', className = '', pageKey }: PageSearchProps) {
    // Use page state if pageKey is provided, otherwise use local state
    const pageState = pageKey ? usePageState(pageKey) : null;
    const [query, setQuery] = useState(pageState?.searchQuery || '');
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Update local query when page state changes
    useEffect(() => {
        if (pageState) {
            setQuery(pageState.searchQuery);
        }
    }, [pageState?.searchQuery]);

    // Update page state when local query changes
    const handleQueryChange = (newQuery: string) => {
        setQuery(newQuery);
        if (pageState) {
            pageState.setSearchQuery(newQuery);
        }
    };

    const results = useMemo(() => {
        if (!query.trim()) return [];
        const lowerQuery = query.toLowerCase();

        return items
            .filter(item => item.title.toLowerCase().includes(lowerQuery))
            .sort((a, b) => {
                const aTitle = a.title.toLowerCase();
                const bTitle = b.title.toLowerCase();
                const aStarts = aTitle.startsWith(lowerQuery);
                const bStarts = bTitle.startsWith(lowerQuery);
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;
                return aTitle.localeCompare(bTitle);
            })
            .slice(0, 5);
    }, [items, query]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (id: string) => {
        onSelect(id);
        handleQueryChange(''); // Clear search after selection
        setIsOpen(false);
    };

    const handleEdit = (id: string) => {
        onEdit?.(id);
        handleQueryChange('');
        setIsOpen(false);
    };



    return (
        <div
            className={`page-search-container ${className}`}
            ref={containerRef}
            style={{ right: offsetRight }}
        >
            <div className={`page-search-input-wrapper ${isOpen && query ? 'active' : ''}`}>
                <Search size={16} className="search-icon" />
                <input
                    type="text"
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => {
                        handleQueryChange(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />

            </div>

            {isOpen && results.length > 0 && (
                <div className="page-search-results">
                    {results.map((item) => (
                        <div
                            key={item.id}
                            className="page-search-result-item"
                            onClick={() => handleSelect(item.id)}
                        >
                            <span className="page-search-result-title">{item.title}</span>
                            {onEdit ? (
                                <button
                                    type="button"
                                    className="page-search-result-edit"
                                    title="Edit"
                                    aria-label={`Edit ${item.title}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleEdit(item.id);
                                    }}
                                >
                                    <Settings size={14} aria-hidden />
                                </button>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
            {isOpen && query && results.length === 0 && (
                <div className="page-search-results no-results">
                    No matches found
                </div>
            )}
        </div>
    );
}
