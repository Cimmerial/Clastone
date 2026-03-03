import { NavLink } from 'react-router-dom';
import './NavBar.css';

const leftLinks = [
  { to: '/movies', label: 'Movies' },
  { to: '/tv', label: 'TV Shows' },
  { to: '/actors', label: 'Actors' },
  { to: '/directors', label: 'Directors' },
  { to: '/search', label: 'Search' }
];

const rightLinks = [
  { to: '/profile', label: 'Profile' },
  { to: '/settings', label: 'Settings' }
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
                {leftLinks.map((link) => (
                  <NavItem key={link.to} to={link.to} label={link.label} />
                ))}
              </nav>
              <nav className="nav-menu nav-menu-right">
                {rightLinks.map((link) => (
                  <NavItem key={link.to} to={link.to} label={link.label} />
                ))}
              </nav>
            </div>
          </div>
        </div>
        <div className="nav-right nav-right-inline">
          <nav className="nav-menu nav-menu-inline">
            {[...leftLinks, ...rightLinks].map((link) => (
              <NavItem key={link.to} to={link.to} label={link.label} />
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
};

function NavItem({ to, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        ['nav-link', isActive ? 'nav-link-active' : ''].filter(Boolean).join(' ')
      }
    >
      <span className="nav-link-label">{label}</span>
    </NavLink>
  );
}

