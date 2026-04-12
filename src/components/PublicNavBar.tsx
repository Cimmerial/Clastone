import { NavLink } from 'react-router-dom';
import './PublicNavBar.css';

export function PublicNavBar() {
  return (
    <header className="nav-root nav-root--public">
      <div className="nav-inner nav-inner--public">
        <NavLink to="/home" className="nav-logo-mark">
          CLASTONE
        </NavLink>
        <nav className="nav-public-actions" aria-label="Public navigation">
          <NavLink to="/friends" className="nav-public-link">
            People
          </NavLink>
          <NavLink to="/login" className="nav-public-signin">
            Sign in
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
