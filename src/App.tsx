import { AppRoutes } from './router';
import { NavBar } from './components/NavBar';
import { useAuth, hasFirebaseConfig } from './context/AuthContext';
import { FirestoreMoviesGate } from './components/FirestoreMoviesGate';
import { MoviesProvider } from './state/moviesStore';
import { LoginPage } from './pages/LoginPage';
import { DevTools } from './components/DevTools';

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
        <NavBar />
        <main className="app-main">
          <AppRoutes />
        </main>
        <DevTools />
      </FirestoreMoviesGate>
    );
  }

  return (
    <>
      <MoviesProvider>
        <NavBar />
        <main className="app-main">
          <AppRoutes />
        </main>
        <DevTools />
      </MoviesProvider>
    </>
  );
}

export default App;
