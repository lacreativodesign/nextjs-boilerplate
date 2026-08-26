// lib/firebaseClient.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  emulators?: {
    authHost: string;
    firestoreHost: string;
    storageHost?: string;
  };
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

function emulatorEndpoint(value: string): { host: string; port: number } {
  const parsed = new URL(`http://${value}`);
  const port = Number(parsed.port);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || !Number.isInteger(port)) {
    throw new Error('Firebase emulator endpoint is not a valid loopback host:port.');
  }
  return { host: parsed.hostname, port };
}

type EmulatorGlobal = typeof globalThis & { __bizostoFirebaseEmulatorsConnected?: boolean };

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
      const db = getFirestore(app);
      const storage = getStorage(app);
      const emulatorGlobal = globalThis as EmulatorGlobal;
      if (config.emulators && !emulatorGlobal.__bizostoFirebaseEmulatorsConnected) {
        const authEndpoint = emulatorEndpoint(config.emulators.authHost);
        const firestoreEndpoint = emulatorEndpoint(config.emulators.firestoreHost);
        connectAuthEmulator(auth, `http://${authEndpoint.host}:${authEndpoint.port}`, {
          disableWarnings: true,
        });
        connectFirestoreEmulator(db, firestoreEndpoint.host, firestoreEndpoint.port);
        if (config.emulators.storageHost) {
          const storageEndpoint = emulatorEndpoint(config.emulators.storageHost);
          connectStorageEmulator(storage, storageEndpoint.host, storageEndpoint.port);
        }
        emulatorGlobal.__bizostoFirebaseEmulatorsConnected = true;
      }
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (err) {
        console.error('Failed to set auth persistence:', err);
      }
      return {
        app,
        auth,
        db,
        storage,
      };
    })().catch((err) => {
      clientsPromise = null;
      throw err;
    });
  }

  return clientsPromise;
}

export function getFirebaseApp(): FirebaseApp {
  if (!isBrowser) {
    throw new Error('Firebase client is only available in the browser.');
  }
  if (getApps().length) {
    return getApp();
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    throw new Error('Firebase public config is incomplete for realtime features.');
  }

  return initializeApp({ apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId });
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
