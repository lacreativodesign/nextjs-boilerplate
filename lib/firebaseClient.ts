// lib/firebaseClient.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, doc, getDoc, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const isBrowser = typeof window !== "undefined";

let configPromise: Promise<FirebaseClientConfig> | null = null;
async function fetchFirebaseConfig(): Promise<FirebaseClientConfig> {
  if (!isBrowser) {
    throw new Error("Firebase client is only available in the browser.");
  }

  if (!configPromise) {
    configPromise = fetch("/api/public/firebase-config", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || "Unable to load Firebase client configuration.");
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
    throw new Error("Firebase client is only available in the browser.");
  }

  if (!clientsPromise) {
    clientsPromise = (async () => {
      const config = await fetchFirebaseConfig();
      const app = getApps().length ? getApp() : initializeApp(config);
      return {
        app,
        auth: getAuth(app),
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
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const data = snap.data() as any;
    const role = (data.role || "")
      .toString()
      .toLowerCase()
      .replace(/-/g, "_")
      .replace(/^account_manager$/, "am");
    return role || null;
  } catch (err) {
    console.error("fetchUserRole ERROR:", err);
    return null;
  }
}
