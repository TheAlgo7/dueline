import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'firebase/firestore';

/**
 * Public web config (the API key identifies the project; the rules do the
 * securing). Sign-in uses popups, and the firebaseapp.com handler is the one
 * Google's OAuth client trusts out of the box, so no redirect URI setup is
 * needed when Google sign-in is switched on.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyDNiJkUyCF0HDDx2FhgS40r0bi9r1zoIXw',
  authDomain: 'dueline-app.firebaseapp.com',
  projectId: 'dueline-app',
  storageBucket: 'dueline-app.firebasestorage.app',
  messagingSenderId: '544645738623',
  appId: '1:544645738623:web:0c80dceb2b2cff7de40f4a',
};

export const API_BASE = 'https://dueline-api.vercel.app';
export const VAPID_PUBLIC_KEY = 'BI9WEbtgbCjbYxYTKkfskJxiN6DZ20YywWC5kL0Qjinc5DMdpusIAvx2QQO7sRHgwtjkLdSb0BGKWYNQvoai1Ak';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

/**
 * Offline first: Firestore keeps its own IndexedDB copy, so the timeline
 * renders instantly and marking something paid on a bad connection queues
 * and syncs later. The cloud copy stays authoritative for reminders.
 */
function makeDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } catch {
    return initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true });
  }
}

export const db = makeDb();

if (import.meta.env.VITE_EMULATORS === '1') {
  const { connectAuthEmulator } = await import('firebase/auth');
  const { connectFirestoreEmulator } = await import('firebase/firestore');
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
