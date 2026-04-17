import { NavLink } from 'react-router-dom';
import { Film, Tv, Users, User, Settings, Search, PlayCircle, Star, TrendingUp, ChevronDown, ChevronUp, RefreshCw, BarChart3, Sparkles, Zap, Target, Rocket, BookOpen, Link, MessagesSquare } from 'lucide-react';
import { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loadMovies } from '../lib/firestoreMovies';
import { loadTvShows } from '../lib/firestoreTvShows';
import { loadPeople } from '../lib/firestorePeople';
import { loadDirectors } from '../lib/firestoreDirectors';
import { loadWatchlist } from '../lib/firestoreWatchlist';
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
    actorCount: 0
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
          actorCount: totalPeople
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
                Keep track of your top movies, TV shows, actors, and directors all in one place. 
                Create ranking classes and view your friends' rankings.
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
                    <User size={64} />
                    <Sparkles className="premium-badge-icon" size={24} />
                  </div>
                </div>
                <div className="profile-info">
                  <div className="profile-title-row">
                    <h3 className="example-title">Example Profile: <span className="highlight-username">{exampleProfile.username}</span></h3>
                    <div className="verified-badge">Featured</div>
                  </div>
                  <p className="example-tagline">Explore a fully filled out profile to see Clastone's capabilities.</p>
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

          <section className="homepage-guides">
            <header className="guides-section-header">
              <div className="guides-title-wrapper">
                <Zap className="section-icon" size={32} />
                <h2 className="guides-title">Workflow Guides</h2>
              </div>
              <p className="guides-description">
                Three strategies to help expand your personal media collection. 
                Choose your approach based on your goals and time commitment.
              </p>
            </header>
            
            <div className="guides-grid">
              <div className="guide-column">
                <div className="guide-card">
                  <div className="guide-card-header">
                    <div className="guide-icon-box"><Target size={28} /></div>
                    <div className="guide-header-text">
                      <h3 className="guide-title">Starting Workflow</h3>
                      <p className="guide-subtitle">Perfect for beginners building their initial collection</p>
                    </div>
                  </div>
                  <div className="guide-content">
                    <ul className="guide-list">
                      <li>Go to <strong>Search</strong> and query all your favorite items</li>
                      <li>Add everything to <strong>Unranked</strong> to build your initial library</li>
                      <li>Visit each page and start ranking items one at a time</li>
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
                      <li>Go to all your <strong>top-rated movies and shows</strong></li>
                      <li>Enter <strong>detailed view</strong> and save all your favorite actors</li>
                      <li>Visit the <strong>Actors</strong> page and explore their filmography</li>
                      <li>Save their projects as Unranked, then rank newly discovered content</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="guide-column">
                <div className="guide-card">
                  <div className="guide-card-header">
                    <div className="guide-icon-box"><Zap size={28} /></div>
                    <div className="guide-header-text">
                      <h3 className="guide-title">Trench Dive</h3>
                      <p className="guide-subtitle">Comprehensive discovery for completionists</p>
                    </div>
                  </div>
                  <div className="guide-content">
                    <ul className="guide-list">
                      <li>Go to the <strong>Doomscroll tab</strong> in Search page</li>
                      <li>Start at <strong>current year</strong>, scroll and add to Unranked</li>
                      <li>Continue until you find nothing more you might've seen</li>
                      <li>Move to <strong>prior years</strong> and repeat</li>
                      <li>Combine with Deeper Dive strategy for maximum coverage</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="homepage-features">
            <header className="features-section-header">
              <div className="features-title-wrapper">
                <Sparkles className="section-icon" size={32} />
                <h2 className="features-title">Features</h2>
              </div>
            </header>
            
            <div className="features-grid">
              <div className="feature-column">
                <div className="feature-card new">
                  <h3 className="feature-group-title">New</h3>
                  <ul className="feature-list">
                    <li><strong>Tagging</strong> entries, create custom lists and view collections.</li>
                    <li>Refined mobile Clastone</li>
                    <li>Can copy top movies/shows/people in Detailed Stats in Profile viewer</li>
                    <li>Info modal buffed out; can go to other info modals and record watch modal from it</li>
                  </ul>
                </div>
              </div>
              
              <div className="feature-column">
                <div className="feature-card future">
                  <h3 className="feature-group-title">Future</h3>
                  <ul className="feature-list">
                    <li>Right now, unranked entries dont count towards anything, might make them count towards collections and other main stats on profile</li>
                    <li><strong>quick move</strong> button options for moving around entries</li>
                    <li>Option for written reviews of each movie watch</li>
                    <li>Add system where you can mark movie watch order if seen more than one in a day</li>
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
{/* 
          <section className="homepage-todo">
            <h2 className="section-title">TODO - Complete These Sections</h2>
            <div className="todo-grid">
              <div className="todo-card">
                <h3><BookOpen size={18} /> Guide Section</h3>
                <p>Rebuild the guide section with updated content and better organization</p>
              </div>
              <div className="todo-card">
                <h3><Rocket size={18} /> Quick Start</h3>
                <p>Create a new quick start section with better workflow guidance</p>
              </div>
              <div className="todo-card">
                <h3><Sparkles size={18} /> Features Showcase</h3>
                <p>Update features section with current and upcoming functionality</p>
              </div>
              <div className="todo-card">
                <h3><Link size={18} /> Quick Navigation</h3>
                <p>Redesign quick navigation with better accessibility</p>
              </div>
            </div>
          </section> */}
        </main>
      </div>
    </div>
  );
}
