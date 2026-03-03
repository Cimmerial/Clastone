import { useMemo, useState } from 'react';
import { mockSearchResults } from '../mock/searchResults';
import './SearchPage.css';

export function SearchPage() {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mockSearchResults;
    return mockSearchResults.filter(
      (r) => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Search</h1>
          <p className="page-tagline">TMDB WIRED LATER</p>
        </div>
        <p className="page-subtitle">Search for movies, shows, and people to add.</p>
      </header>

      <div className="search-shell card-surface">
        <div className="search-controls">
          <label className="search-label">
            <span>Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try “arrival”, “leftovers”, “regina”…"
              className="search-input"
            />
          </label>
          <div className="chip chip-accent">
            <span>Mock results</span>
          </div>
        </div>

        <div className="search-results">
          {results.map((r) => (
            <article key={r.id} className="search-card">
              <div className="search-card-badge">{r.type.toUpperCase()}</div>
              <div className="search-card-main">
                <div className="search-card-title">{r.title}</div>
                <div className="search-card-subtitle">{r.subtitle}</div>
              </div>
              <button type="button" className="search-card-action">
                Add to list
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

