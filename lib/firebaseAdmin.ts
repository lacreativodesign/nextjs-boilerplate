import * as admin from 'firebase-admin';
import {
  describeFirebaseEnvironmentViolations,
  evaluateFirebaseEnvironment,
  isNonRuntimePhase,
} from './firebase/environment.mjs';

const rawKey = process.env.FIREBASE_ADMIN_KEY || '';
let serviceAccount: any = null;

if (rawKey) {
  try {
    serviceAccount = JSON.parse(rawKey);
  } catch (err) {
    console.warn('Failed to parse FIREBASE_ADMIN_KEY. Using stub credentials for build.', err);
  }
} else {
  console.warn('FIREBASE_ADMIN_KEY not set. Using stub credentials for build.');
}

const hasProject =
  typeof serviceAccount?.project_id === 'string' && serviceAccount.project_id.length > 0;

/**
 * P0-01 — the Admin SDK will not hand out a client for a deployment that breaks the
 * Firebase environment-isolation contract.
 *
 * `instrumentation.register()` already refuses to boot such a runtime, so in practice
 * nothing reaches this line. That is exactly why it is here: the boot gate is one call in
 * one file, and the thing it protects is credentials that can delete a customer's data. A
 * Preview holding a production service account must not get a writable Firestore handle
 * because a future edit moved, reordered or conditionalised that call.
 *
 * Two deliberate exemptions:
 *   - `isNonRuntimePhase` — `next build` and jest, where the secrets are legitimately
 *     absent and the app is intentionally buildable with stubs. Unchanged behaviour.
 *   - the emulator branch below, which is not reached from here: an emulator target writes
 *     to a local process and cannot touch a real project, so it is the SAFE way to prove a
 *     write boundary rather than something to block.
 */
const isolationFailure = isNonRuntimePhase()
  ? null
  : describeFirebaseEnvironmentViolations(evaluateFirebaseEnvironment());

let app: admin.app.App | null = null;

try {
  if (!admin.apps.length && process.env.FIRESTORE_EMULATOR_HOST) {
    app = admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || 'demo-bizosto',
    });
  } else if (isolationFailure) {
    console.error(isolationFailure);
  } else if (!admin.apps.length && hasProject) {
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (admin.apps.length) {
    app = admin.app();
  }
} catch (err) {
  console.warn('Firebase admin initialization failed. Falling back to stubbed services.', err);
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
  isolationFailure ||
  'Firebase Admin is not configured. Set FIREBASE_ADMIN_KEY with a valid "project_id".';

const auth = app ? admin.auth(app) : createThrowingProxy<admin.auth.Auth>(missingAdminMessage);
const firestoreDb = app
  ? admin.firestore(app)
  : createThrowingProxy<admin.firestore.Firestore>(missingAdminMessage);
const storage = app
  ? admin.storage(app)
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
