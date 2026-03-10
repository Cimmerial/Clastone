// Debug script to check Firebase setup and users
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

// Your Firebase config (should match .env)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

console.log('Testing Firebase setup...');

try {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  
  console.log('Firebase app initialized');
  
  // Test reading users collection
  const usersQuery = query(collection(db, 'users'));
  const snapshot = await getDocs(usersQuery);
  
  console.log('Users in database:', snapshot.size);
  snapshot.docs.forEach(doc => {
    console.log('User:', doc.data());
  });
  
} catch (error) {
  console.error('Firebase setup error:', error);
}
