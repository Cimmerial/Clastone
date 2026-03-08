import { AppRoutes } from './router';
import { NavBar } from './components/NavBar';
import { useAuth, hasFirebaseConfig } from './context/AuthContext';
import { FirestoreMoviesGate } from './components/FirestoreMoviesGate';
import { FirestoreTvGate } from './components/FirestoreTvGate';
import { FirestoreWatchlistGate } from './components/FirestoreWatchlistGate';
import { MoviesProvider } from './state/moviesStore';
import { FirestoreSettingsGate } from './components/FirestoreSettingsGate';
import { LoginPage } from './pages/LoginPage';
import { DirectorsPage } from './pages/DirectorsPage';
import { DevTools } from './components/DevTools';
import { TvProvider } from './state/tvStore';
import { WatchlistProvider } from './state/watchlistStore';
import { SyncStatusProvider } from './context/SyncStatusContext';
import { FirestorePeopleGate } from './components/FirestorePeopleGate';
import { PeopleProvider } from './state/peopleStore';
import { FirestoreDirectorsGate } from './components/FirestoreDirectorsGate';
import { DirectorsProvider } from './state/directorsStore';
import { FilterProvider } from './state/filterStore';

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
      <SyncStatusProvider>
        <FirestoreSettingsGate>
          <FirestoreMoviesGate>
            <FirestoreTvGate>
              <FirestorePeopleGate>
                <FirestoreDirectorsGate>
                  <FirestoreWatchlistGate>
                    <FilterProvider>
                      <NavBar />
                      <main className="app-main">
                        <AppRoutes />
                      </main>
                      <DevTools />
                    </FilterProvider>
                  </FirestoreWatchlistGate>
                </FirestoreDirectorsGate>
              </FirestorePeopleGate>
            </FirestoreTvGate>
          </FirestoreMoviesGate>
        </FirestoreSettingsGate>
      </SyncStatusProvider>
    );
  }

  return (
    <SyncStatusProvider>
      <MoviesProvider>
        <TvProvider>
          <PeopleProvider>
            <DirectorsProvider>
              <WatchlistProvider initialMovies={[]} initialTv={[]}>
                <FilterProvider>
                  <NavBar />
                  <main className="app-main">
                    <AppRoutes />
                  </main>
                  <DevTools />
                </FilterProvider>
              </WatchlistProvider>
            </DirectorsProvider>
          </PeopleProvider>
        </TvProvider>
      </MoviesProvider>
    </SyncStatusProvider>
  );
}

export default App;
