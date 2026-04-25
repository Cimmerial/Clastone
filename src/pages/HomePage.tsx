import { NavLink } from 'react-router-dom';
import { Film, Tv, Users, User, Settings, Search, Frown, Star, TrendingUp, Flag, ChevronDown, ChevronUp, RefreshCw, BarChart3, Sparkles, Zap, Target, Rocket, BookOpen, Link, MessagesSquare, BrainCircuit } from 'lucide-react';
import { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loadMovies } from '../lib/firestoreMovies';
import { loadTvShows } from '../lib/firestoreTvShows';
import { loadPeople } from '../lib/firestorePeople';
import { loadDirectors } from '../lib/firestoreDirectors';
import { loadWatchlist } from '../lib/firestoreWatchlist';
import { tmdbImagePath } from '../lib/tmdb';
import './HomePage.css';

interface ExpandableSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function ExpandableSection({ title, children, defaultExpanded = false }: ExpandableSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  return (
    <div className="expandable-section">
      <button 
        className="expandable-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3>{title}</h3>
        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>
      {isExpanded && <div className="expandable-content">{children}</div>}
    </div>
  );
}

export function HomePage() {
  const [exampleProfile, setExampleProfile] = useState({
    username: 'Cimmerial',
    movieCount: 0,
    showCount: 0,
    actorCount: 0,
    pfpPosterPath: null as string | null,
    pfpPhotoUrl: null as string | null
  });
  /** Firebase UID for the featured example profile (used in /friends/:id link). */
  const [exampleProfileUid, setExampleProfileUid] = useState<string | null>(null);

  // Load example profile data on component mount
  useEffect(() => {
    const loadExampleProfile = async () => {
      try {
        if (!db) return;
        
        // Find admin user UID
        const adminQuery = query(
          collection(db, 'users'),
          where('email', '==', 'cimmerial@clastone.local')
        );
        const adminSnapshot = await getDocs(adminQuery);
        
        if (adminSnapshot.empty) {
          console.log('Admin user not found');
          return;
        }
        
        const adminUid = adminSnapshot.docs[0].id;
        const adminUserData = adminSnapshot.docs[0].data();
        console.log('Found admin UID:', adminUid);
        setExampleProfileUid(adminUid);
        
        // Load admin user's data
        const [moviesData, tvData, peopleData, directorsData] = await Promise.all([
          loadMovies(db, adminUid),
          loadTvShows(db, adminUid),
          loadPeople(db, adminUid),
          loadDirectors(db, adminUid)
        ]);
        
        // Calculate real counts
        let movieCount = 0;
        let showCount = 0;
        let actorCount = 0;
        let directorCount = 0;
        
        // Count movies (excluding unranked)
        if (moviesData?.classes) {
          for (const classDef of moviesData.classes) {
            if (classDef.key !== 'UNRANKED') {
              movieCount += (moviesData.byClass[classDef.key] || []).length;
            }
          }
        }
        
        // Count TV shows (excluding unranked)
        if (tvData?.classes) {
          for (const classDef of tvData.classes) {
            if (classDef.key !== 'UNRANKED') {
              showCount += (tvData.byClass[classDef.key] || []).length;
            }
          }
        }
        
        // Count actors and directors
        if (peopleData?.classes) {
          for (const classDef of peopleData.classes) {
            actorCount += (peopleData.byClass[classDef.key] || []).length;
          }
        }
        
        if (directorsData?.classes) {
          for (const classDef of directorsData.classes) {
            directorCount += (directorsData.byClass[classDef.key] || []).length;
          }
        }
        
        const totalPeople = actorCount + directorCount;
        
        // Update example profile stats
        setExampleProfile({
          username: 'Cimmerial',
          movieCount,
          showCount,
          actorCount: totalPeople,
          pfpPosterPath: typeof adminUserData?.pfpPosterPath === 'string' ? adminUserData.pfpPosterPath : null,
          pfpPhotoUrl: typeof adminUserData?.pfpPhotoUrl === 'string' ? adminUserData.pfpPhotoUrl : null
        });
        
        console.log('Loaded example profile stats:', { movieCount, showCount, totalPeople });
        
      } catch (error) {
        console.error('Failed to load example profile:', error);
      }
    };

    loadExampleProfile();
  }, []);

  return (
    <div className="homepage-root homepage-root">
      <div className="homepage-container">
        <header className="homepage-header">
          <h1 className="homepage-title">Welcome to Clastone</h1>
        </header>

        <main className="homepage-main">
          <section className="homepage-hero">
            <div className="hero-content">
              <h2 className="hero-title">Rank, Track, Organize</h2>
              <p className="hero-description">
                Rank your movies, shows, actors, and directors in a class-based system (far superior to a simple 5 star scale).
                View your friend profiles, see watchlist overlap, and make suggestions.
              </p>
              <div className="hero-actions">
                <NavLink to="/search" className="hero-btn primary">
                  <Search size={20} />
                  Add Movies/Shows/People
                </NavLink>
                <NavLink to="/movies" className="hero-btn primary">
                  <Film size={20} />
                  Your Movies
                </NavLink>
                <NavLink to="/tv" className="hero-btn primary">
                  <Tv size={20} />
                  Your TV Shows
                </NavLink>
                <NavLink to="/settings" className="hero-btn secondary">
                  <Settings size={20} />
                  Edit Classes
                </NavLink>
                <NavLink to="/friends" className="hero-btn secondary">
                  <Users size={20} />
                  People
                </NavLink>
                
                <NavLink to="/profile" className="hero-btn secondary">
                  <User size={20} />
                  View My Stats
                </NavLink>
              </div>
            </div>
          </section>

          <section className="homepage-example-profile">
            <div className="example-profile-card">
              <div className="profile-preview">
                <div className="profile-avatar-container">
                  <div className="profile-avatar">
                    {exampleProfile.pfpPosterPath ? (
                      <img
                        src={tmdbImagePath(exampleProfile.pfpPosterPath, 'w185') ?? ''}
                        alt={`${exampleProfile.username} profile`}
                        className="profile-avatar-image"
                      />
                    ) : exampleProfile.pfpPhotoUrl ? (
                      <img
                        src={exampleProfile.pfpPhotoUrl}
                        alt={`${exampleProfile.username} profile`}
                        className="profile-avatar-image"
                      />
                    ) : (
                      <User size={64} />
                    )}
                    <Frown className="premium-badge-icon" size={24} />
                  </div>
                </div>
                <div className="profile-info">
                  <div className="profile-title-row">
                    <h3 className="example-title">Example Profile: <span className="highlight-username">{exampleProfile.username}</span></h3>
                    <div className="verified-badge">Featured</div>
                  </div>
                  <p className="example-tagline">Peruse a fully filled out profile to see Clastone's capabilities. Or don't, whatever.</p>
                  <div className="profile-stats">
                    <div className="stat-pill">
                      <Film size={16} />
                      <span>{exampleProfile.movieCount.toLocaleString()} Movies</span>
                    </div>
                    <div className="stat-pill">
                      <Tv size={16} />
                      <span>{exampleProfile.showCount.toLocaleString()} TV Shows</span>
                    </div>
                    <div className="stat-pill">
                      <Users size={16} />
                      <span>{exampleProfile.actorCount.toLocaleString()} People</span>
                    </div>
                  </div>
                </div>
              </div>
              <NavLink
                to={exampleProfileUid ? `/friends/${exampleProfileUid}` : '/friends'}
                className="profile-view-btn"
              >
                <span>View Example Profile</span>
                <ChevronDown className="btn-arrow" size={20} style={{ transform: 'rotate(-90deg)' }} />
              </NavLink>
            </div>
          </section>

          <section className="homepage-features">
            <header className="features-section-header">
              <div className="features-title-wrapper">
                <Flag className="section-icon" size={32} />
                <h2 className="features-title">Features</h2>
              </div>
            </header>
            
            <div className="features-grid">
              <div className="feature-column">
                <div className="feature-card new">
                  <h3 className="feature-group-title">New</h3>
                  <ul className="feature-list">
                    <li>Can create custom lists and collections (can add to collections from persons filmography)</li>
                    <li>Many QOL changes (watchlist buttons in info modal, auto switch to watch type "Single Date" if using preset date picker, can search and filter within collections, etc)</li>
                    <li>Can leave review for each movie/show watch</li>
                    <li>Info modal buffed out; can go to other info modals and record watch modal from it</li>
                    <li>Can edit the main image of given entry/person once saved from watch edit modal</li>
                  </ul>
                </div>
              </div>
              
              <div className="feature-column">
                <div className="feature-card future">
                  <h3 className="feature-group-title">Future</h3>
                  <ul className="feature-list">
                    <li>quick move button options for moving around entries</li>
                    <li>The copy list(s) doesnt work on mobile, will fix</li>
                    <li>Download profile ad PDF (custom ordering of data, select certain aspects of profile, etc)</li>
                    <li>Reduce dragging lag</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="features-feedback-notice">
              <div className="feedback-content">
                <MessagesSquare className="feedback-icon" size={24} />
                <p>
                  <strong>Got feedback?</strong> If you have any bugs or features you want, there is a 95% chance that <strong>Cooper</strong> is willing or wanting to fix/make that for you. 
                  Reach out to him (or someone who knows him) to pass on the word and it will be done.
                </p>
              </div>
            </div>
          </section>

          <section className="homepage-guides">
            <header className="guides-section-header">
              <div className="guides-title-wrapper">
                <h2 className="guides-title">Workflow Guides</h2>
              </div>
              <p className="guides-description">
                Three guides I am confident nobody will read. They are certifiably not helpful. Cheers!
              </p>
            </header>
            
            <div className="guides-grid">
              <div className="guide-column">
                <div className="guide-card">
                  <div className="guide-card-header">
                    <div className="guide-icon-box"><Target size={28} /></div>
                    <div className="guide-header-text">
                      <h3 className="guide-title">Clastonian Noob</h3>
                      <p className="guide-subtitle">Beginning your Clastone journey</p>
                    </div>
                  </div>
                  <div className="guide-content">
                    <ul className="guide-list">
                      <li>Go to <strong>Search</strong>, save your top movies and shows</li>
                      <li>Start by filling in the top and bottom of each ranking page, then fill in the middle</li>
                      <li>Tweak as you go - change classes to suit your personal data</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="guide-column">
                <div className="guide-card">
                  <div className="guide-card-header">
                    <div className="guide-icon-box"><Search size={28} /></div>
                    <div className="guide-header-text">
                      <h3 className="guide-title">Deeper Dive</h3>
                      <p className="guide-subtitle">Expand your collection through smart connections</p>
                    </div>
                  </div>
                  <div className="guide-content">
                    <ul className="guide-list">
                      <li>Using the <strong>info modal</strong>, start to go back and forth between actors, movies, directors, and shows, saving as you go</li>
                      <li>Use this random searching to record a good number of entries you might've missed</li>
                      <li>Go to the <strong>Friends</strong> page and scroll through their profiles, saving what you've seen that they've saved</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="guide-column">
                <div className="guide-card">
                  <div className="guide-card-header">
                    <div className="guide-icon-box"><BrainCircuit size={28} /></div>
                    <div className="guide-header-text">
                      <h3 className="guide-title">Iceberg Mining</h3>
                      <p className="guide-subtitle">Comprehensive discovery for completionists</p>
                    </div>
                  </div>
                  <div className="guide-content">
                    <ul className="guide-list">
                      <li>Go to the <strong>Doomscroll tab</strong> in Search page</li>
                      <li>Start at the current year, scroll and save</li>
                      <li>Continue until you decide to move to the prior year(s)</li>
                      <li>Rinse and repeat</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
