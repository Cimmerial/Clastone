import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  updateProfile
} from 'firebase/auth';
import { auth, hasConfig } from '../lib/firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

const ADMIN_EMAIL = 'cimmerial@clastone.local';

type AuthState = {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  loginError: string | null;
  username: string | null;
  needsUsername: boolean;
  adminLogin: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  loginWithUsername: (username: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, username: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  setUsername: (username: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(!!auth);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAdmin(u?.email === ADMIN_EMAIL);
      
      if (u) {
        const userDoc = await getDoc(doc(db!, 'users', u.uid));
        const userData = userDoc.data();
        const userUsername = userData?.username;
        
        if (userUsername) {
          setUsername(userUsername);
          setNeedsUsername(false);
        } else {
          setNeedsUsername(true);
        }
      } else {
        setUsername(null);
        setNeedsUsername(false);
      }
      
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

  const loginWithEmail = useCallback(async (email: string, pass: string) => {
    if (!auth) {
      setLoginError('Firebase not configured.');
      return;
    }
    setLoginError(null);
    try {
      console.log('Attempting email login for:', email);
      await signInWithEmailAndPassword(auth, email, pass);
      console.log('Email login successful');
    } catch (e: any) {
      console.error('Email login error:', e);
      if (e.code === 'auth/invalid-credential') {
        setLoginError('Invalid email or password');
      } else if (e.code === 'auth/user-not-found') {
        setLoginError('Account not found');
      } else if (e.code === 'auth/invalid-email') {
        setLoginError('Invalid email format');
      } else {
        setLoginError(e.message || String(e));
      }
    }
  }, []);

  const loginWithUsername = useCallback(async (username: string, pass: string) => {
    if (!auth || !db) {
      setLoginError('Firebase not configured.');
      return;
    }
    setLoginError(null);
    try {
      console.log('Attempting login for:', username);
      
      // Check if it's an email or username based on format
      const isEmail = username.includes('@');
      
      if (isEmail) {
        // Direct email login
        console.log('Detected email, using direct login');
        await signInWithEmailAndPassword(auth, username, pass);
      } else {
        // Username lookup
        console.log('Detected username, looking up email');
        const usersQuery = query(
          collection(db, 'users'),
          where('username', '==', username)
        );
        const snapshot = await getDocs(usersQuery);
        
        console.log('Found users:', snapshot.size);
        
        if (snapshot.empty) {
          setLoginError('Username not found');
          return;
        }
        
        const userDoc = snapshot.docs[0];
        const email = userDoc.data().email;
        console.log('Found email for username:', email);
        
        // Login with the found email
        await signInWithEmailAndPassword(auth, email, pass);
      }
      console.log('Login successful');
    } catch (e: any) {
      console.error('Login error:', e);
      if (e.code === 'auth/invalid-credential') {
        setLoginError('Invalid username/email or password');
      } else if (e.code === 'auth/user-not-found') {
        setLoginError('Account not found');
      } else if (e.code === 'permission-denied') {
        setLoginError('Permission denied. Check Firebase rules.');
      } else {
        setLoginError(e.message || String(e));
      }
    }
  }, []);

  const signUpWithEmail = useCallback(async (email: string, pass: string, username: string) => {
    if (!auth || !db) {
      setLoginError('Firebase not configured.');
      return;
    }
    setLoginError(null);
    try {
      // Check if username is already taken
      const usernameQuery = query(
        collection(db, 'users'),
        where('username', '==', username)
      );
      const usernameSnapshot = await getDocs(usernameQuery);
      
      if (!usernameSnapshot.empty) {
        setLoginError('Username is already taken');
        return;
      }
      
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(userCredential.user, { displayName: username });
      await setDoc(doc(db!, 'users', userCredential.user.uid), {
        username,
        email,
        createdAt: new Date().toISOString()
      });
      setUsername(username);
      setNeedsUsername(false);
    } catch (e: any) {
      setLoginError(e.message || String(e));
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    if (!auth) {
      setLoginError('Firebase not configured.');
      return;
    }
    setLoginError(null);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      if (result.user && db) {
        const userDoc = await getDoc(doc(db!, 'users', result.user.uid));
        if (!userDoc.exists()) {
          setNeedsUsername(true);
        }
      }
    } catch (e: any) {
      setLoginError(e.message || String(e));
    }
  }, []);

  const setUsernameCallback = useCallback(async (newUsername: string) => {
    if (!auth?.currentUser || !db) {
      setLoginError('User not authenticated or Firebase not configured.');
      return;
    }
    setLoginError(null);
    try {
      await updateProfile(auth.currentUser, { displayName: newUsername });
      await setDoc(doc(db!, 'users', auth.currentUser.uid), {
        username: newUsername,
        email: auth.currentUser.email,
        createdAt: new Date().toISOString()
      });
      setUsername(newUsername);
      setNeedsUsername(false);
    } catch (e: any) {
      setLoginError(e.message || String(e));
    }
  }, []);

  const signOut = useCallback(async () => {
    if (auth) await firebaseSignOut(auth);
  }, []);

  const value: AuthState = {
    user,
    isAdmin,
    loading,
    loginError,
    username,
    needsUsername,
    adminLogin,
    loginWithEmail,
    loginWithUsername,
    signUpWithEmail,
    loginWithGoogle,
    setUsername: setUsernameCallback,
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
