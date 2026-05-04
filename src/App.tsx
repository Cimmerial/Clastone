import { Routes, Route, Navigate } from 'react-router-dom';
import { AppRoutes } from './router';
import { NavBar, MobileBottomNav } from './components/NavBar';
import { PublicAppLayout } from './components/PublicAppLayout';
import { useAuth } from './context/AuthContext';
import { FirestoreMoviesGate } from './components/FirestoreMoviesGate';
import { FirestoreTvGate } from './components/FirestoreTvGate';
import { FirestoreWatchlistGate } from './components/FirestoreWatchlistGate';
import { FirestoreSettingsGate } from './components/FirestoreSettingsGate';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { FriendsPage } from './pages/FriendsPage';
import { FriendProfilePage } from './pages/FriendProfilePage';
import { FriendCollectionDetailPage } from './pages/FriendCollectionDetailPage';
import { UsernameSetup } from './components/UsernameSetup';
import { DevTools } from './components/DevTools';
import { SyncStatusProvider } from './context/SyncStatusContext';
import { FirestorePeopleGate } from './components/FirestorePeopleGate';
import { FirestoreDirectorsGate } from './components/FirestoreDirectorsGate';
import { FirestoreListsGate } from './components/FirestoreListsGate';
import { FilterProvider } from './state/filterStore';
import { SpotlightBackground } from './components/SpotlightBackground';
import { FriendsProvider } from './context/FriendsContext';
import { useSettingsStore } from './state/settingsStore';
import { useEffect } from 'react';
import { AppLoading } from './components/AppLoading';
import { ClastoneUsageProvider } from './context/ClastoneUsageContext';
import './components/SpotlightBackground.css';

function TileSizeManager() {
  const { settings } = useSettingsStore();

  useEffect(() => {
    const tileSize =
      settings.tileViewSize === 'small' ? '100px' : settings.tileViewSize === 'big' ? '160px' : '120px';
    document.documentElement.style.setProperty('--tile-size', tileSize);
  }, [settings.tileViewSize]);

  return null;
}

function LoggedInAppShell({
  uid,
  initialUsageMs,
  initialInfoShowClicks,
  initialInfoMovieClicks,
  initialInfoPersonClicks,
  children,
}: {
  uid: string;
  initialUsageMs: number;
  initialInfoShowClicks: number;
  initialInfoMovieClicks: number;
  initialInfoPersonClicks: number;
  children: React.ReactNode;
}) {
  return (
    <ClastoneUsageProvider
      uid={uid}
      initialTotalMs={initialUsageMs}
      initialInfoShowClicks={initialInfoShowClicks}
      initialInfoMovieClicks={initialInfoMovieClicks}
      initialInfoPersonClicks={initialInfoPersonClicks}
    >
      <FriendsProvider>
        <SyncStatusProvider>
          <FirestoreSettingsGate>
            <TileSizeManager />
            <FirestoreMoviesGate>
              <FirestoreTvGate>
                <FirestorePeopleGate>
                  <FirestoreDirectorsGate>
                    <FirestoreWatchlistGate>
                      <FirestoreListsGate>
                        <FilterProvider>
                          <SpotlightBackground />
                          <NavBar />
                          <main className="app-main">
                            {children}
                          </main>
                          <MobileBottomNav />
                          <DevTools />
                        </FilterProvider>
                      </FirestoreListsGate>
                    </FirestoreWatchlistGate>
                  </FirestoreDirectorsGate>
                </FirestorePeopleGate>
              </FirestoreTvGate>
            </FirestoreMoviesGate>
          </FirestoreSettingsGate>
        </SyncStatusProvider>
      </FriendsProvider>
    </ClastoneUsageProvider>
  );
}

function PublicAppShell() {
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
                    <FirestoreListsGate>
                      <FilterProvider>
                        <SpotlightBackground />
                        <Routes>
                          <Route path="/" element={<PublicAppLayout />}>
                            <Route index element={<Navigate to="/login" replace />} />
                            <Route path="login" element={<LoginPage />} />
                            <Route path="home" element={<HomePage />} />
                            <Route path="friends/:friendId" element={<FriendProfilePage />} />
                            <Route path="friends/:friendId/lists/collection/:collectionId" element={<FriendCollectionDetailPage />} />
                            <Route path="friends/:friendId/lists/:listId" element={<FriendCollectionDetailPage />} />
                            <Route path="friends" element={<FriendsPage />} />
                          </Route>
                          <Route path="*" element={<Navigate to="/login" replace />} />
                        </Routes>
                      </FilterProvider>
                    </FirestoreListsGate>
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

function App() {
  const {
    user,
    loading,
    needsUsername,
    clastoneUsageMs,
    infoShowClicks,
    infoMovieClicks,
    infoPersonClicks,
  } = useAuth();

  if (loading) {
    return <AppLoading message="Loading..." />;
  }

  if (!user) {
    return <PublicAppShell />;
  }

  if (needsUsername) {
    return (
      <main className="app-main-login">
        <UsernameSetup />
      </main>
    );
  }

  return (
    <LoggedInAppShell
      uid={user.uid}
      initialUsageMs={clastoneUsageMs}
      initialInfoShowClicks={infoShowClicks}
      initialInfoMovieClicks={infoMovieClicks}
      initialInfoPersonClicks={infoPersonClicks}
    >
      <AppRoutes />
    </LoggedInAppShell>
  );
}

export default App;
