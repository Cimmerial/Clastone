import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { X, Star, Users, Film, Tv, User, Settings, Search, ChevronRight, ChevronDown, BookOpen, Shield, Clock, Tag, Move, Plus, ArrowUp } from 'lucide-react';
import { useSettingsStore } from '../state/settingsStore';
import './GuidePage.css';

interface SectionProps {
  title: string;
  icon: React.ComponentType<any>;
  id?: string;
  children: React.ReactNode;
}

function GuideSection({ title, icon: Icon, id, children }: SectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="guide-section" id={id}>
      <button 
        className="guide-section-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Icon size={20} className="guide-section-icon" />
        <h3 className="guide-section-title">{title}</h3>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {isExpanded && (
        <div className="guide-section-content">
          {children}
        </div>
      )}
    </div>
  );
}

export function GuidePage() {
  const { settings, updateSettings } = useSettingsStore();
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const [showBackToTop, setShowBackToTop] = useState(false);

  const sections = [
    { id: 'navigation', title: 'Navigation', icon: Move },
    { id: 'lists-classes', title: 'Lists & Classes', icon: Film },
    { id: 'adding-content', title: 'Adding Content', icon: Plus },
    { id: 'ranking-system', title: 'Ranking System', icon: Star },
    { id: 'entry-features', title: 'Entry Features', icon: Tag },
    { id: 'customization', title: 'Customization', icon: Settings },
    { id: 'social-features', title: 'Social Features', icon: Users },
    { id: 'technical-details', title: 'Technical Details', icon: Shield }
  ];

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 500);
      
      // Update active section based on scroll position
      const sectionElements = sections.map(s => document.getElementById(s.id));
      const currentSection = sectionElements.find(el => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.top <= 100 && rect.bottom > 100;
      });
      
      if (currentSection) {
        setActiveSection(currentSection.id);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDismissFlag = () => {
    updateSettings({ showGuideFlag: false });
    setShowDismissConfirm(false);
  };

  return (
    <div className="guide-page">
      <header className="guide-header">
        <div className="guide-header-content">
          <div className="guide-header-text">
            <h1 className="guide-title">
              <BookOpen size={28} className="guide-title-icon" />
              Welcome to Clastone 1.0
            </h1>
            <p className="guide-subtitle">
              Your personal media tracking and ranking system
            </p>
          </div>
          <NavLink to="/settings" className="guide-close-btn">
            <X size={20} />
          </NavLink>
        </div>
        
        {/* Table of Contents */}
        <div className="guide-toc">
          <h3 className="guide-toc-title">Quick Navigation</h3>
          <div className="guide-toc-grid">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  className={`guide-toc-item ${activeSection === section.id ? 'active' : ''}`}
                  onClick={() => scrollToSection(section.id)}
                >
                  <Icon size={16} className="guide-toc-icon" />
                  <span>{section.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="guide-content">
        <div className="guide-intro">
          <div className="guide-intro-card">
            <h2>What is Clastone?</h2>
            <p>
              Clastone is a personal media tracking system that lets you organize, rank, and manage 
              your movies, TV shows, actors, and directors. Create custom classes, drag entries to reorder, 
              and build your personal media database with detailed rankings and metadata.
            </p>
          </div>
        </div>

        <div className="guide-grid">
          <GuideSection title="Navigation" icon={Move} id="navigation">
            <div className="guide-subsection">
              <h4>Main Navigation</h4>
              <ul>
                <li><strong>Left Menu Items:</strong> Movies | TV Shows | Actors | Directors | Watchlist</li>
                <li><strong>Right Menu Items:</strong> Search | Friends | Profile | Settings | Diagnostics</li>
                <li><strong>Version Flag:</strong> Click the "1.0" flag next to logo to access this guide</li>
              </ul>
            </div>
            
            <div className="guide-subsection">
              <h4>Mobile Navigation</h4>
              <ul>
                <li>Use the hamburger menu (☰) on mobile devices</li>
                <li>All navigation options available in mobile overlay</li>
                <li>Swipe or tap outside to close the mobile menu</li>
              </ul>
            </div>
          </GuideSection>

          <GuideSection title="Lists & Classes" icon={Film} id="lists-classes">
            <div className="guide-subsection">
              <h4>Four Independent Lists</h4>
              <ul>
                <li><strong>Movies:</strong> Feature films and documentaries</li>
                <li><strong>TV Shows:</strong> Television series (each season is separate)</li>
                <li><strong>Actors:</strong> Favorite actors and actresses</li>
                <li><strong>Directors:</strong> Favorite directors</li>
              </ul>
            </div>

            <div className="guide-subsection">
              <h4>Default Movie/TV Classes</h4>
              <div className="guide-classes-grid">
                <div className="guide-class-item">
                  <span className="guide-class-name">S (OLYMPUS)</span>
                  <span className="guide-class-desc">Masterpiece level</span>
                </div>
                <div className="guide-class-item">
                  <span className="guide-class-name">A (DAMN_GOOD)</span>
                  <span className="guide-class-desc">Excellent</span>
                </div>
                <div className="guide-class-item">
                  <span className="guide-class-name">B (GOOD)</span>
                  <span className="guide-class-desc">Good</span>
                </div>
                <div className="guide-class-item">
                  <span className="guide-class-name">C (ALRIGHT)</span>
                  <span className="guide-class-desc">Decent</span>
                </div>
                <div className="guide-class-item">
                  <span className="guide-class-name">D (MEH)</span>
                  <span className="guide-class-desc">Mediocre</span>
                </div>
                <div className="guide-class-item">
                  <span className="guide-class-name">F (BAD)</span>
                  <span className="guide-class-desc">Poor</span>
                </div>
                <div className="guide-class-item">
                  <span className="guide-class-name">BABY</span>
                  <span className="guide-class-desc">Children's content (separate ranking)</span>
                </div>
                <div className="guide-class-item">
                  <span className="guide-class-name">DELICIOUS_GARBAGE</span>
                  <span className="guide-class-desc">So bad it's good</span>
                </div>
              </div>
              <p className="guide-note">
                <strong>Note:</strong> BABY, UNRANKED, and DELICIOUS_GARBAGE are excluded from main percentile rankings.
              </p>
            </div>

            <div className="guide-subsection">
              <h4>Actor/Director Classes</h4>
              <ul>
                <li>ABSOLUTE FAVORITE</li>
                <li>MARVELOUS</li>
                <li>AWESOME</li>
                <li>GREAT</li>
                <li>UNRANKED</li>
                <li>DELICIOUS_GARBAGE</li>
              </ul>
            </div>
          </GuideSection>

          <GuideSection title="Adding Content" icon={Plus} id="adding-content">
            <div className="guide-subsection">
              <h4>Search and Add</h4>
              <ul>
                <li>Use the <Search size={16} /> Search page to find movies, shows, or people</li>
                <li>Data comes from TMDb (The Movie Database)</li>
                <li>Filter by media type: Movies, TV Shows, People</li>
                <li>Click "Add to Movies/TV/Actors/Directors" to include in your lists</li>
              </ul>
            </div>

            <div className="guide-subsection">
              <h4>Recording Watches</h4>
              <ul>
                <li><strong>For Movies/TV:</strong> Click the record button on any entry</li>
                <li>Add start date and end date for each viewing</li>
                <li>Supports multiple watches with separate rankings</li>
                <li>Track total watchtime automatically</li>
                <li><strong>For People:</strong> Add to your favorites list directly</li>
              </ul>
            </div>
          </GuideSection>

          <GuideSection title="Ranking System" icon={Star} id="ranking-system">
            <div className="guide-subsection">
              <h4>Understanding Percentile Rankings</h4>
              <div className="guide-ranking-explanation">
                <p><strong>How Percentiles Work:</strong></p>
                <ul>
                  <li>Your percentile shows how highly ranked an item is compared to everything you've watched</li>
                  <li>Formula: <code>((Total Items - Rank) / Total Items) × 100</code></li>
                  <li>Example: #3 out of 50 movies = ((50-3)/50) × 100 = 94%</li>
                  <li>This means the movie is better than 94% of movies you've seen</li>
                </ul>
              </div>
            </div>

            <div className="guide-subsection">
              <h4>Movies & TV Shows Rankings</h4>
              <ul>
                <li><strong>Percentile:</strong> Better than X% of what you've seen (e.g., #3/50 = 94%)</li>
                <li><strong>Absolute Rank:</strong> Position in total list (e.g., 3/50)</li>
                <li><strong>Rank in Class:</strong> Position within the entry's class</li>
              </ul>
              <div className="guide-ranking-example">
                <p><strong>Example Ranking Display:</strong></p>
                <div className="guide-example-item">
                  <span className="guide-example-percentile">94%</span>
                  <span className="guide-example-absolute">#3/50</span>
                  <span className="guide-example-class">S #2</span>
                </div>
              </div>
            </div>

            <div className="guide-subsection">
              <h4>Class System Logic</h4>
              <ul>
                <li><strong>Ranked Classes (S, A, B, C, D, F):</strong> Count toward percentile calculations</li>
                <li><strong>Unranked Classes:</strong> UNRANKED, BABY, DELICIOUS_GARBAGE don't affect percentiles</li>
                <li><strong>Class Order:</strong> S &gt; A &gt; B &gt; C &gt; D &gt; F (for ranking purposes)</li>
                <li><strong>Within Classes:</strong> Your manual ordering determines the rank</li>
              </ul>
            </div>

            <div className="guide-subsection">
              <h4>Actors & Directors Rankings</h4>
              <ul>
                <li><strong>Absolute Rank:</strong> X/Y position</li>
                <li><strong>Rank in Class:</strong> Position within class</li>
                <li><strong>No percentile:</strong> These are favorites, not exhaustive lists</li>
                <li><strong>Logic:</strong> Ordered by your preference within each class</li>
              </ul>
            </div>
          </GuideSection>

          <GuideSection title="Entry Features" icon={Tag} id="entry-features">
            <div className="guide-subsection">
              <h4>Movie/TV Show Entries</h4>
              <ul>
                <li>Poster images from TMDb</li>
                <li>Viewing dates and watch time tracking</li>
                <li>Top cast display (configurable count in settings)</li>
                <li>Sticker tags (BEST_MYSTERY, BEST_COMEDY, etc.)</li>
                <li>Percent completed tracking (increments with rewatches)</li>
                <li>Quick movement arrows for reordering</li>
                <li>Entry settings for custom options</li>
              </ul>
            </div>

            <div className="guide-subsection">
              <h4>Actor/Director Entries</h4>
              <ul>
                <li>Headshot images from TMDb</li>
                <li>Birthday information</li>
                <li>Top performances (your watched content shown first)</li>
                <li>Quick movement arrows</li>
                <li>Option to boycott talk shows from filmographies</li>
              </ul>
            </div>
          </GuideSection>

          <GuideSection title="Customization" icon={Settings} id="customization">
            <div className="guide-subsection">
              <h4>Class Management</h4>
              <ul>
                <li>Add custom classes in Settings</li>
                <li>Rename any existing class</li>
                <li>Reorder classes easily</li>
                <li>Delete empty classes (except required ones)</li>
                <li>Add custom taglines to classes</li>
              </ul>
            </div>

            <div className="guide-subsection">
              <h4>Display Settings</h4>
              <ul>
                <li>Adjust cast count display (0-20)</li>
                <li>Set actor projects limit (0-20)</li>
                <li>Toggle boycott of talk shows/awards from actor lists</li>
                <li>Exclude The Simpsons from actor filmographies</li>
                <li>Choose view mode: minimized, detailed, or tile</li>
              </ul>
            </div>
          </GuideSection>

          <GuideSection title="Social Features" icon={Users} id="social-features">
            <div className="guide-subsection">
              <h4>Friends System</h4>
              <ul>
                <li>Connect with other Clastone users</li>
                <li>View friends' profiles and rankings</li>
                <li>Compare tastes and discover new content</li>
                <li>See what your friends are watching</li>
              </ul>
            </div>

            <div className="guide-subsection">
              <h4>Profile Page</h4>
              <ul>
                <li>Top 10 Movies and TV Shows</li>
                <li>10 Most Recently Watched</li>
                <li>Pinned entries with custom taglines</li>
                <li>Overall statistics and achievements</li>
              </ul>
            </div>
          </GuideSection>

          <GuideSection title="Technical Details" icon={Shield} id="technical-details">
            <div className="guide-subsection">
              <h4>Data Storage</h4>
              <ul>
                <li><strong>Firebase:</strong> Account data, lists, cached TMDb data</li>
                <li><strong>TMDb API:</strong> Posters, headshots, cast info, metadata</li>
                <li><strong>Caching:</strong> Minimizes repeat API calls</li>
                <li><strong>Offline Support:</strong> Local storage backup</li>
              </ul>
            </div>

            <div className="guide-subsection">
              <h4>Security & Privacy</h4>
              <ul>
                <li>Email/password authentication with Firebase</li>
                <li>Google OAuth integration</li>
                <li>All data encrypted in transit</li>
                <li>No third-party tracking</li>
                <li>Your data is yours - export anytime</li>
              </ul>
            </div>
          </GuideSection>
        </div>

        <div className="guide-actions">
          <div className="guide-flag-control">
            <h4>Guide Flag Notification</h4>
            <p>
              The version flag appears in the navbar when substantial updates are available.
              You can control its visibility here.
            </p>
            <div className="guide-toggle-row">
              <span>Show version flag in navbar</span>
              <label className="guide-switch">
                <input
                  type="checkbox"
                  checked={settings.showGuideFlag !== false}
                  onChange={(e) => updateSettings({ showGuideFlag: e.target.checked })}
                />
                <span className="guide-switch-slider"></span>
              </label>
            </div>
            {settings.showGuideFlag !== false && (
              <button 
                className="guide-dismiss-btn"
                onClick={() => setShowDismissConfirm(true)}
              >
                Dismiss Current Flag
              </button>
            )}
            {showDismissConfirm && (
              <div className="guide-confirm-dialog">
                <p>Hide the version flag? You can always re-enable it in settings.</p>
                <div className="guide-confirm-actions">
                  <button onClick={handleDismissFlag} className="guide-confirm-yes">
                    Yes, Hide Flag
                  </button>
                  <button onClick={() => setShowDismissConfirm(false)} className="guide-confirm-no">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="guide-links">
            <NavLink to="/settings" className="guide-link-btn">
              <Settings size={16} />
              Advanced Settings
            </NavLink>
            <NavLink to="/search" className="guide-link-btn primary">
              <Search size={16} />
              Start Adding Content
            </NavLink>
          </div>
        </div>

        <div className="guide-footer">
          <div className="guide-version">
            <strong>Clastone 1.0</strong>
            <span>Your personal media tracking companion</span>
          </div>
          <div className="guide-footer-links">
            <NavLink to="/settings">Settings</NavLink>
            <span>•</span>
            <NavLink to="/diagnostics">Diagnostics</NavLink>
          </div>
        </div>

        {/* Back to Top Button */}
        {showBackToTop && (
          <button 
            className="guide-back-to-top"
            onClick={scrollToTop}
            aria-label="Back to top"
          >
            <ArrowUp size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
