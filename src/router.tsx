import { Route, Routes, Navigate } from 'react-router-dom';
import { MoviesPage } from './pages/MoviesPage';
import { TvShowsPage } from './pages/TvShowsPage';
import { ActorsPage } from './pages/ActorsPage';
import { DirectorsPage } from './pages/DirectorsPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { SearchPage } from './pages/SearchPage';
import { ProfilePage } from './pages/ProfilePage';
import { FriendsPage } from './pages/FriendsPage';
import { QuotesPage } from './pages/QuotesPage';
import { FriendProfilePage } from './pages/FriendProfilePage';
import { FriendMovieCollectionPage } from './pages/FriendMovieCollectionPage';
import { FriendTvCollectionPage } from './pages/FriendTvCollectionPage';
import { FriendCollectionDetailPage } from './pages/FriendCollectionDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { HomePage } from './pages/HomePage';
import { ListsPage, ListDetailPage } from './pages/ListsPage';
import { ReviewsPage } from './pages/ReviewsPage';
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
      <Route path="/lists" element={<ListsPage />} />
      <Route path="/lists/:listId" element={<ListDetailPage />} />
      <Route path="/lists/collection/:collectionId" element={<ListDetailPage />} />
      <Route path="/reviews" element={<ReviewsPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/friends" element={<FriendsPage />} />
      <Route path="/quotes" element={<QuotesPage />} />
      <Route path="/friends/:friendId" element={<FriendProfilePage />} />
      <Route path="/friends/:friendId/collection/movies" element={<FriendMovieCollectionPage />} />
      <Route path="/friends/:friendId/collection/shows" element={<FriendTvCollectionPage />} />
      <Route path="/friends/:friendId/lists/collection/:collectionId" element={<FriendCollectionDetailPage />} />
      <Route path="/friends/:friendId/lists/:listId" element={<FriendCollectionDetailPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route 
        path="/diagnostics" 
        element={isAdmin ? <DiagnosticsPage /> : <Navigate to="/home" replace />} 
      />
      <Route path="*" element={<Navigate to="/movies" replace />} />
    </Routes>
  );
}

