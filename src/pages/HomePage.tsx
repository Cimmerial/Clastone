import { NavLink } from 'react-router-dom';
import { Film, Tv, Users, User, Settings, Search, PlayCircle, Star, TrendingUp, ChevronDown, ChevronUp, RefreshCw, BarChart3, Sparkles, Zap } from 'lucide-react';
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
                  Add Friends
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
                <div className="profile-avatar">
                  <User size={48} />
                </div>
                <div className="profile-info">
                  <h3>Example Profile: {exampleProfile.username}</h3>
                  <p>Explore a fully featured example profile to see Clastone's capabilities</p>
                  <div className="profile-stats">
                    <span>{exampleProfile.movieCount.toLocaleString()} Movies</span>
                    <span>{exampleProfile.showCount.toLocaleString()} TV Shows</span>
                    <span>{exampleProfile.actorCount.toLocaleString()} People</span>
                  </div>
                </div>
              </div>
              <NavLink to="/friends/cimmerial@clastone.local" className="profile-view-btn">
                View Example Profile
              </NavLink>
            </div>
          </section>

          <section className="homepage-guides">
            <div className="guides-hero">
              <h2 className="guides-title">Workflow Guides</h2>
              <p className="guides-description">
                Three proven strategies to build and expand your personal media collection. 
                Choose your approach based on your goals and time commitment.
              </p>
            </div>
            <div className="guides-grid">
              <div className="guide-column">
                <div className="guide-header">
                  <h3 className="guide-title">🎯 Starting Workflow</h3>
                  <p className="guide-subtitle">Perfect for beginners building their initial collection</p>
                </div>
                <div className="guide-content">
                  <ul className="guide-list">
                    <li>Go to <strong>Search</strong> and query all your favorite movies, shows, and people</li>
                    <li>Add everything to <strong>Unranked</strong> to build your initial collection</li>
                    <li>Visit each page and start ranking items one at a time</li>
                    <li>Tweak as you go - change/add classes to better suit your personal data</li>
                  </ul>
                </div>
              </div>
              
              <div className="guide-column">
                <div className="guide-header">
                  <h3 className="guide-title">🔍 Deeper Dive</h3>
                  <p className="guide-subtitle">Expand your collection through smart connections</p>
                </div>
                <div className="guide-content">
                  <ul className="guide-list">
                    <li>Go to all your <strong>top-rated movies and shows</strong></li>
                    <li>Enter <strong>detailed view</strong> and save all your favorite actors</li>
                    <li>Visit the <strong>Actors</strong> page and explore their filmography</li>
                    <li>Save their projects as Unranked, then rank all newly discovered content</li>
                  </ul>
                </div>
              </div>
              
              <div className="guide-column">
                <div className="guide-header">
                  <h3 className="guide-title">⚡ Trench Dive</h3>
                  <p className="guide-subtitle">Comprehensive discovery for completionists</p>
                </div>
                <div className="guide-content">
                  <ul className="guide-list">
                    <li>Go to the <strong>Wander tab</strong> in Search page</li>
                    <li>Sort by <strong>vote count</strong> in three columns</li>
                    <li>Start at <strong>current year</strong>, scroll and add to Unranked</li>
                    <li>Continue until you find nothing more you might've seen</li>
                    <li>Move to <strong>prior years</strong> and repeat</li>
                    <li>Combine with Deeper Dive strategy for maximum coverage</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section className="homepage-todo">
            <h2 className="section-title">TODO - Complete These Sections</h2>
            <div className="todo-grid">
              <div className="todo-card">
                <h3>📖 Guide Section</h3>
                <p>Rebuild the guide section with updated content and better organization</p>
              </div>
              <div className="todo-card">
                <h3>🚀 Quick Start</h3>
                <p>Create a new quick start section with better workflow guidance</p>
              </div>
              <div className="todo-card">
                <h3>✨ Features Showcase</h3>
                <p>Update features section with current and upcoming functionality</p>
              </div>
              <div className="todo-card">
                <h3>🔗 Quick Navigation</h3>
                <p>Redesign quick navigation with better accessibility</p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
