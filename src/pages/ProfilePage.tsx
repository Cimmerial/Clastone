import { moviesByClass } from '../mock/movies';
import { tvByClass } from '../mock/tvShows';
import './ProfilePage.css';

function firstN<T>(items: T[], n: number) {
  return items.slice(0, n);
}

export function ProfilePage() {
  const topMovies = firstN(
    Object.values(moviesByClass)
      .flat()
      .sort((a, b) => (a.absoluteRank > b.absoluteRank ? 1 : -1)),
    5
  );
  const topShows = firstN(Object.values(tvByClass).flat(), 5);

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-tagline">YOUR HIGHLIGHTS</p>
        </div>
        <p className="page-subtitle">Top picks and recent activity (mocked).</p>
      </header>

      <div className="profile-grid">
        <div className="profile-card card-surface">
          <h2 className="profile-card-title">Top 5 Movies</h2>
          <ol className="profile-list">
            {topMovies.map((m) => (
              <li key={m.id} className="profile-list-item">
                <span className="profile-rank">{m.absoluteRank}</span>
                <span className="profile-name">{m.title}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="profile-card card-surface">
          <h2 className="profile-card-title">Top 5 Shows</h2>
          <ol className="profile-list">
            {topShows.map((s) => (
              <li key={s.id} className="profile-list-item">
                <span className="profile-rank">{s.absoluteRank}</span>
                <span className="profile-name">{s.title}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="profile-card card-surface profile-card-wide">
          <h2 className="profile-card-title">Pinned Entries (stub)</h2>
          <p className="profile-muted">
            This will become the “pinned with taglines” area once persistence is hooked up.
          </p>
          <div className="profile-pins">
            <div className="chip chip-accent">BEST_MYSTERY</div>
            <div className="chip chip-accent">BEST_COMEDY</div>
            <div className="chip chip-accent">BEST_ANTHOLOGY</div>
          </div>
        </div>
      </div>
    </section>
  );
}

