import * as admin from 'firebase-admin';
import {
  assertFirebaseProjectIsolation,
  isFirebaseEmulatorMode,
  isNonRuntimePhase,
  parseServiceAccountProjectId,
} from '@/lib/config/firebase-environment';

const rawKey = process.env.FIREBASE_ADMIN_KEY || '';
const adminProjectId = parseServiceAccountProjectId(rawKey);
const emulatorMode = isFirebaseEmulatorMode(process.env);
const effectiveProjectId =
  adminProjectId || (emulatorMode ? process.env.FIREBASE_EXPECTED_PROJECT_ID || '' : '');

let serviceAccount: Record<string, unknown> | null = null;
if (rawKey) {
  try {
    serviceAccount = JSON.parse(rawKey) as Record<string, unknown>;
  } catch {
    // Never log the credential or parser input. Runtime fails closed below; build and
    // tests receive throwing proxies so static compilation can still complete.
    console.warn('[firebase-admin] FIREBASE_ADMIN_KEY is not valid JSON.');
  }
}

// This is the mandatory environment boundary. In preview, missing production metadata
// also fails: without knowing the production project, separation cannot be proved.
const isolation = assertFirebaseProjectIsolation(process.env, effectiveProjectId);
const mayInitializeAdmin = isolation.safe && (!isNonRuntimePhase(process.env) || emulatorMode);

let app: admin.app.App | null = null;

try {
  if (!mayInitializeAdmin) {
    app = null;
  } else if (admin.apps.length > 0) {
    app = admin.app();
    const initializedProjectId = String(app.options.projectId || '').trim();
    if (!initializedProjectId) {
      throw new Error('Existing Firebase Admin app has no explicit project ID.');
    }
    assertFirebaseProjectIsolation(process.env, initializedProjectId || effectiveProjectId);
    if (initializedProjectId && adminProjectId && initializedProjectId !== adminProjectId) {
      throw new Error('Existing Firebase Admin app does not match FIREBASE_ADMIN_KEY project.');
    }
  } else if (serviceAccount && adminProjectId) {
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      // Pin options.projectId explicitly so a reused Admin app can be verified later.
      projectId: adminProjectId,
      ...(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
        ? { storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET }
        : {}),
    });
  } else if (emulatorMode && effectiveProjectId) {
    // Emulator hosts are honored by the Admin SDK. No credential is used, and the
    // demo-* project requirement above prevents an accidental real-project fallback.
    app = admin.initializeApp({ projectId: effectiveProjectId });
  }
} catch {
  if (!isNonRuntimePhase(process.env)) {
    throw new Error('Firebase Admin initialization failed (FIREBASE_ADMIN_INITIALIZATION_FAILED).');
  }
  console.warn('[firebase-admin] Initialization skipped during build/test.');
  app = null;
}

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
    },
  ) as unknown as T;
}

const missingAdminMessage =
  'Firebase Admin is unavailable. Configure the Firebase project-isolation variables and FIREBASE_ADMIN_KEY.';

const auth = app ? admin.auth(app) : createThrowingProxy<admin.auth.Auth>(missingAdminMessage);
const firestoreDb = app
  ? admin.firestore(app)
  : createThrowingProxy<admin.firestore.Firestore>(missingAdminMessage);
const storage = app
  ? emulatorMode && !process.env.FIREBASE_STORAGE_EMULATOR_HOST
    ? createThrowingProxy<admin.storage.Storage>(
        'Firebase Storage is unavailable until FIREBASE_STORAGE_EMULATOR_HOST is configured.',
      )
    : admin.storage(app)
  : createThrowingProxy<admin.storage.Storage>(missingAdminMessage);

export const adminAuth = auth;
export const adminDb = firestoreDb;
export const adminDB = firestoreDb;
export const adminStorage = storage;
export const db = firestoreDb;
export const getAdminAuth = () => auth;
export const getAdminDB = () => firestoreDb;
export const getAdminStorage = () => storage;

export default app;
