/**
 * Accounts.
 *
 * Google is the front door. Email, phone and Apple are there for people who
 * want them. Anyone can also start as a guest (anonymous auth): fully usable,
 * but tied to one browser. Signing in from a guest links the same uid to the
 * real login, so nothing moves; when that login already has Dueline data,
 * the guest's payments are carried over and the guest is deleted.
 */

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  PhoneAuthProvider,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  signInWithPhoneNumber,
  signInWithRedirect,
  type AuthProvider,
  type ConfirmationResult,
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
import { auth, firebaseConfig } from './firebase';
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
    case 'auth/operation-not-allowed': return 'That sign-in method isn\'t switched on for Dueline yet. Use Google or email.';
    case 'auth/account-exists-with-different-credential': return 'This email already signs in another way. Use that method.';
    case 'auth/invalid-phone-number':
    case 'auth/missing-phone-number': return 'Enter a 10-digit mobile number.';
    case 'auth/invalid-verification-code':
    case 'auth/missing-verification-code': return 'That code isn\'t right. Check the SMS and try again.';
    case 'auth/code-expired': return 'That code expired. Send a new one.';
    case 'auth/quota-exceeded': return 'Too many codes sent today. Try Google or email.';
    case 'auth/captcha-check-failed': return 'The robot check failed. Try again.';
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

const apple = () => {
  const p = new OAuthProvider('apple.com');
  p.addScope('email');
  p.addScope('name');
  return p;
};

const errCode = (e: unknown) => (e as { code?: string })?.code ?? '';

/**
 * Popup sign-in for Google and Apple. A guest is linked in place; if the
 * account already exists, the guest's data moves into it. Where popups
 * can't open (some installed iPhone apps) it falls back to a redirect.
 */
async function oauth(provider: AuthProvider, fromError: (e: never) => AuthCredential | null): Promise<void> {
  const user = auth.currentUser;
  if (user?.isAnonymous) {
    try {
      await linkWithPopup(user, provider);
      await user.reload();
      refreshUser();
      return;
    } catch (e) {
      if (errCode(e) !== 'auth/credential-already-in-use') throw e;
      const credential = fromError(e as never);
      if (!credential) throw e;
      await switchFromGuest(() => signInWithCredential(auth, credential));
      return;
    }
  }
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (errCode(e) === 'auth/popup-blocked' || errCode(e) === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

export function signInWithGoogle(): Promise<void> {
  return oauth(google(), (e) => GoogleAuthProvider.credentialFromError(e));
}

export function signInWithApple(): Promise<void> {
  return oauth(apple(), (e) => OAuthProvider.credentialFromError(e));
}

/* Phone ------------------------------------------------------------------ */

let verifier: RecaptchaVerifier | null = null;

/** The invisible robot check is bound to one element; drop it when that element goes away. */
export function resetPhoneVerifier() {
  try {
    verifier?.clear();
  } catch {
    // Already detached.
  }
  verifier = null;
}

/** Sends the SMS code. `phone` is E.164, e.g. +919812345678. */
export async function sendPhoneCode(phone: string, containerId: string): Promise<ConfirmationResult> {
  if (!verifier) verifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
  const user = auth.currentUser;
  try {
    return user?.isAnonymous ? await linkWithPhoneNumber(user, phone, verifier) : await signInWithPhoneNumber(auth, phone, verifier);
  } catch (e) {
    resetPhoneVerifier();
    throw e;
  }
}

export async function confirmPhoneCode(confirmation: ConfirmationResult, code: string): Promise<void> {
  try {
    await confirmation.confirm(code.trim());
    const u = auth.currentUser;
    if (u) {
      await u.reload();
      refreshUser();
    }
  } catch (e) {
    if (errCode(e) !== 'auth/credential-already-in-use') throw e;
    const credential = PhoneAuthProvider.credentialFromError(e as never);
    if (!credential) throw e;
    await switchFromGuest(() => signInWithCredential(auth, credential));
  }
}

/* Which secondary methods are really usable ------------------------------ */

export interface ProviderStatus {
  apple: boolean;
  phone: boolean;
}

let statusPromise: Promise<ProviderStatus> | null = null;

/**
 * Apple needs web configuration (a Services ID from a paid Apple developer
 * account) and phone needs SMS regions allowed, both in the Firebase
 * console; the enable toggle alone isn't enough. Ask Firebase directly and
 * only show buttons that will work. Neither probe signs anyone in or sends
 * an SMS (the phone probe carries a deliberately invalid robot check).
 */
export function providerStatus(): Promise<ProviderStatus> {
  if (import.meta.env.VITE_EMULATORS === '1') return Promise.resolve({ apple: true, phone: true });
  if (!statusPromise) {
    const api = (path: string, body: object) =>
      fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${firebaseConfig.apiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json() as Promise<{ error?: { message?: string } }>);
    statusPromise = Promise.all([
      api('accounts:createAuthUri', { providerId: 'apple.com', continueUri: `https://${firebaseConfig.authDomain}/__/auth/handler` })
        .then((j) => !j.error)
        .catch(() => false),
      api('accounts:sendVerificationCode', { phoneNumber: '+919000000000', recaptchaToken: 'availability-probe' })
        .then((j) => !/OPERATION_NOT_ALLOWED|BILLING|region/i.test(j.error?.message ?? 'OPERATION_NOT_ALLOWED'))
        .catch(() => false),
    ]).then(([appleOk, phoneOk]) => ({ apple: appleOk, phone: phoneOk }));
  }
  return statusPromise;
}

/** "Google", "Email", "Phone", "Apple" for the signed-in account. */
export function providerLabel(): string {
  const ids = auth.currentUser?.providerData.map((p) => p.providerId) ?? [];
  if (ids.includes('google.com')) return 'Google';
  if (ids.includes('apple.com')) return 'Apple';
  if (ids.includes('phone')) return 'Phone';
  if (ids.includes('password')) return 'Email';
  return 'Guest';
}

/** Finishes a redirect sign-in started on a previous page load, if any. */
export async function completeRedirect(): Promise<void> {
  try {
    await getRedirectResult(auth);
  } catch {
    // Nothing pending, or it failed; the welcome screen lets them retry.
  }
}

/** The next person to sign in on this device starts on Due, not wherever this one left off. */
function homeRoute() {
  if (location.pathname !== '/' || location.search) history.replaceState(null, '', '/');
}

export async function signOutEverywhere(): Promise<void> {
  await disablePush().catch(() => undefined);
  homeRoute();
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
    } else if (user.providerData.some((p) => p.providerId === 'apple.com')) {
      await reauthenticateWithPopup(user, apple());
    }
  }
  await disablePush().catch(() => undefined);
  await eraseAllData();
  homeRoute();
  await deleteUser(user);
}
