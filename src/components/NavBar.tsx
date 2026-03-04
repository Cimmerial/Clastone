import { NavLink } from 'react-router-dom';
import { Search, User, Settings } from 'lucide-react';
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
  { to: '/profile', label: 'Profile', icon: User as React.ComponentType<{ size?: number; className?: string }> },
  { to: '/settings', label: 'Settings', icon: Settings as React.ComponentType<{ size?: number; className?: string }> }
];

export function NavBar() {
  return (
    <header className="nav-root">
      <div className="nav-inner">
        <div className="nav-left">
          <div className="nav-logo-wrapper">
            <span className="nav-logo-mark">CLASTONE</span>
            <div className="nav-logo-dropdown">
              <nav className="nav-menu nav-menu-left">
                {mainLinks.map((link) => (
                  <NavItem key={link.to} to={link.to} label={link.label} />
                ))}
              </nav>
              <nav className="nav-menu nav-menu-right">
                {iconLinks.map((link) => (
                  <NavItem key={link.to} to={link.to} label={link.label} />
                ))}
              </nav>
            </div>
          </div>
        </div>
        <div className="nav-right nav-right-inline">
          <nav className="nav-menu nav-menu-inline">
            {mainLinks.map((link) => (
              <NavItem key={link.to} to={link.to} label={link.label} />
            ))}
            <span className="nav-sep" aria-hidden role="separator" />
            {iconLinks.map((link) => (
              <NavItem
                key={link.to}
                to={link.to}
                label={link.label}
                icon={link.icon}
              />
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}

type NavItemProps = {
  to: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
};

function NavItem({ to, label, icon: Icon }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        ['nav-link', isActive ? 'nav-link-active' : ''].filter(Boolean).join(' ')
      }
      aria-label={label}
    >
      {Icon ? (
        <Icon size={18} className="nav-link-icon" />
      ) : (
        <span className="nav-link-label">{label}</span>
      )}
    </NavLink>
  );
}

