import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { FcGoogle } from 'react-icons/fc';
import { Mail, Lock, LogIn, UserPlus } from 'lucide-react';
import './LoginPage.css';

export function LoginPage() {
  const { loginWithGoogle, loginWithEmail, signUpWithEmail, loginError } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignUp) {
      await signUpWithEmail(email, password);
    } else {
      await loginWithEmail(email, password);
    }
  };

  return (
    <section className="login-root">
      <div className="login-background-glow top-left"></div>
      <div className="login-background-glow bottom-right"></div>

      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1 className="login-title">Clastone</h1>
            <p className="login-subtitle">
              {isSignUp ? 'Create an account to start ranking' : 'Welcome back'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-input-group">
              <Mail size={18} className="login-input-icon" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="login-input"
              />
            </div>

            <div className="login-input-group">
              <Lock size={18} className="login-input-icon" />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="login-input"
              />
            </div>

            {loginError && <div className="login-error-message">{loginError}</div>}

            <button type="submit" className="login-submit-btn">
              {isSignUp ? (
                <>
                  <UserPlus size={18} />
                  <span>Create Account</span>
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          <div className="login-divider">
            <span>or continue with</span>
          </div>

          <button type="button" className="login-google-btn" onClick={loginWithGoogle}>
            <FcGoogle size={20} />
            <span>Google</span>
          </button>

          <div className="login-footer">
            <p>
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                className="login-toggle-btn"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setEmail('');
                  setPassword('');
                }}
              >
                {isSignUp ? 'Sign In' : 'Create one'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
