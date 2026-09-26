/**
 * The reminder robot's Firebase session.
 *
 * Spark plan, so no service-account key and no Admin SDK. The server signs in
 * as one ordinary email/password user whose uid the security rules recognise
 * (read schedules, create `sent` entries, prune dead devices; nothing else).
 * Firestore Lite talks REST, which suits short-lived serverless calls.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, inMemoryPersistence, setPersistence, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore/lite';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDNiJkUyCF0HDDx2FhgS40r0bi9r1zoIXw',
  authDomain: 'dueline-app.firebaseapp.com',
  projectId: 'dueline-app',
  appId: '1:544645738623:web:0c80dceb2b2cff7de40f4a',
};

let ready: Promise<{ app: FirebaseApp; db: Firestore }> | null = null;

export function robot(): Promise<{ app: FirebaseApp; db: Firestore }> {
  if (!ready) {
    ready = (async () => {
      const email = process.env.DUELINE_ROBOT_EMAIL;
      const password = process.env.DUELINE_ROBOT_PASSWORD;
      if (!email || !password) throw new Error('Robot credentials are not configured');
      const app = initializeApp(FIREBASE_CONFIG, 'robot');
      const auth = getAuth(app);
      await setPersistence(auth, inMemoryPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      return { app, db: getFirestore(app) };
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}
