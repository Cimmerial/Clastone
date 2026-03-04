import { AppRoutes } from './router';
import { NavBar } from './components/NavBar';
import { useAuth, hasFirebaseConfig } from './context/AuthContext';
import { FirestoreMoviesGate } from './components/FirestoreMoviesGate';
import { FirestoreTvGate } from './components/FirestoreTvGate';
import { FirestoreWatchlistGate } from './components/FirestoreWatchlistGate';
import { MoviesProvider } from './state/moviesStore';
import { LoginPage } from './pages/LoginPage';
import { DevTools } from './components/DevTools';
import { TvProvider } from './state/tvStore';
import { WatchlistProvider } from './state/watchlistStore';

function App() {
  const { user, loading } = useAuth();
  const useAuthFlow = hasFirebaseConfig;

  if (useAuthFlow && loading) {
    return (
      <div className="app-loading">
        <p>Loading…</p>
      </div>
    );
  }

  if (useAuthFlow && !user) {
    return (
      <main className="app-main">
        <LoginPage />
      </main>
    );
  }

  if (useAuthFlow && user) {
    return (
      <FirestoreMoviesGate>
        <FirestoreTvGate>
          <FirestoreWatchlistGate>
            <NavBar />
            <main className="app-main">
              <AppRoutes />
            </main>
            <DevTools />
          </FirestoreWatchlistGate>
        </FirestoreTvGate>
      </FirestoreMoviesGate>
    );
  }

  return (
    <>
      <MoviesProvider>
        <TvProvider>
          <WatchlistProvider initialMovies={[]} initialTv={[]}>
            <NavBar />
            <main className="app-main">
              <AppRoutes />
            </main>
            <DevTools />
          </WatchlistProvider>
        </TvProvider>
      </MoviesProvider>
    </>
  );
}

export default App;
