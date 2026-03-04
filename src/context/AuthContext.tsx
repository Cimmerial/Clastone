import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { auth, hasConfig } from '../lib/firebase';

const ADMIN_EMAIL = 'cimmerial@clastone.local';

type AuthState = {
  user: User | null;
  loading: boolean;
  loginError: string | null;
  adminLogin: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!auth);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const adminLogin = useCallback(async () => {
    if (!auth) {
      setLoginError('Firebase is not configured. See SETUP_FIREBASE.md.');
      return;
    }
    setLoginError(null);
    const password =
      (import.meta.env.VITE_ADMIN_PASSWORD as string)?.trim() || '';
    if (password.length < 6) {
      setLoginError(
        'Firebase requires a password of at least 6 characters. Set VITE_ADMIN_PASSWORD in .env (and create the Cimmerial user in Firebase Console).'
      );
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'code' in e
          ? (e as { code: string }).code === 'auth/user-not-found'
            ? 'Admin user not found. Create it in Firebase Console (Authentication → Users → Add user: cimmerial@clastone.local).'
            : (e as { message?: string }).message ?? String(e)
          : String(e);
      setLoginError(msg);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (auth) await firebaseSignOut(auth);
  }, []);

  const value: AuthState = {
    user,
    loading,
    loginError,
    adminLogin,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { hasConfig as hasFirebaseConfig };
