import { NavLink } from 'react-router-dom';
import { Search, Home, Settings, RefreshCw, Users, Menu, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSettingsStore } from '../state/settingsStore';
import { useAuth } from '../context/AuthContext';
import { AnimatedArrow } from './AnimatedArrow';
import './NavBar.css';

const mainLinks = [
  { to: '/movies', label: 'Movies' },
  { to: '/tv', label: 'TV Shows' },
  { to: '/actors', label: 'Actors' },
  { to: '/directors', label: 'Directors' },
  { to: '/watchlist', label: 'Watchlist' }
];

const iconLinks = [
  { to: '/search', label: 'Search', icon: Search as React.ComponentType<{ size?: number; className?: string }> },
  { to: '/friends', label: 'Friends', icon: Users as React.ComponentType<{ size?: number; className?: string }> },
  { to: '/profile', label: 'Profile', icon: Home as React.ComponentType<{ size?: number; className?: string }> },
  { to: '/settings', label: 'Settings', icon: Settings as React.ComponentType<{ size?: number; className?: string }> },
  { to: '/diagnostics', label: 'Diagnostics', icon: RefreshCw as React.ComponentType<{ size?: number; className?: string }> },
];

export function NavBar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { settings, updateSettings } = useSettingsStore();
  const { isAdmin } = useAuth();

  // Check if homepage flag should be shown
  const shouldShowHomepageFlag = useMemo(() => {
    if (settings.showHomepageFlag === false) return false;
    const currentFlagVersion = 'v1.0'; // You can change this when you want to show a new flag
    return !settings.dismissedHomepageFlags.includes(currentFlagVersion);
  }, [settings]);

  // Filter icon links based on admin status
  const filteredIconLinks = useMemo(() => {
    return iconLinks.filter(link => link.to !== '/diagnostics' || isAdmin);
  }, [isAdmin]);

  const handleDismissFlag = () => {
    const currentFlagVersion = 'v1.0';
    if (!settings.dismissedHomepageFlags.includes(currentFlagVersion)) {
      const newDismissed = [...settings.dismissedHomepageFlags, currentFlagVersion];
      updateSettings({ dismissedHomepageFlags: newDismissed });
    }
  };

  return (
    <header className="nav-root">
      <div className="nav-inner">
        <div className="nav-left">
          <div className="nav-logo-wrapper">
            <NavLink 
              to="/home" 
              className="nav-logo-mark"
              onClick={handleDismissFlag}
            >
              CLASTONE
            </NavLink>
            {shouldShowHomepageFlag && (
              <NavLink to="/home" className="nav-homepage-flag" onClick={handleDismissFlag}>
                <AnimatedArrow size={16} />
                <span>NEW</span>
              </NavLink>
            )}
            <div className="nav-logo-dropdown">
              <nav className="nav-menu nav-menu-left">
                {mainLinks.map((link) => (
                  <NavItem key={link.to} to={link.to} label={link.label} />
                ))}
              </nav>
              <nav className="nav-menu nav-menu-right">
                {filteredIconLinks.map((link) => (
                  <NavItem key={link.to} to={link.to} label={link.label} />
                ))}
              </nav>
            </div>
          </div>
          {/* Mobile hamburger menu */}
          <button 
            className="nav-mobile-toggle"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <div className="nav-right nav-right-inline">
          <nav className="nav-menu nav-menu-inline">
            {mainLinks.map((link) => (
              <NavItem key={link.to} to={link.to} label={link.label} />
            ))}
            <span className="nav-sep" aria-hidden role="separator" />
            {filteredIconLinks.map((link) => (
              <NavItem
                key={link.to}
                to={link.to}
                label={link.label}
                icon={link.icon}
              />
            ))}
          </nav>
        </div>
        {/* Mobile menu overlay */}
        {isMobileMenuOpen && (
          <div className="nav-mobile-overlay">
            <nav className="nav-mobile-menu">
              {mainLinks.map((link) => (
                <NavItem 
                  key={link.to} 
                  to={link.to} 
                  label={link.label} 
                  onClick={() => setIsMobileMenuOpen(false)}
                />
              ))}
              <span className="nav-sep" aria-hidden role="separator" />
              {filteredIconLinks.map((link) => (
                <NavItem
                  key={link.to}
                  to={link.to}
                  label={link.label}
                  icon={link.icon}
                  onClick={() => setIsMobileMenuOpen(false)}
                />
              ))}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}


type NavItemProps = {
  to: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
};

function NavItem({ to, label, icon: Icon, onClick }: NavItemProps & { onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }: { isActive: boolean }) =>
        ['nav-link', isActive ? 'nav-link-active' : ''].filter(Boolean).join(' ')
      }
      aria-label={label}
      onClick={onClick}
    >
      {Icon ? (
        <Icon size={18} className="nav-link-icon" />
      ) : (
        <span className="nav-link-label">{label}</span>
      )}
    </NavLink>
  );
}

