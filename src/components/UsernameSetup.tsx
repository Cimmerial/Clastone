import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Check } from 'lucide-react';
import './UsernameSetup.css';

export function UsernameSetup() {
  const { setUsername, user } = useAuth();
  const [username, setUsernameInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (username.length > 20) {
      setError('Username must be less than 20 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await setUsername(username.trim());
    } catch (err: any) {
      setError(err.message || 'Failed to set username');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="username-setup-root">
      <div className="username-setup-container">
        <div className="username-setup-card">
          <div className="username-setup-header">
            <User size={48} className="username-setup-icon" />
            <h1 className="username-setup-title">Choose Your Username</h1>
            <p className="username-setup-subtitle">
              Your username is how friends will find you
            </p>
          </div>

          <form onSubmit={handleSubmit} className="username-setup-form">
            <div className="username-setup-input-group">
              <input
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsernameInput(e.target.value)}
                required
                minLength={3}
                maxLength={20}
                pattern="[a-zA-Z0-9_]+"
                className="username-setup-input"
                autoFocus
              />
            </div>

            {error && <div className="username-setup-error">{error}</div>}

            <button 
              type="submit" 
              className="username-setup-submit-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span>Setting up...</span>
              ) : (
                <>
                  <Check size={18} />
                  <span>Continue</span>
                </>
              )}
            </button>
          </form>

          <div className="username-setup-requirements">
            <h3>Username Requirements:</h3>
            <ul>
              <li>3-20 characters long</li>
              <li>Letters, numbers, and underscores only</li>
              <li>Must be unique</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
