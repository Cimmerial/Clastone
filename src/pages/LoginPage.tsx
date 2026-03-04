import { useAuth } from '../context/AuthContext';
import './LoginPage.css';

export function LoginPage() {
  const { adminLogin, loginError } = useAuth();

  return (
    <section className="login-page">
      <div className="login-card card-surface">
        <h1 className="login-title">Clastone</h1>
        <p className="login-tagline">Admin</p>
        <p className="login-hint">
          Log in as <strong>Cimmerial</strong>. In the project root, open <code>.env</code> and add{' '}
          <code>VITE_ADMIN_PASSWORD=yourpassword</code> (same as in Firebase, at least 6 characters). Restart the dev server after editing .env.
        </p>
        <button
          type="button"
          className="login-btn"
          onClick={adminLogin}
        >
          Admin login
        </button>
        {loginError && <p className="login-error">{loginError}</p>}
      </div>
    </section>
  );
}
