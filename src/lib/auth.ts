/**
 * Accounts.
 *
 * Anyone can start as a guest (anonymous auth): the app is fully usable and
 * reminders work, but the data belongs to this one browser. Saving it with
 * email (or Google, once enabled) links the same uid to a real login, so
 * nothing moves. When the login already has Dueline data, the guest's
 * payments are carried over and the guest is deleted.
 */

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  getRedirectResult,
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type AuthCredential,
  type UserCredential,
} from 'firebase/auth';
import { auth } from './firebase';
import { copyInto, eraseAllData } from './actions';
import { getState, refreshUser } from './store';
import { disablePush } from './push';

export function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email': return 'That email address doesn\'t look right.';
    case 'auth/missing-password':
    case 'auth/weak-password': return 'Use at least 6 characters for the password.';
    case 'auth/email-already-in-use': return 'That email already has a Dueline account. Sign in instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Email or password is wrong.';
    case 'auth/too-many-requests': return 'Too many tries. Wait a minute and try again.';
    case 'auth/network-request-failed': return 'No connection. Try again when you\'re online.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return 'Sign-in was closed before it finished.';
    case 'auth/popup-blocked': return 'The browser blocked the sign-in window. Allow pop-ups and try again.';
    case 'auth/operation-not-allowed': return 'Google sign-in isn\'t switched on for Dueline yet. Use email for now.';
    case 'auth/unauthorized-domain': return 'Sign-in isn\'t allowed from this address.';
    case 'auth/requires-recent-login': return 'Please sign in again first.';
    default: return 'Something went wrong. Try again.';
  }
}

export async function startGuest(): Promise<void> {
  await signInAnonymously(auth);
}

function guestSnapshot() {
  const s = getState();
  return { obligations: s.obligations, occs: [...s.occs.values()], payees: s.payees };
}

/**
 * Leaves a guest session for an existing account, carrying the guest's data.
 * The guest's documents and auth user are removed first; if the sign-in then
 * fails, the data is restored into a fresh guest so nothing is lost.
 */
async function switchFromGuest(signIn: () => Promise<UserCredential>): Promise<void> {
  const guest = auth.currentUser;
  const snap = guestSnapshot();
  const hasData = snap.obligations.length > 0 || snap.payees.length > 0;
  if (guest?.isAnonymous) {
    if (hasData) await eraseAllData().catch(() => undefined);
    await deleteUser(guest).catch(() => undefined);
  }
  let cred: UserCredential;
  try {
    cred = await signIn();
  } catch (e) {
    if (guest?.isAnonymous && hasData) {
      const g = await signInAnonymously(auth);
      await copyInto(g.user.uid, snap);
    }
    throw e;
  }
  if (hasData) await copyInto(cred.user.uid, snap);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const signIn = () => signInWithEmailAndPassword(auth, email.trim(), password);
  if (auth.currentUser?.isAnonymous) await switchFromGuest(signIn);
  else await signIn();
}

/** New account. A guest is upgraded in place (same uid, same data). */
export async function createAccount(email: string, password: string): Promise<void> {
  const user = auth.currentUser;
  if (user?.isAnonymous) {
    await linkWithCredential(user, EmailAuthProvider.credential(email.trim(), password));
    await user.reload();
    refreshUser();
    return;
  }
  await createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

const google = () => {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
};

export async function signInWithGoogle(): Promise<void> {
  const user = auth.currentUser;
  if (user?.isAnonymous) {
    try {
      await linkWithPopup(user, google());
      await user.reload();
      refreshUser();
      return;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/credential-already-in-use') throw e;
      const credential = GoogleAuthProvider.credentialFromError(e as never) as AuthCredential | null;
      if (!credential) throw e;
      await switchFromGuest(() => signInWithCredential(auth, credential));
      return;
    }
  }
  await signInWithPopup(auth, google());
}

/** Finishes a redirect sign-in started on a previous page load, if any. */
export async function completeRedirect(): Promise<void> {
  try {
    await getRedirectResult(auth);
  } catch {
    // Nothing pending, or it failed; the welcome screen lets them retry.
  }
}

export async function signOutEverywhere(): Promise<void> {
  await disablePush().catch(() => undefined);
  await signOut(auth);
}

/**
 * Deletes every document, then the login itself. Firebase asks for a recent
 * sign-in before deleting an account; email accounts pass their password,
 * Google accounts get a popup.
 */
export async function deleteAccount(password?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  if (!user.isAnonymous) {
    const hasPassword = user.providerData.some((p) => p.providerId === 'password');
    if (hasPassword && user.email && password) {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    } else if (user.providerData.some((p) => p.providerId === 'google.com')) {
      await reauthenticateWithPopup(user, google());
    }
  }
  await disablePush().catch(() => undefined);
  await eraseAllData();
  await deleteUser(user);
}
