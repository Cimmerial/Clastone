import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { X, Star, Users, Film, Tv, User, Settings, Search, ChevronRight, ChevronDown, BookOpen, Shield, Clock, Tag, Move, Plus, ArrowUp, Zap, Calendar, Archive, ArrowRight } from 'lucide-react';
import { useSettingsStore } from '../state/settingsStore';
import patchNotesData from '../data/patchNotes.json';
import './PatchNotesPage.css';

interface FeatureCardProps {
  title: string;
  description: string;
  details: string[];
  icon?: React.ComponentType<any>;
}

function FeatureCard({ title, description, details, icon: Icon }: FeatureCardProps) {
  return (
    <div className="patch-notes-feature-card">
      <div className="patch-notes-feature-header">
        {Icon && <Icon size={20} className="patch-notes-feature-icon" />}
        <h4 className="patch-notes-feature-title">{title}</h4>
      </div>
      <p className="patch-notes-feature-description">{description}</p>
      {details.length > 0 && (
        <ul className="patch-notes-feature-details">
          {details.map((detail, index) => (
            <li key={index}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface VersionSectionProps {
  version: string;
  data: any;
  isCurrent: boolean;
}

function VersionSection({ version, data, isCurrent }: VersionSectionProps) {
  const [isExpanded, setIsExpanded] = useState(isCurrent);

  return (
    <div className="patch-notes-version-section">
      <button 
        className="patch-notes-version-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="patch-notes-version-info">
          <Archive size={20} className="patch-notes-version-icon" />
          <div>
            <h3 className="patch-notes-version-title">{data.title}</h3>
            <p className="patch-notes-version-date">Released {data.releaseDate}</p>
          </div>
        </div>
        <div className="patch-notes-version-controls">
          {isCurrent && <span className="patch-notes-current-badge">Current</span>}
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>
      
      {isExpanded && (
        <div className="patch-notes-version-content">
          {data.newFeatures.length > 0 && (
            <div className="patch-notes-content-section">
              <h4 className="patch-notes-content-title">
                <Zap size={16} className="patch-notes-content-icon" />
                New Features
              </h4>
              <div className="patch-notes-features-grid">
                {data.newFeatures.map((feature: any, index: number) => (
                  <FeatureCard
                    key={index}
                    title={feature.title}
                    description={feature.description}
                    details={feature.details}
                  />
                ))}
              </div>
            </div>
          )}
          
          {data.futureFeatures.length > 0 && (
            <div className="patch-notes-content-section">
              <h4 className="patch-notes-content-title">
                <Calendar size={16} className="patch-notes-content-icon" />
                Future Features
              </h4>
              <div className="patch-notes-features-grid">
                {data.futureFeatures.map((feature: any, index: number) => (
                  <FeatureCard
                    key={index}
                    title={feature.title}
                    description={feature.description}
                    details={feature.details}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GuideSection() {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="patch-notes-guide-section">
      <button 
        className="patch-notes-guide-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="patch-notes-guide-info">
          <BookOpen size={20} className="patch-notes-guide-icon" />
          <div>
            <h3 className="patch-notes-guide-title">Guide</h3>
            <p className="patch-notes-guide-subtitle">Learn how to use Clastone effectively</p>
          </div>
        </div>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      
      {isExpanded && (
        <div className="patch-notes-guide-content">
          {patchNotesData.guide.content.map((section: any, index: number) => (
            <div key={index} className="patch-notes-guide-chapter">
              <h4 className="patch-notes-guide-chapter-title">{section.section}</h4>
              <div className="patch-notes-guide-chapter-text">
                {section.content.split('\n\n').map((paragraph: string, pIndex: number) => (
                  <p key={pIndex}>{paragraph}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PatchNotesPage() {
  const { settings, updateSettings } = useSettingsStore();
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const versions = Object.entries(patchNotesData.versions).reverse();
  const currentVersion = patchNotesData.currentVersion;

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 500);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDismissFlag = () => {
    const updatedDismissedFlags = [...settings.dismissedVersionFlags, currentVersion];
    updateSettings({ 
      showGuideFlag: false,
      dismissedVersionFlags: updatedDismissedFlags 
    });
    setShowDismissConfirm(false);
  };

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Patch Notes</h1>
          <p className="page-subtitle">Explore the latest features and improvements in Clastone</p>
        </div>
        <NavLink to="/settings" className="patch-notes-close-btn">
          <X size={20} />
        </NavLink>
      </header>

      <div className="patch-notes-container">
        {/* Version Sections */}
        <div className="patch-notes-main-content">
          {versions.map(([version, data]) => (
            <VersionSection
              key={version}
              version={version}
              data={data}
              isCurrent={version === currentVersion}
            />
          ))}
          
          {/* Guide Section */}
          <GuideSection />
        </div>

        {/* Sidebar */}
        <aside className="patch-notes-sidebar">
          {/* Quick Actions */}
          <div className="patch-notes-card card-surface">
            <h3 className="patch-notes-sidebar-title">Quick Actions</h3>
            <div className="patch-notes-sidebar-links">
              <NavLink to="/search" className="patch-notes-sidebar-link">
                <Search size={16} />
                <span>Add Content</span>
                <ArrowRight size={14} />
              </NavLink>
              <NavLink to="/settings" className="patch-notes-sidebar-link">
                <Settings size={16} />
                <span>Settings</span>
                <ArrowRight size={14} />
              </NavLink>
            </div>
          </div>

          {/* Flag Control */}
          <div className="patch-notes-card card-surface">
            <h3 className="patch-notes-sidebar-title">Version Flag</h3>
            <p className="patch-notes-sidebar-description">
              Control the version flag visibility in the navigation bar.
            </p>
            
            <div className="patch-notes-flag-controls">
              <div className="patch-notes-toggle-row">
                <span>Show version flag</span>
                <label className="patch-notes-toggle">
                  <input
                    type="checkbox"
                    checked={settings.showGuideFlag !== false}
                    onChange={(e) => updateSettings({ showGuideFlag: e.target.checked })}
                  />
                  <span className="patch-notes-toggle-slider"></span>
                </label>
              </div>
              
              {settings.showGuideFlag !== false && (
                <button 
                  className="patch-notes-dismiss-btn"
                  onClick={() => setShowDismissConfirm(true)}
                >
                  Dismiss Current Flag
                </button>
              )}
              
              {showDismissConfirm && (
                <div className="patch-notes-confirm-dialog">
                  <p>Hide the version flag? You can re-enable it in settings anytime.</p>
                  <div className="patch-notes-confirm-actions">
                    <button onClick={handleDismissFlag} className="patch-notes-confirm-yes">
                      Hide Flag
                    </button>
                    <button onClick={() => setShowDismissConfirm(false)} className="patch-notes-confirm-no">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Version Info */}
          <div className="patch-notes-card card-surface">
            <h3 className="patch-notes-sidebar-title">Current Version</h3>
            <div className="patch-notes-version-info-card">
              <div className="patch-notes-version-badge">
                {patchNotesData.versions[currentVersion as keyof typeof patchNotesData.versions]?.title || 'Unknown'}
              </div>
              <p className="patch-notes-version-description">
                Your personal media tracking companion
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* Back to Top Button */}
      {showBackToTop && (
        <button 
          className="patch-notes-back-to-top"
          onClick={scrollToTop}
          aria-label="Back to top"
        >
          <ArrowUp size={20} />
        </button>
      )}
    </section>
  );
}
