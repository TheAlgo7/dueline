/**
 * The app's single source of state: the signed-in person and live snapshots
 * of their documents. Firestore's local cache answers first (instant, works
 * offline), the server catches up behind it.
 */

import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { useSyncExternalStore } from 'react';
import { deviceTimeZone } from '../core/dates';
import { DEFAULT_PROFILE, type Obligation, type OccurrenceDoc, type Payee, type Profile } from '../core/types';
import { auth, db } from './firebase';

export interface State {
  authReady: boolean;
  user: User | null;
  profile: Profile | null;
  obligations: Obligation[];
  occs: Map<string, OccurrenceDoc>;
  payees: Payee[];
  /** First snapshot of obligations has arrived (from cache or server). */
  loaded: boolean;
  /** Last snapshot came from the local cache only. */
  offline: boolean;
  /** Bumped when the auth user changes in place (linked an account). */
  authVersion: number;
}

let state: State = {
  authReady: false,
  user: null,
  profile: null,
  obligations: [],
  occs: new Map(),
  payees: [],
  loaded: false,
  offline: false,
  authVersion: 0,
};

const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function getState(): State {
  return state;
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state));
}

export function uid(): string {
  const u = state.user?.uid;
  if (!u) throw new Error('Not signed in');
  return u;
}

let unsubs: Unsubscribe[] = [];

function stopListening() {
  for (const u of unsubs) u();
  unsubs = [];
}

/**
 * Stop reacting to this account's documents. Called before erasing it: the
 * first-run profile write could otherwise land after the erase and leave an
 * orphan profile behind a deleted account.
 */
export function detachListeners() {
  stopListening();
}

function listen(user: User) {
  stopListening();
  const base = doc(db, 'users', user.uid);
  let createdProfile = false;

  unsubs.push(
    onSnapshot(
      base,
      { includeMetadataChanges: false },
      (snap) => {
        if (!snap.exists()) {
          const now = Date.now();
          const profile: Profile = { ...DEFAULT_PROFILE, tz: deviceTimeZone(), createdAt: now, updatedAt: now };
          // Usable at once (offline first run included); written only once the
          // server confirms there really is no profile yet.
          if (!getState().profile) set({ profile });
          if (!snap.metadata.fromCache && !createdProfile) {
            createdProfile = true;
            setDoc(base, profile).catch(() => (createdProfile = false));
          }
          return;
        }
        set({ profile: { ...DEFAULT_PROFILE, createdAt: 0, updatedAt: 0, ...(snap.data() as Partial<Profile>) } });
      },
      () => undefined,
    ),
  );

  unsubs.push(
    onSnapshot(
      collection(base, 'obligations'),
      (snap) => {
        const obligations = snap.docs.map((d) => ({ ...(d.data() as Obligation), id: d.id }));
        set({ obligations, loaded: true, offline: snap.metadata.fromCache });
      },
      () => set({ loaded: true }),
    ),
  );

  unsubs.push(
    onSnapshot(
      collection(base, 'occurrences'),
      (snap) => {
        set({ occs: new Map(snap.docs.map((d) => [d.id, { ...(d.data() as OccurrenceDoc), id: d.id }])) });
      },
      () => undefined,
    ),
  );

  unsubs.push(
    onSnapshot(
      collection(base, 'payees'),
      (snap) => {
        const payees = snap.docs
          .map((d) => ({ ...(d.data() as Payee), id: d.id }))
          .sort((a, b) => a.name.localeCompare(b.name));
        set({ payees });
      },
      () => undefined,
    ),
  );
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    stopListening();
    set({ authReady: true, user: null, profile: null, obligations: [], occs: new Map(), payees: [], loaded: false });
    return;
  }
  if (state.user?.uid !== user.uid) {
    set({ authReady: true, user, profile: null, obligations: [], occs: new Map(), payees: [], loaded: false });
    listen(user);
  } else {
    set({ authReady: true, user });
  }
});

/** Re-publish after an in-place change to the auth user (link, rename). */
export function refreshUser() {
  const u = auth.currentUser;
  if (u) set({ user: u, authVersion: state.authVersion + 1 });
}
