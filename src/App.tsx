import { AppRoutes } from './router';
import { NavBar } from './components/NavBar';
import { useAuth, hasFirebaseConfig } from './context/AuthContext';
import { FirestoreMoviesGate } from './components/FirestoreMoviesGate';
import { FirestoreTvGate } from './components/FirestoreTvGate';
import { MoviesProvider } from './state/moviesStore';
import { LoginPage } from './pages/LoginPage';
import { DevTools } from './components/DevTools';
import { TvProvider } from './state/tvStore';

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
          <NavBar />
          <main className="app-main">
            <AppRoutes />
          </main>
          <DevTools />
        </FirestoreTvGate>
      </FirestoreMoviesGate>
    );
  }

  return (
    <>
      <MoviesProvider>
        <TvProvider>
          <NavBar />
          <main className="app-main">
            <AppRoutes />
          </main>
          <DevTools />
        </TvProvider>
      </MoviesProvider>
    </>
  );
}

export default App;
