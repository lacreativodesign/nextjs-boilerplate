// lib/firebase.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth as getAuthFromFirebase, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

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
    NEXT_PUBLIC_FB_API_KEY,
    NEXT_PUBLIC_FB_AUTH_DOMAIN,
    NEXT_PUBLIC_FB_PROJECT_ID,
    NEXT_PUBLIC_FB_STORAGE,
    NEXT_PUBLIC_FB_SENDER_ID,
    NEXT_PUBLIC_FB_APP_ID,
  } = process.env;

  const missing = [
    ["NEXT_PUBLIC_FB_API_KEY", NEXT_PUBLIC_FB_API_KEY],
    ["NEXT_PUBLIC_FB_AUTH_DOMAIN", NEXT_PUBLIC_FB_AUTH_DOMAIN],
    ["NEXT_PUBLIC_FB_PROJECT_ID", NEXT_PUBLIC_FB_PROJECT_ID],
    ["NEXT_PUBLIC_FB_STORAGE", NEXT_PUBLIC_FB_STORAGE],
    ["NEXT_PUBLIC_FB_SENDER_ID", NEXT_PUBLIC_FB_SENDER_ID],
    ["NEXT_PUBLIC_FB_APP_ID", NEXT_PUBLIC_FB_APP_ID],
  ].filter(([, v]) => !v);

  if (missing.length) {
    return null;
  }

  return {
    apiKey: NEXT_PUBLIC_FB_API_KEY!,
    authDomain: NEXT_PUBLIC_FB_AUTH_DOMAIN!,
    projectId: NEXT_PUBLIC_FB_PROJECT_ID!,
    storageBucket: NEXT_PUBLIC_FB_STORAGE!,
    messagingSenderId: NEXT_PUBLIC_FB_SENDER_ID!,
    appId: NEXT_PUBLIC_FB_APP_ID!,
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

export function getAuthClient(): Auth {
  const app = getFirebaseApp();
  if (!app) {
    return createThrowingProxy<Auth>("Firebase client is not configured. Set NEXT_PUBLIC_FB_* env vars.");
  }
  return getAuthFromFirebase(app);
}

export function getDbClient(): Firestore {
  const app = getFirebaseApp();
  if (!app) {
    return createThrowingProxy<Firestore>("Firebase client is not configured. Set NEXT_PUBLIC_FB_* env vars.");
  }
  return getFirestore(app);
}

let _auth: ReturnType<typeof getAuthClient> | null = null;
let _db: ReturnType<typeof getDbClient> | null = null;

export function getAuth() {
  if (!_auth) _auth = getAuthClient();
  return _auth;
}

export function getDb() {
  if (!_db) _db = getDbClient();
  return _db;
}
