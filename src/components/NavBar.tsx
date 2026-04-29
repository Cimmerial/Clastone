import { NavLink } from 'react-router-dom';
import { Search, Home, Settings, RefreshCw, Users, Film, Tv, UserRound, Video, Bookmark, MoreHorizontal, X, List, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { tmdbImagePath } from '../lib/tmdb';
import { db } from '../lib/firebase';
import { loadFeatureFeedback } from '../lib/firestoreFeatureFeedback';
import './NavBar.css';

const mainLinks = [
  { to: '/movies', label: 'Movies' },
  { to: '/tv', label: 'TV Shows' },
  { to: '/actors', label: 'Actors' },
  { to: '/directors', label: 'Directors' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/lists', label: 'Lists' }
];

const iconLinks: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/search', label: 'Search', icon: Search },
  { to: '/friends', label: 'People', icon: Users },
  { to: '/profile', label: 'Profile', icon: Home },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/diagnostics', label: 'Diagnostics', icon: RefreshCw },
];

export function NavBar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAdmin, pfpPosterPath, pfpPhotoUrl } = useAuth();
  const [openFeedbackCount, setOpenFeedbackCount] = useState(0);
  const profileNavPhotoUrl = pfpPosterPath ? tmdbImagePath(pfpPosterPath, 'w185') ?? null : pfpPhotoUrl;

  // Filter icon links based on admin status
  const filteredIconLinks = useMemo(() => {
    return iconLinks.filter(link => link.to !== '/diagnostics' || isAdmin);
  }, [isAdmin]);

  const desktopIconLinks = useMemo(
    () => filteredIconLinks.filter((link) => link.to !== '/profile'),
    [filteredIconLinks]
  );

  useEffect(() => {
    if (!isAdmin || !db) {
      setOpenFeedbackCount(0);
      return;
    }
    const firestoreDb = db;
    let cancelled = false;
    const refreshBadge = async () => {
      try {
        const items = await loadFeatureFeedback(firestoreDb);
        if (!cancelled) {
          setOpenFeedbackCount(items.filter((item) => item.status !== 'completed').length);
        }
      } catch {
        if (!cancelled) setOpenFeedbackCount(0);
      }
    };
    void refreshBadge();
    const timer = window.setInterval(() => {
      void refreshBadge();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
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
            {desktopIconLinks.map((link) => (
              <NavItem
                key={link.to}
                to={link.to}
                label={link.label}
                icon={link.icon}
                badgeCount={link.to === '/settings' ? openFeedbackCount : 0}
              />
            ))}
            <NavItem
              to="/profile"
              label="Profile"
              icon={Home}
              profilePhotoUrl={profileNavPhotoUrl}
              isDesktopProfile
            />
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
                  badgeCount={link.to === '/settings' ? openFeedbackCount : 0}
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

const mobileTabLinks: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/movies', label: 'Movies', icon: Film },
  { to: '/tv', label: 'TV', icon: Tv },
  { to: '/actors', label: 'Actors', icon: UserRound },
  { to: '/directors', label: 'Direct.', icon: Video },
  { to: '/watchlist', label: 'Watchlist', icon: Bookmark },
  { to: '/lists', label: 'Lists', icon: List },
];

export function MobileBottomNav() {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const { isAdmin } = useAuth();
  const [openFeedbackCount, setOpenFeedbackCount] = useState(0);

  const filteredIconLinks = useMemo(() => {
    return iconLinks.filter(link => link.to !== '/diagnostics' || isAdmin);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !db) {
      setOpenFeedbackCount(0);
      return;
    }
    const firestoreDb = db;
    let cancelled = false;
    const refreshBadge = async () => {
      try {
        const items = await loadFeatureFeedback(firestoreDb);
        if (!cancelled) {
          setOpenFeedbackCount(items.filter((item) => item.status !== 'completed').length);
        }
      } catch {
        if (!cancelled) setOpenFeedbackCount(0);
      }
    };
    void refreshBadge();
    const timer = window.setInterval(() => {
      void refreshBadge();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
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
                    {to === '/settings' && openFeedbackCount > 0 ? (
                      <span className="mobile-more-badge">{openFeedbackCount}</span>
                    ) : null}
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
  icon?: LucideIcon;
  profilePhotoUrl?: string | null;
  isDesktopProfile?: boolean;
  badgeCount?: number;
};

function NavItem({
  to,
  label,
  icon: Icon,
  profilePhotoUrl,
  isDesktopProfile,
  badgeCount = 0,
  onClick
}: NavItemProps & { onClick?: () => void }) {
  const linkClasses = [
    'nav-link',
    isDesktopProfile ? 'nav-link-profile' : '',
    isDesktopProfile ? 'nav-link-profile-push' : '',
    badgeCount > 0 ? 'nav-link-has-badge' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const isImageProfile = isDesktopProfile && Boolean(profilePhotoUrl);

  return (
    <NavLink
      to={to}
      className={({ isActive }: { isActive: boolean }) =>
        [linkClasses, isActive ? 'nav-link-active' : '', isActive && isDesktopProfile ? 'nav-link-profile-active' : '']
          .filter(Boolean)
          .join(' ')
      }
      aria-label={label}
      onClick={onClick}
    >
      {isImageProfile ? (
        <img src={profilePhotoUrl ?? ''} alt="" className="nav-profile-avatar" />
      ) : Icon ? (
        <>
          <Icon size={18} className="nav-link-icon" />
          {badgeCount > 0 ? <span className="nav-link-badge">{badgeCount}</span> : null}
        </>
      ) : (
        <span className="nav-link-label">{label}</span>
      )}
    </NavLink>
  );
}

