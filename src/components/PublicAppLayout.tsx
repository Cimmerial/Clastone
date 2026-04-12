import { Outlet, useLocation } from 'react-router-dom';
import { PublicNavBar } from './PublicNavBar';

export function PublicAppLayout() {
  const { pathname } = useLocation();
  const isLogin = pathname === '/login';

  return (
    <>
      {!isLogin && <PublicNavBar />}
      {isLogin ? (
        <div className="public-login-route public-login-route--fullscreen">
          <Outlet />
        </div>
      ) : (
        <main className="app-main">
          <Outlet />
        </main>
      )}
    </>
  );
}
