import { NavLink } from 'react-router-dom';
import { Search, User, Settings, Cloud, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { useSyncStatus, SyncState } from '../context/SyncStatusContext';
import { useMemo } from 'react';
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
            <SyncStatusBubble />
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

function SyncStatusBubble() {
  const { status } = useSyncStatus();

  const overallState: SyncState = useMemo(() => {
    if (status.movies === 'error' || status.tv === 'error' || status.watchlist === 'error') return 'error';
    if (status.movies === 'saving' || status.tv === 'saving' || status.watchlist === 'saving') return 'saving';
    return 'idle';
  }, [status]);

  const totalPending = (status.pendingMovies || 0) +
    (status.pendingTv || 0) +
    (status.pendingWatchlist || 0) +
    (status.pendingSettings || 0) +
    (status.pendingClasses || 0);

  const lastSavedStr = useMemo(() => {
    if (!status.lastSaved) return 'Not saved yet';
    return status.lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [status.lastSaved]);

  return (
    <div className={`nav-sync-bubble nav-sync-${overallState}`}>
      {overallState === 'saving' ? (
        <RefreshCw size={14} className="sync-icon-spin" />
      ) : overallState === 'error' ? (
        <AlertCircle size={14} />
      ) : (
        <Check size={14} />
      )}

      {totalPending > 0 && overallState === 'saving' && (
        <span className="sync-pending-badge">{totalPending}</span>
      )}

      <div className="nav-sync-dropdown">
        <div className="sync-dropdown-header">
          <Cloud size={16} />
          <span>Firebase Status</span>
          <span className={`sync-overall-badge status-${overallState}`}>{overallState}</span>
        </div>
        <div className="sync-dropdown-items">
          <SyncStatusRow
            label="Movies"
            state={status.movies}
            pending={status.pendingMovies}
          />
          <SyncStatusRow
            label="TV Shows"
            state={status.tv}
            pending={status.pendingTv}
          />
          <SyncStatusRow
            label="Watchlist"
            state={status.watchlist}
            pending={status.pendingWatchlist}
          />
          <SyncStatusRow
            label="Settings"
            state={status.settings}
            pending={status.pendingSettings}
          />
          <SyncStatusRow
            label="Class Config"
            state={status.classes}
            pending={status.pendingClasses}
          />
        </div>
        {status.error && (
          <div className="sync-dropdown-error">
            <AlertCircle size={12} />
            <span>{status.error}</span>
          </div>
        )}
        <div className="sync-dropdown-footer">
          <div className="sync-last-saved">Last saved: {lastSavedStr}</div>
          {status.lastSavedLabel && <div className="sync-last-label">{status.lastSavedLabel}</div>}
        </div>
      </div>
    </div>
  );
}

function SyncStatusRow({ label, state, pending }: { label: string; state: SyncState; pending: number }) {
  const icon = state === 'saving' ? <RefreshCw size={12} className="sync-icon-spin" /> :
    state === 'error' ? <AlertCircle size={12} className="status-error" /> :
      <Check size={12} className="status-idle" />;

  return (
    <div className="sync-status-row">
      <span className="status-label">{label}</span>
      <div className="status-info">
        {pending > 0 && <span className="status-pending">({pending} changes)</span>}
        <span className={`status-indicator status-${state}`}>{icon}</span>
      </div>
    </div>
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
      className={({ isActive }: { isActive: boolean }) =>
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

