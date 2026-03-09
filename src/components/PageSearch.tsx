import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import './PageSearch.css';

export interface SearchableItem {
    id: string;
    title: string;
}

interface PageSearchProps {
    items: SearchableItem[];
    onSelect: (id: string) => void;
    offsetRight?: string;
    placeholder?: string;
    className?: string;
}

export function PageSearch({ items, onSelect, offsetRight = '1.5rem', placeholder = 'Search page...', className = '' }: PageSearchProps) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

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
        setQuery('');
        setIsOpen(false);
    };

    const handleClear = () => {
        setQuery('');
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
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                {query && (
                    <button className="clear-btn" onClick={handleClear}>
                        <X size={14} />
                    </button>
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="page-search-results">
                    {results.map((item) => (
                        <div
                            key={item.id}
                            className="page-search-result-item"
                            onClick={() => handleSelect(item.id)}
                        >
                            {item.title}
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
