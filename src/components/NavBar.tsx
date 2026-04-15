import { NavLink } from 'react-router-dom';
import { Search, Home, Settings, RefreshCw, Users, Film, Tv, UserRound, Video, Bookmark, MoreHorizontal, X, List } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './NavBar.css';

const mainLinks = [
  { to: '/movies', label: 'Movies' },
  { to: '/tv', label: 'TV Shows' },
  { to: '/actors', label: 'Actors' },
  { to: '/directors', label: 'Directors' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/lists', label: 'Lists' }
];

const iconLinks = [
  { to: '/search', label: 'Search', icon: Search as React.ComponentType<{ size?: number; className?: string }> },
  { to: '/friends', label: 'People', icon: Users as React.ComponentType<{ size?: number; className?: string }> },
  { to: '/profile', label: 'Profile', icon: Home as React.ComponentType<{ size?: number; className?: string }> },
  { to: '/settings', label: 'Settings', icon: Settings as React.ComponentType<{ size?: number; className?: string }> },
  { to: '/diagnostics', label: 'Diagnostics', icon: RefreshCw as React.ComponentType<{ size?: number; className?: string }> },
];

export function NavBar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAdmin } = useAuth();

  // Filter icon links based on admin status
  const filteredIconLinks = useMemo(() => {
    return iconLinks.filter(link => link.to !== '/diagnostics' || isAdmin);
  }, [isAdmin]);

  return (
    <header className="nav-root">
      <div className="nav-inner">
        <div className="nav-left">
          <div className="nav-logo-wrapper">
            <NavLink 
              to="/home" 
              className="nav-logo-mark"
            >
              CLASTONE
            </NavLink>
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
          {/* Mobile hamburger — hidden on mobile, bottom tab bar is used instead */}
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
        {/* Mobile "More" overlay — shown when More tab is tapped */}
        {isMobileMenuOpen && (
          <div className="nav-mobile-more-overlay" onClick={() => setIsMobileMenuOpen(false)}>
            <nav className="nav-mobile-more-menu" onClick={(e) => e.stopPropagation()}>
              <div className="nav-mobile-more-header">
                <span className="nav-mobile-more-title">More</span>
                <button className="nav-mobile-more-close" onClick={() => setIsMobileMenuOpen(false)} aria-label="Close">
                  <X size={18} />
                </button>
              </div>
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

const mobileTabLinks = [
  { to: '/movies', label: 'Movies', icon: Film as React.ComponentType<{ size?: number }> },
  { to: '/tv', label: 'TV', icon: Tv as React.ComponentType<{ size?: number }> },
  { to: '/actors', label: 'Actors', icon: UserRound as React.ComponentType<{ size?: number }> },
  { to: '/directors', label: 'Direct.', icon: Video as React.ComponentType<{ size?: number }> },
  { to: '/watchlist', label: 'Watchlist', icon: Bookmark as React.ComponentType<{ size?: number }> },
  { to: '/lists', label: 'Lists', icon: List as React.ComponentType<{ size?: number }> },
];

export function MobileBottomNav() {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const { isAdmin } = useAuth();

  const filteredIconLinks = useMemo(() => {
    return iconLinks.filter(link => link.to !== '/diagnostics' || isAdmin);
  }, [isAdmin]);

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {mobileTabLinks.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              ['mobile-tab', isActive ? 'mobile-tab-active' : ''].filter(Boolean).join(' ')
            }
            aria-label={label}
          >
            <Icon size={22} />
            <span className="mobile-tab-label">{label}</span>
          </NavLink>
        ))}
        <button
          className="mobile-tab"
          onClick={() => setIsMoreOpen(true)}
          aria-label="More options"
        >
          <MoreHorizontal size={22} />
          <span className="mobile-tab-label">More</span>
        </button>
      </nav>

      {isMoreOpen && (
        <div className="mobile-more-backdrop" onClick={() => setIsMoreOpen(false)}>
          <div className="mobile-more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-more-handle" />
            <div className="mobile-more-grid">
              {filteredIconLinks.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    ['mobile-more-item', isActive ? 'mobile-more-item-active' : ''].filter(Boolean).join(' ')
                  }
                  onClick={() => setIsMoreOpen(false)}
                  aria-label={label}
                >
                  <div className="mobile-more-icon">
                    <Icon size={24} />
                  </div>
                  <span className="mobile-more-label">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
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

