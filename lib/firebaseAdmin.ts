import * as admin from "firebase-admin";

const rawKey = process.env.FIREBASE_ADMIN_KEY || "";
let serviceAccount: any = null;

if (rawKey) {
  try {
    serviceAccount = JSON.parse(rawKey);
  } catch (err) {
    console.warn("Failed to parse FIREBASE_ADMIN_KEY. Using stub credentials for build.", err);
  }
} else {
  console.warn("FIREBASE_ADMIN_KEY not set. Using stub credentials for build.");
}

const hasProject = typeof serviceAccount?.project_id === "string" && serviceAccount.project_id.length > 0;

let app: admin.app.App | null = null;

try {
  if (!admin.apps.length && hasProject) {
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (admin.apps.length) {
    app = admin.app();
  }
} catch (err) {
  console.warn("Firebase admin initialization failed. Falling back to stubbed services.", err);
  app = null;
}

// When credentials are missing, expose throw-on-use stubs so runtime fails loudly
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

const missingAdminMessage = 'Firebase Admin is not configured. Set FIREBASE_ADMIN_KEY with a valid "project_id".';

// Core services
const auth = app ? admin.auth(app) : createThrowingProxy<admin.auth.Auth>(missingAdminMessage);
const db = app ? admin.firestore(app) : createThrowingProxy<admin.firestore.Firestore>(missingAdminMessage);
const storage = app ? admin.storage(app) : createThrowingProxy<admin.storage.Storage>(missingAdminMessage);

// Export in all formats your API routes expect
export const adminAuth = auth;
export const adminDb = db;
export const adminDB = db; // Some routes use this
export const adminStorage = storage;
export const getAdminAuth = () => auth;
export const getAdminDB = () => db;
export const getAdminStorage = () => storage;

export default app;
