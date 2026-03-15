import { AppRoutes } from './router';
import { NavBar } from './components/NavBar';
import { useAuth } from './context/AuthContext';
import { FirestoreMoviesGate } from './components/FirestoreMoviesGate';
import { FirestoreTvGate } from './components/FirestoreTvGate';
import { FirestoreWatchlistGate } from './components/FirestoreWatchlistGate';
import { FirestoreSettingsGate } from './components/FirestoreSettingsGate';
import { LoginPage } from './pages/LoginPage';
import { UsernameSetup } from './components/UsernameSetup';
import { DevTools } from './components/DevTools';
import { SyncStatusProvider } from './context/SyncStatusContext';
import { FirestorePeopleGate } from './components/FirestorePeopleGate';
import { FirestoreDirectorsGate } from './components/FirestoreDirectorsGate';
import { FilterProvider } from './state/filterStore';
import { SpotlightBackground } from './components/SpotlightBackground';
import { FriendsProvider } from './context/FriendsContext';
import { useSettingsStore } from './state/settingsStore';
import { useEffect } from 'react';
import './components/SpotlightBackground.css';

// Component to handle CSS custom property for tile size
function TileSizeManager() {
  const { settings } = useSettingsStore();

  useEffect(() => {
    const tileSize = settings.tileViewSize === 'small' ? '100px' : 
                    settings.tileViewSize === 'big' ? '160px' : '120px';
    document.documentElement.style.setProperty('--tile-size', tileSize);
  }, [settings.tileViewSize]);

  return null;
}

function App() {
  const { user, loading, needsUsername } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="app-main-login">
        <LoginPage />
      </main>
    );
  }

  if (needsUsername) {
    return (
      <main className="app-main-login">
        <UsernameSetup />
      </main>
    );
  }

  return (
    <FriendsProvider>
      <SyncStatusProvider>
        <FirestoreSettingsGate>
          <TileSizeManager />
          <FirestoreMoviesGate>
            <FirestoreTvGate>
              <FirestorePeopleGate>
                <FirestoreDirectorsGate>
                  <FirestoreWatchlistGate>
                    <FilterProvider>
                      <SpotlightBackground />
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
    </FriendsProvider>
  );
}

export default App;
