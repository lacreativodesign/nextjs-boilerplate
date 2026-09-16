// lib/firebaseClient.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, type Auth } from 'firebase/auth';
import { getFirestore, doc, getDoc, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const isBrowser = typeof window !== 'undefined';

let configPromise: Promise<FirebaseClientConfig> | null = null;
async function fetchFirebaseConfig(): Promise<FirebaseClientConfig> {
  if (!isBrowser) {
    throw new Error('Firebase client is only available in the browser.');
  }

  if (!configPromise) {
    configPromise = fetch('/api/public/firebase-config', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || 'Unable to load Firebase client configuration.');
        }
        return (await res.json()) as FirebaseClientConfig;
      })
      .catch((err) => {
        configPromise = null;
        throw err;
      });
  }

  return configPromise;
}

type FirebaseClients = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
};

let clientsPromise: Promise<FirebaseClients> | null = null;
async function ensureFirebaseClients(): Promise<FirebaseClients> {
  if (!isBrowser) {
    throw new Error('Firebase client is only available in the browser.');
  }

  if (!clientsPromise) {
    clientsPromise = (async () => {
      const config = await fetchFirebaseConfig();
      const app = getApps().length ? getApp() : initializeApp(config);
      const auth = getAuth(app);
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (err) {
        console.error('Failed to set auth persistence:', err);
      }
      return {
        app,
        auth,
        db: getFirestore(app),
        storage: getStorage(app),
      };
    })().catch((err) => {
      clientsPromise = null;
      throw err;
    });
  }

  return clientsPromise;
}

/**
 * The synchronous handle to the app `ensureFirebaseClients()` already created.
 *
 * P0-01: this used to fall back to initialising a SECOND app from the
 * `NEXT_PUBLIC_FIREBASE_*` values inlined into the bundle at build time. That was a
 * complete bypass of the boundary — `/api/public/firebase-config` can refuse to serve a
 * deployment whose Firebase environment is wrong, but inlined constants answer no
 * question and cannot be refused, so a Preview built against the production project would
 * have written to production through this path whatever the server decided.
 *
 * There is now one way for a browser to obtain Firebase configuration, and it is the one
 * the server can say no to. Callers that may run before sign-in should await
 * `waitForFirebase()` first.
 */
export function getFirebaseApp(): FirebaseApp {
  if (!isBrowser) {
    throw new Error('Firebase client is only available in the browser.');
  }
  if (getApps().length) {
    return getApp();
  }

  throw new Error(
    'Firebase has not been initialised yet. Call waitForFirebase() (or any of the async ' +
      'getFirebase* helpers) first: the browser configuration is served by ' +
      '/api/public/firebase-config, which refuses a deployment that breaks the Firebase ' +
      'environment-isolation contract.',
  );
}

export async function getFirebaseAuth(): Promise<Auth> {
  const { auth } = await ensureFirebaseClients();
  return auth;
}

export async function getFirebaseDb(): Promise<Firestore> {
  const { db } = await ensureFirebaseClients();
  return db;
}

export async function getFirebaseStorage(): Promise<FirebaseStorage> {
  const { storage } = await ensureFirebaseClients();
  return storage;
}

export async function waitForFirebase(): Promise<void> {
  await ensureFirebaseClients();
}

/**
 * CLIENT-SIDE helper – used by login page.
 * Reads role from Firestore "users" collection.
 */
export async function fetchUserRole(uid: string): Promise<string | null> {
  try {
    const db = await getFirebaseDb();
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const data = snap.data() as any;
    const role = (data.role || '')
      .toString()
      .toLowerCase()
      .replace(/-/g, '_')
      .replace(/^account_manager$/, 'am');
    return role || null;
  } catch (err) {
    console.error('fetchUserRole ERROR:', err);
    return null;
  }
}
