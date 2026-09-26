import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'firebase/firestore';

/**
 * Installed apps can't use sign-in popups (the popup opens in a separate
 * browser tab that never reports back), so they sign in by redirect. Browsers
 * now partition third-party storage, so a redirect only completes when the
 * sign-in handler is on the app's own domain: authDomain = dueline-app.web.app,
 * whose /__/auth/handler Firebase Hosting serves. That needs
 * https://dueline-app.web.app/__/auth/handler in the Google OAuth client's
 * authorized redirect URIs (Google Cloud console, Credentials). Until it is
 * there, SAME_SITE_DEFAULT stays false: popups through firebaseapp.com,
 * which Google already trusts. VITE_SAME_SITE_AUTH=1 forces it on for testing.
 */
const SAME_SITE_DEFAULT = true; // redirect URI added in Google Cloud on 2026-09-26
export const SAME_SITE_AUTH = import.meta.env.VITE_SAME_SITE_AUTH ? import.meta.env.VITE_SAME_SITE_AUTH === '1' : SAME_SITE_DEFAULT;
const HOSTED = /(^|\.)dueline-app\.web\.app$/.test(location.hostname);

/** Public web config: the API key identifies the project; the rules do the securing. */
export const firebaseConfig = {
  apiKey: 'AIzaSyDNiJkUyCF0HDDx2FhgS40r0bi9r1zoIXw',
  authDomain: SAME_SITE_AUTH && HOSTED ? 'dueline-app.web.app' : 'dueline-app.firebaseapp.com',
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
  auth.settings.appVerificationDisabledForTesting = true;
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
