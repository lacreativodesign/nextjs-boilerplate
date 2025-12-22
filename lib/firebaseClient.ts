// lib/firebaseClient.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, doc, getDoc, type Firestore } from "firebase/firestore";

const isBrowser = typeof window !== "undefined";

function createThrowingProxy<T>(message: string): T {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(message);
      },
      apply() {
        throw new Error(message);
      },
    }
  ) as unknown as T;
}

function getConfig() {
  const {
    NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID,
  } = process.env;

  const missing = [
    ["NEXT_PUBLIC_FIREBASE_API_KEY", NEXT_PUBLIC_FIREBASE_API_KEY],
    ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN],
    ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", NEXT_PUBLIC_FIREBASE_PROJECT_ID],
    ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET],
    ["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID],
    ["NEXT_PUBLIC_FIREBASE_APP_ID", NEXT_PUBLIC_FIREBASE_APP_ID],
  ].filter(([, v]) => !v);

  if (missing.length) {
    const msg = `Firebase client config missing: ${missing.map(([k]) => k).join(", ")}.`;
    if (isBrowser) {
      throw new Error(msg);
    }
    // On the server/build, avoid crashing import-time; return null so runtime code can handle it.
    return null;
  }

  return {
    apiKey: NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId: NEXT_PUBLIC_FIREBASE_APP_ID!,
  };
}

let cachedApp: FirebaseApp | null = null;
function getFirebaseApp(): FirebaseApp | null {
  if (cachedApp) return cachedApp;
  if (!isBrowser) return null;

  const config = getConfig();
  if (!config) return null;

  cachedApp = getApps().length ? getApp() : initializeApp(config);
  return cachedApp;
}

export function getFirebaseAuth(): Auth {
  const app = getFirebaseApp();
  if (!app) {
    if (!isBrowser) {
      return createThrowingProxy<Auth>("Firebase client is not configured. Set NEXT_PUBLIC_FIREBASE_* env vars.");
    }
    throw new Error("Firebase client is not configured. Set NEXT_PUBLIC_FIREBASE_* env vars.");
  }
  return getAuth(app);
}

export function getFirebaseDb(): Firestore {
  const app = getFirebaseApp();
  if (!app) {
    if (!isBrowser) {
      return createThrowingProxy<Firestore>("Firebase client is not configured. Set NEXT_PUBLIC_FIREBASE_* env vars.");
    }
    throw new Error("Firebase client is not configured. Set NEXT_PUBLIC_FIREBASE_* env vars.");
  }
  return getFirestore(app);
}

// Backwards-compatible named exports for existing imports
export const auth = getFirebaseAuth();
export const db = getFirebaseDb();

/**
 * CLIENT-SIDE helper – used by login page.
 * Reads role from Firestore "users" collection.
 */
export async function fetchUserRole(uid: string): Promise<string | null> {
  try {
    if (!db) return null;
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const data = snap.data() as any;
    const role = (data.role || "").toString().toLowerCase();
    return role || null;
  } catch (err) {
    console.error("fetchUserRole ERROR:", err);
    return null;
  }
}
