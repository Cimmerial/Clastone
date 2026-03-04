import { Route, Routes, Navigate } from 'react-router-dom';
import { MoviesPage } from './pages/MoviesPage';
import { TvShowsPage } from './pages/TvShowsPage';
import { ActorsPage } from './pages/ActorsPage';
import { DirectorsPage } from './pages/DirectorsPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { SearchPage } from './pages/SearchPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/movies" replace />} />
      <Route path="/movies" element={<MoviesPage />} />
      <Route path="/tv" element={<TvShowsPage />} />
      <Route path="/actors" element={<ActorsPage />} />
      <Route path="/directors" element={<DirectorsPage />} />
      <Route path="/watchlist" element={<WatchlistPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/movies" replace />} />
    </Routes>
  );
}

