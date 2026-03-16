import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { FcGoogle } from 'react-icons/fc';
import { Mail, Lock, LogIn, UserPlus, User } from 'lucide-react';
import './LoginPage.css';

export function LoginPage() {
  const { loginWithGoogle, loginWithUsername, signUpWithEmail, loginError } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [glowElements, setGlowElements] = useState<Array<{ id: number; x: number; y: number; color: string; size: number; speedX: number; speedY: number }>>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignUp) {
      await signUpWithEmail(email, password, username);
    } else {
      // Use the unified login function that handles both email and username
      await loginWithUsername(email, password);
    }
  };

  // Initialize random glow elements
  useEffect(() => {
    const colors = [
      '#FF1744', '#00E676', '#00B0FF', '#FFD600', '#E040FB', '#FF6E40',
      '#00E5FF', '#FF4081', '#76FF03', '#FF3D00', '#7C4DFF', '#00C853'
    ];
    const elements = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: Math.random() * 120 - 10,
      y: Math.random() * 120 - 10,
      color: colors[i % colors.length],
      size: 15 + Math.random() * 25,
      speedX: (Math.random() - 0.5) * 0.5,
      speedY: (Math.random() - 0.5) * 0.5
    }));
    setGlowElements(elements);
  }, []);

  // Animate glow elements
  useEffect(() => {
    const interval = setInterval(() => {
      setGlowElements(prev => prev.map(element => {
        let newX = element.x + element.speedX;
        let newY = element.y + element.speedY;
        let newSpeedX = element.speedX;
        let newSpeedY = element.speedY;
        
        // Bounce off edges
        if (newX <= -15 || newX >= 115) {
          newSpeedX = -newSpeedX;
          newX = newX <= -15 ? -15 : 115;
        }
        if (newY <= -15 || newY >= 115) {
          newSpeedY = -newSpeedY;
          newY = newY <= -15 ? -15 : 115;
        }
        
        // Occasionally change direction
        if (Math.random() < 0.02) {
          newSpeedX += (Math.random() - 0.5) * 0.2;
          newSpeedY += (Math.random() - 0.5) * 0.2;
          // Limit speed
          newSpeedX = Math.max(-1, Math.min(1, newSpeedX));
          newSpeedY = Math.max(-1, Math.min(1, newSpeedY));
        }
        
        return {
          ...element,
          x: newX,
          y: newY,
          speedX: newSpeedX,
          speedY: newSpeedY
        };
      }));
    }, 30);

    return () => clearInterval(interval);
  }, []);

  // Track mouse position
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
      }
    };
  }, []);

  return (
    <section className="login-root" ref={containerRef}>
      {/* Random moving glow elements */}
      {glowElements.map(element => (
        <div
          key={element.id}
          className="login-background-glow animated-glow"
          style={{
            left: `${element.x}%`,
            top: `${element.y}%`,
            background: element.color,
            width: `${element.size}vw`,
            height: `${element.size}vw`,
            transform: 'translate(-50%, -50%)'
          }}
        />
      ))}
      
      {/* Cursor-following glow */}
      <div
        className="login-background-glow cursor-glow"
        style={{
          left: `${mousePosition.x}px`,
          top: `${mousePosition.y}px`,
          transform: 'translate(-50%, -50%)'
        }}
      />

      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1 className="login-title">Clastone</h1>
            <p className="login-subtitle">
              {isSignUp ? 'Create an account to start ranking' : 'Welcome back'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {isSignUp && (
              <div className="login-input-group">
                <User size={18} className="login-input-icon" />
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="[a-zA-Z0-9_]+"
                  className="login-input"
                />
              </div>
            )}

            <div className="login-input-group">
              <Mail size={18} className="login-input-icon" />
              <input
                type={isSignUp ? "email" : "text"}
                placeholder={isSignUp ? "Email address" : "Username or Email"}
                value={isSignUp ? email : email}
                onChange={(e) => setEmail(e.target.value)}
                required
                minLength={isSignUp ? undefined : 3}
                maxLength={isSignUp ? undefined : 20}
                pattern={isSignUp ? "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$" : "[a-zA-Z0-9_@.]+"}
                className="login-input"
              />
            </div>

            {!isSignUp && (
              <div className="login-hint">
              </div>
            )}

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
                  setUsername('');
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
