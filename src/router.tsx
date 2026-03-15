import { Route, Routes, Navigate } from 'react-router-dom';
import { MoviesPage } from './pages/MoviesPage';
import { TvShowsPage } from './pages/TvShowsPage';
import { ActorsPage } from './pages/ActorsPage';
import { DirectorsPage } from './pages/DirectorsPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { SearchPage } from './pages/SearchPage';
import { ProfilePage } from './pages/ProfilePage';
import { FriendsPage } from './pages/FriendsPage';
import { FriendProfilePage } from './pages/FriendProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { GuidePage } from './pages/GuidePage';
import { HomePage } from './pages/HomePage';
import { useAuth } from './context/AuthContext';

export function AppRoutes() {
  const { isAdmin } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/movies" element={<MoviesPage />} />
      <Route path="/tv" element={<TvShowsPage />} />
      <Route path="/actors" element={<ActorsPage />} />
      <Route path="/directors" element={<DirectorsPage />} />
      <Route path="/watchlist" element={<WatchlistPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/friends" element={<FriendsPage />} />
      <Route path="/friends/:friendId" element={<FriendProfilePage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/guide" element={<GuidePage />} />
      <Route 
        path="/diagnostics" 
        element={isAdmin ? <DiagnosticsPage /> : <Navigate to="/home" replace />} 
      />
      <Route path="*" element={<Navigate to="/movies" replace />} />
    </Routes>
  );
}

